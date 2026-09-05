import { prisma } from "@/lib/db";
import { handle, ok, parseJson, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit, deriveManualModerationAction } from "@/lib/admin/audit";
import { postStatusSchema } from "@/lib/admin/validation";
import { serializeAttempt } from "@/lib/serializers";

// PATCH /api/admin/posts/{attemptId} — 公開状態の手動遷移
//   approved → pending  : 公開中の投稿を取り下げてレビューに戻す (unpublish)
//   rejected → approved  : 見送った投稿をやはり公開する (republish)
//   その他の遷移もそのまま許可する (運営判断)。
export const PATCH = handle(async (req, ctx) => {
  const admin = await requireAdminApi();
  const { attemptId } = await ctx.params;
  assertUuid(attemptId, "投稿");
  const { moderationStatus, note } = await parseJson(req, postStatusSchema);

  const current = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, moderationStatus: true },
  });
  if (!current) throw new ApiError("not_found", "投稿が見つかりません");
  if (current.moderationStatus === moderationStatus) {
    throw new ApiError("bad_request", "すでにその状態です");
  }

  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      moderationStatus,
      moderatedByAdmin: { connect: { id: admin.id } },
      moderatedAt: new Date(),
      ...(note !== undefined ? { moderationNote: note || null } : {}),
    },
    include: { photos: true },
  });

  const action = deriveManualModerationAction(current.moderationStatus, moderationStatus);

  await writeAudit(admin.id, action, {
    attemptId,
    detail: { from: current.moderationStatus, to: moderationStatus, note: note ?? null },
  });

  return ok(serializeAttempt(updated));
});
