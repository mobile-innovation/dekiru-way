import { prisma } from "@/lib/db";
import { handle, ok, parseJson } from "@/lib/api";
import { requireUserId, assertRoadOwner } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { aiNextStepSchema } from "@/lib/validation";
import { suggestNextStep } from "@/lib/ai/client";

/**
 * POST /api/v1/ai/suggest-next-step — 自分の道について「次に試す材料」を出す補助 (指示書 12)。
 * 本人の道のみ。命令ではなく提案の形。断定しない。
 */
export const POST = handle(async (req) => {
  const userId = await requireUserId();
  const { roadId } = await parseJson(req, aiNextStepSchema);
  await assertRoadOwner(roadId, userId);
  enforceRateLimit({ key: `ai:nextstep:${userId}`, ...RATE_PRESETS.ai });

  const road = await prisma.road.findUniqueOrThrow({
    where: { id: roadId },
    include: { attempts: { orderBy: { createdAt: "asc" } } },
  });

  const result = await suggestNextStep({
    difficulty: road.difficulty,
    goal: road.goal,
    triedSoFar: road.attempts.map((a) => ({ method: a.method, result: a.result })),
  });
  return ok(result);
});
