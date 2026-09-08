import { ModerationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handle, ok, parseJson, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { moderationActionSchema } from "@/lib/admin/validation";
import { serializeRoad } from "@/lib/serializers";

const roadInclude = {
  roadTags: { include: { tag: true } },
  attempts: true,
} as const;

// POST /api/admin/roads/{roadId}/moderate — 保留中の道を許可 / 却下する。
export const POST = handle(async (req, ctx) => {
  const admin = await requireAdminApi();
  const { roadId } = await ctx.params;
  assertUuid(roadId, "道");
  const { action, note } = await parseJson(req, moderationActionSchema);

  const current = await prisma.road.findUnique({
    where: { id: roadId },
    select: { id: true, moderationStatus: true },
  });
  if (!current) throw new ApiError("not_found", "道が見つかりません");

  const nextStatus =
    action === "approve" ? ModerationStatus.approved : ModerationStatus.rejected;

  const updated = await prisma.road.update({
    where: { id: roadId },
    data: {
      moderationStatus: nextStatus,
      moderatedByAdmin: { connect: { id: admin.id } },
      moderatedAt: new Date(),
      ...(note !== undefined ? { moderationNote: note || null } : {}),
    },
    include: roadInclude,
  });

  await writeAudit(admin.id, action === "approve" ? "approve" : "reject", {
    roadId,
    detail: { target: "road", from: current.moderationStatus, to: nextStatus, note: note ?? null },
  });

  return ok(serializeRoad(updated));
});
