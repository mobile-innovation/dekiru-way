import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { AUTH_COOKIE_NAME } from "@/auth";
import { resetBotGuard } from "@/lib/bot-guard";
import { resetAccessLog } from "@/lib/access-log";

/**
 * 開発 / E2E 専用のモックログイン。
 * `E2E_TEST_LOGIN=true` のときだけ有効。本番ではこの変数を設定しないこと (README 参照)。
 *
 * POST /api/test/login  body: { sub?: string, name?: string }
 *   → users を upsert し、Auth.js 互換のセッション Cookie を発行する。
 * DELETE /api/test/login → Cookie を破棄。
 */

function disabled() {
  return NextResponse.json(
    { error: { code: "not_found", message: "not found" } },
    { status: 404 },
  );
}

export async function POST(req: Request) {
  if (!env.e2eTestLogin) return disabled();

  let body: { sub?: string; name?: string } = {};
  try {
    body = await req.json();
  } catch {
    // 空ボディを許容
  }
  const sub = `e2e:${(body.sub ?? "user-1").slice(0, 40)}`;
  const name = (body.name ?? "テストユーザー").slice(0, 60);

  const user = await prisma.user.upsert({
    where: { googleSub: sub },
    create: { googleSub: sub, displayName: name },
    update: { displayName: name },
  });

  const token = await encode({
    token: { uid: user.id, name: user.displayName, sub: user.id },
    secret: env.auth.secret,
    salt: AUTH_COOKIE_NAME,
    maxAge: 60 * 60 * 24 * 30,
  });

  const res = NextResponse.json({ id: user.id, displayName: user.displayName });
  res.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  if (!env.e2eTestLogin) return disabled();
  // Bot ガード / アクセスログの状態もリセット (E2E の隔離用)
  resetBotGuard();
  resetAccessLog();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
