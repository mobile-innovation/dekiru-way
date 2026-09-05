import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminUser } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api";
import { createAdminSessionToken, verifyAdminSessionToken } from "@/lib/admin/session-token";

export { hashPassword, verifyPassword } from "@/lib/admin/password";
export { createAdminSessionToken, verifyAdminSessionToken } from "@/lib/admin/session-token";

/**
 * 管理画面 (モデレーション) 専用の認証。
 * アプリ利用者の Auth.js セッションとは完全に分離する:
 *   - 別 cookie (`admin_session`)
 *   - メール + パスワード (scrypt ハッシュを admin_users に保存)
 *   - セッションは AUTH_SECRET で署名した自前トークン (HttpOnly / SameSite=Lax)
 * ガードは middleware ではなくサーバーコンポーネント layout と各 API ハンドラで行う
 * (`/me` と同じ方針。Node ランタイムで Prisma を使うため)。
 */

export const ADMIN_COOKIE = "admin_session";

// ---- cookie 読み書き ----

export async function setAdminSessionCookie(admin: Pick<AdminUser, "id" | "email">): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, createAdminSessionToken(admin), {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: env.auth.adminSessionTtlHours * 3600,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

/** cookie を検証し、有効なら該当 AdminUser を返す。無効・失効・無効化済みは null。 */
export async function getAdminSession(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const payload = verifyAdminSessionToken(token);
  if (!payload) return null;
  const admin = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
  if (!admin || !admin.isActive) return null;
  return admin;
}

/** サーバーコンポーネント (layout / page) 用。未ログインは /admin/login へ。 */
export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** ルートハンドラ用。未ログインは 401。 */
export async function requireAdminApi(): Promise<AdminUser> {
  const admin = await getAdminSession();
  if (!admin) throw new ApiError("unauthorized", "管理者ログインが必要です");
  return admin;
}
