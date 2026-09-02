import { handle, ok, parseJson } from "@/lib/api";
import { enforceRateLimit, RATE_PRESETS, clientKey } from "@/lib/ratelimit";
import { aiExperienceSearchSchema } from "@/lib/validation";
import { assistExperienceSearch } from "@/lib/ai/client";

/**
 * POST /api/v1/ai/experience-search — 状況文から検索キーワード候補を出す補助 (指示書 12)。
 * 診断・断定はしない。キー未設定時は簡易ロジックのスタブ。
 */
export const POST = handle(async (req) => {
  enforceRateLimit({ key: `ai:search:${clientKey(req)}`, ...RATE_PRESETS.ai });
  const { situation } = await parseJson(req, aiExperienceSearchSchema);
  const result = await assistExperienceSearch(situation);
  return ok(result);
});
