import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api";

/**
 * 管理セッショントークン (AUTH_SECRET で HMAC-SHA256 署名した自前トークン)。
 * `<base64url(JSON payload)>.<base64url(hmac)>`
 *
 * next/headers を import しないリーフモジュール (単体テスト可)。
 */

export interface AdminSessionPayload {
  sub: string; // AdminUser.id
  email: string;
  exp: number; // epoch 秒
}

function sign(data: string, key: string): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

/**
 * トークン発行は `handle()` で包まれた API ルート (POST /api/admin/login) からしか呼ばない。
 * AUTH_SECRET 未設定はここで明示的に落とし、呼び出し側に 500 として返す。
 */
export function createAdminSessionToken(admin: { id: string; email: string }): string {
  if (!env.auth.secret) {
    throw new ApiError("internal", "AUTH_SECRET が未設定のため管理画面を利用できません");
  }
  const payload: AdminSessionPayload = {
    sub: admin.id,
    email: admin.email,
    exp: Math.floor(Date.now() / 1000) + env.auth.adminSessionTtlHours * 3600,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body, env.auth.secret)}`;
}

/**
 * cookie の検証。サーバーコンポーネント (layout / page) からも呼ばれるため、
 * ここで例外を投げない — AUTH_SECRET 未設定・改ざん・期限切れは区別せずすべて null
 * (= 未ログイン扱い) にして、admin/login へのリダイレクトで処理させる。
 */
export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  const key = env.auth.secret;
  if (!key) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = sign(body, key);
  if (
    sig.length !== expectedSig.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as AdminSessionPayload;
    if (!payload.sub || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
