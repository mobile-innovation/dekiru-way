import { handle, ok } from "@/lib/api";
import { requireUserId } from "@/lib/authz";
import { listReadAttemptIds } from "@/lib/reads";

/**
 * GET /api/v1/me/reads — ログイン中ユーザーが既読にした Attempt id 一覧 (既読引き継ぎ指示書)。
 *
 * ログアウト時にクライアントがこれを取得し、ブラウザ側 (localStorage) へ書き出すために使う。
 * セッションの本人の分しか取れない（他ユーザーの既読は取得できない）。
 */
export const GET = handle(async () => {
  const userId = await requireUserId();
  const attemptIds = await listReadAttemptIds(userId);
  return ok({ attemptIds });
});
