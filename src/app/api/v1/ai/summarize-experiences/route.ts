import { prisma } from "@/lib/db";
import { handle, ok, parseJson } from "@/lib/api";
import { enforceRateLimit, RATE_PRESETS, clientKey } from "@/lib/ratelimit";
import { aiSummarizeSchema } from "@/lib/validation";
import { summarizeExperiences } from "@/lib/ai/client";

/**
 * POST /api/v1/ai/summarize-experiences — 複数の公開経験を整理する補助 (指示書 12)。
 * 対象は公開 Attempt のみ。「こういう方法が試されています」という提示に留める。
 */
export const POST = handle(async (req) => {
  enforceRateLimit({ key: `ai:summarize:${clientKey(req)}`, ...RATE_PRESETS.ai });
  const { experienceIds } = await parseJson(req, aiSummarizeSchema);

  const rows = await prisma.attempt.findMany({
    where: { id: { in: experienceIds }, isPublished: true },
    select: { method: true, result: true, memo: true },
  });

  const result = await summarizeExperiences(rows);
  return ok({ ...result, count: rows.length });
});
