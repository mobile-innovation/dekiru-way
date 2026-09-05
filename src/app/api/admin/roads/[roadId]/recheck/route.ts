import { prisma } from "@/lib/db";
import { handle, ok, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { moderateRoadContent } from "@/lib/ai/moderation";

// POST /api/admin/roads/{roadId}/recheck — 道の AI 審査だけを再実行する。
// moderationStatus は自動では変えない (運営が結果を見て判断する)。
export const POST = handle(async (_req, ctx) => {
  const admin = await requireAdminApi();
  const { roadId } = await ctx.params;
  assertUuid(roadId, "道");

  const road = await prisma.road.findUnique({
    where: { id: roadId },
    select: {
      title: true,
      difficulty: true,
      goal: true,
      situation: true,
      previouslyAble: true,
      progress: true,
      nextAction: true,
      memo: true,
      status: true,
    },
  });
  if (!road) throw new ApiError("not_found", "道が見つかりません");

  const result = await moderateRoadContent(road);
  await prisma.road.update({
    where: { id: roadId },
    data: {
      aiVerdict: result.verdict,
      aiReason: result.reason,
      aiCategories: result.categories,
      aiCheckedAt: new Date(),
    },
  });

  await writeAudit(admin.id, "recheck", {
    roadId,
    detail: { target: "road", verdict: result.verdict, categories: result.categories },
  });

  return ok({ verdict: result });
});
