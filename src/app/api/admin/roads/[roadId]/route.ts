import { prisma } from "@/lib/db";
import { handle, ok, parseJson, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit, deriveManualModerationAction } from "@/lib/admin/audit";
import { postStatusSchema } from "@/lib/admin/validation";
import { serializeRoad } from "@/lib/serializers";

const roadInclude = {
  roadTags: { include: { tag: true } },
  attempts: { include: { photos: true } },
} as const;

// PATCH /api/admin/roads/{roadId} — 道の公開状態の手動遷移 (取り下げ / 再公開 など)。
export const PATCH = handle(async (req, ctx) => {
  const admin = await requireAdminApi();
  const { roadId } = await ctx.params;
  assertUuid(roadId, "道");
  const { moderationStatus, note } = await parseJson(req, postStatusSchema);

  const current = await prisma.road.findUnique({
    where: { id: roadId },
    select: { id: true, moderationStatus: true },
  });
  if (!current) throw new ApiError("not_found", "道が見つかりません");
  if (current.moderationStatus === moderationStatus) {
    throw new ApiError("bad_request", "すでにその状態です");
  }

  const updated = await prisma.road.update({
    where: { id: roadId },
    data: {
      moderationStatus,
      moderatedByAdmin: { connect: { id: admin.id } },
      moderatedAt: new Date(),
      ...(note !== undefined ? { moderationNote: note || null } : {}),
    },
    include: roadInclude,
  });

  const action = deriveManualModerationAction(current.moderationStatus, moderationStatus);

  await writeAudit(admin.id, action, {
    roadId,
    detail: { target: "road", from: current.moderationStatus, to: moderationStatus, note: note ?? null },
  });

  return ok(serializeRoad(updated));
});
