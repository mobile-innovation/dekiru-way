import { prisma } from "@/lib/db";
import { handle, ok, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { moderateAttemptContent } from "@/lib/ai/moderation";
import { serializeAttempt } from "@/lib/serializers";
import { ATTEMPT_MODERATION_SELECT, toAttemptModerationInput } from "@/lib/moderation";

// POST /api/admin/posts/{attemptId}/recheck — AI 審査だけをもう一度走らせる。
// moderationStatus は自動では変えない (運営が結果を見て判断する)。AI フィールドのみ更新。
export const POST = handle(async (_req, ctx) => {
  const admin = await requireAdminApi();
  const { attemptId } = await ctx.params;
  assertUuid(attemptId, "投稿");

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    // 公開・編集時の審査と同じ審査対象 (道の進捗・道の次に試すこと・タグを含む)。
    select: ATTEMPT_MODERATION_SELECT,
  });
  if (!attempt) throw new ApiError("not_found", "投稿が見つかりません");

  const result = await moderateAttemptContent(toAttemptModerationInput(attempt));

  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      aiVerdict: result.verdict,
      aiReason: result.reason,
      aiCategories: result.categories,
      aiCheckedAt: new Date(),
    },
  });

  await writeAudit(admin.id, "recheck", {
    attemptId,
    detail: { verdict: result.verdict, categories: result.categories },
  });

  return ok({ attempt: serializeAttempt(updated), verdict: result });
});
