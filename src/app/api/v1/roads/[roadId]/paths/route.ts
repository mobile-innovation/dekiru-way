import { prisma } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireUserId, assertRoadOwner } from "@/lib/authz";
import { sortAttemptsChronologically } from "@/lib/serializers";

/**
 * GET /api/v1/roads/{roadId}/paths — 本人の道の「方法 → 結果」列 (指示書 11)。
 * Road + Attempt から生成する。保存はしない。
 */
export const GET = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { roadId } = await ctx.params;
  await assertRoadOwner(roadId, userId);

  const road = await prisma.road.findUniqueOrThrow({
    where: { id: roadId },
    include: { attempts: true, roadTags: { include: { tag: true } } },
  });

  return ok({
    roadId: road.id,
    difficulty: road.difficulty,
    goal: road.goal,
    previouslyAble: road.previouslyAble,
    progress: road.progress,
    nextAction: road.nextAction,
    tags: road.roadTags.map((rt) => rt.tag.name),
    steps: road.attempts
      .slice()
      .sort(sortAttemptsChronologically)
      .map((a) => ({
        attemptId: a.id,
        method: a.method,
        result: a.result,
        triedAt: a.triedAt ? a.triedAt.toISOString().slice(0, 10) : null,
        isPublished: a.isPublished,
      })),
  });
});
