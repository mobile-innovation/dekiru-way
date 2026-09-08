import { handle, ok } from "@/lib/api";
import { requireUserId } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { markAttemptRead } from "@/lib/reads";

/**
 * POST /api/v1/attempts/{attemptId}/read — この経験を「見た」= 既読にする。
 *
 * ログイン必須。経験詳細を開いた時点でクライアントから 1 回呼ぶ (検索結果表示時には呼ばない)。
 * 既読は補助機能なので、失敗しても経験閲覧は妨げない (呼び出し側で握りつぶす)。
 * いいね数のような集計は返さない。
 */
export const POST = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  enforceRateLimit({ key: `read:${userId}`, ...RATE_PRESETS.write });
  const { attemptId } = await ctx.params;
  const result = await markAttemptRead(attemptId, userId);
  return ok(result);
});
