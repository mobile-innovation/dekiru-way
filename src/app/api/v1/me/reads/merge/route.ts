import { handle, ok, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { mergeReadsSchema } from "@/lib/validation";
import { mergeReadAttemptIds } from "@/lib/reads";

/**
 * POST /api/v1/me/reads/merge — 未ログイン中にブラウザへ溜めた既読をアカウント側へ統合する
 * (既読引き継ぎ指示書)。集合として統合し、重複登録はしない
 * (`attempt_reads` の `(user_id, attempt_id)` 一意制約 + `skipDuplicates`)。
 */
export const POST = handle(async (req) => {
  const userId = await requireUserId();
  enforceRateLimit({ key: `reads:merge:${userId}`, ...RATE_PRESETS.write });
  const { attemptIds } = await parseJson(req, mergeReadsSchema);
  const merged = await mergeReadAttemptIds(userId, attemptIds);
  return ok({ merged });
});
