import { handle, ok } from "@/lib/api";
import { env } from "@/lib/env";

/**
 * POST /api/v1/auth/google
 * 実際の OAuth ダンスは Auth.js の /api/auth/signin/google が担当する。
 * このエンドポイントは指示書 11 の API 名に合わせた入口で、遷移先 URL を返す。
 */
export const POST = handle(async () => {
  return ok({
    url: "/api/auth/signin/google",
    googleConfigured: env.auth.googleConfigured,
  });
});
