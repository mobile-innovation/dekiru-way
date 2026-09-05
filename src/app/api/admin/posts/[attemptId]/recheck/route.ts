import { prisma } from "@/lib/db";
import { handle, ok, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { moderateAttemptContent } from "@/lib/ai/moderation";
import { serializeAttempt } from "@/lib/serializers";

// POST /api/admin/posts/{attemptId}/recheck — AI 審査だけをもう一度走らせる。
// moderationStatus は自動では変えない (運営が結果を見て判断する)。AI フィールドのみ更新。
export const POST = handle(async (_req, ctx) => {
  const admin = await requireAdminApi();
  const { attemptId } = await ctx.params;
  assertUuid(attemptId, "投稿");

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: {
      method: true,
      memo: true,
      feeling: true,
      stateAfter: true,
      nextAction: true,
      road: { select: { difficulty: true, goal: true, situation: true, previouslyAble: true } },
    },
  });
  if (!attempt) throw new ApiError("not_found", "投稿が見つかりません");

  const result = await moderateAttemptContent({
    method: attempt.method,
    memo: attempt.memo,
    feeling: attempt.feeling,
    stateAfter: attempt.stateAfter,
    nextAction: attempt.nextAction,
    road: attempt.road,
  });

  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      aiVerdict: result.verdict,
      aiReason: result.reason,
      aiCategories: result.categories,
      aiCheckedAt: new Date(),
    },
    include: { photos: true },
  });

  await writeAudit(admin.id, "recheck", {
    attemptId,
    detail: { verdict: result.verdict, categories: result.categories },
  });

  return ok({ attempt: serializeAttempt(updated), verdict: result });
});
