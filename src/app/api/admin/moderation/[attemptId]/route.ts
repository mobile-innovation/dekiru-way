import { ModerationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handle, ok, parseJson, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { moderationActionSchema } from "@/lib/admin/validation";
import { serializeAttempt } from "@/lib/serializers";

// POST /api/admin/moderation/{attemptId} — 保留投稿を許可 / 却下する。
export const POST = handle(async (req, ctx) => {
  const admin = await requireAdminApi();
  const { attemptId } = await ctx.params;
  assertUuid(attemptId, "投稿");
  const { action, note } = await parseJson(req, moderationActionSchema);

  const current = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, moderationStatus: true },
  });
  if (!current) throw new ApiError("not_found", "投稿が見つかりません");

  const nextStatus =
    action === "approve" ? ModerationStatus.approved : ModerationStatus.rejected;

  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      moderationStatus: nextStatus,
      moderatedByAdmin: { connect: { id: admin.id } },
      moderatedAt: new Date(),
      ...(note !== undefined ? { moderationNote: note || null } : {}),
    },
  });

  await writeAudit(admin.id, action === "approve" ? "approve" : "reject", {
    attemptId,
    detail: { from: current.moderationStatus, to: nextStatus, note: note ?? null },
  });

  return ok(serializeAttempt(updated));
});
