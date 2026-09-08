import { handle, ok, noContent } from "@/lib/api";
import { requireUserId } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { likeAttempt, unlikeAttempt } from "@/lib/likes";

/**
 * POST   /api/v1/attempts/{attemptId}/like — この経験にいいねする
 * DELETE /api/v1/attempts/{attemptId}/like — 自分が付けたいいねを取り消す
 *
 * どちらもログイン必須。所有者・公開状態の検証は likeAttempt / unlikeAttempt (サーバ側) で行う。
 * いいね数は返さない。
 */

export const POST = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  enforceRateLimit({ key: `like:${userId}`, ...RATE_PRESETS.write });
  const { attemptId } = await ctx.params;
  const result = await likeAttempt(attemptId, userId);
  return ok(result);
});

export const DELETE = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  enforceRateLimit({ key: `like:${userId}`, ...RATE_PRESETS.write });
  const { attemptId } = await ctx.params;
  await unlikeAttempt(attemptId, userId);
  return noContent();
});
