import { ModerationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handle, ok, parseJson, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { moderationActionSchema } from "@/lib/admin/validation";
import { serializeAttempt } from "@/lib/serializers";
import { bumpRoadUpdatedAt } from "@/lib/moderation";

// POST /api/admin/moderation/{attemptId} — 確認待ち経験の判断。
//   approve / reject: 最終判断 (moderationStatus を変える)。
//   hold / unhold   : 「保留」= 公開できない記録として脇に置く / 戻す (moderationStatus は変えない)。
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

  // --- 保留の切り替え: moderationStatus は動かさない ---
  if (action === "hold" || action === "unhold") {
    const held = action === "hold";
    const updated = await prisma.attempt.update({
      where: { id: attemptId },
      data: {
        moderationHeld: held,
        moderatedByAdmin: { connect: { id: admin.id } },
        moderatedAt: new Date(),
        ...(note !== undefined ? { moderationNote: note || null } : {}),
      },
    });
    await writeAudit(admin.id, action, { attemptId, detail: { held, note: note ?? null } });
    return ok(serializeAttempt(updated));
  }

  // --- 最終判断: approve / reject ---
  const nextStatus =
    action === "approve" ? ModerationStatus.approved : ModerationStatus.rejected;

  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      moderationStatus: nextStatus,
      // 保留のまま最終判断されたら保留フラグは残さない。
      moderationHeld: false,
      moderatedByAdmin: { connect: { id: admin.id } },
      moderatedAt: new Date(),
      // pending を抜けたので通知フラグもリセットする。再び pending に戻ったとき
      // (本人が編集して再審査に回った等) に改めて管理者へ通知されるようにするため。
      pendingNotifiedAt: null,
      ...(note !== undefined ? { moderationNote: note || null } : {}),
    },
  });

  // 公開になった = その道に公開経験が付いた → 検索の並び (roads.updatedAt desc) で浮上させる。
  if (nextStatus === ModerationStatus.approved) {
    await bumpRoadUpdatedAt(updated.roadId);
  }

  await writeAudit(admin.id, action === "approve" ? "approve" : "reject", {
    attemptId,
    detail: { from: current.moderationStatus, to: nextStatus, note: note ?? null },
  });

  return ok(serializeAttempt(updated));
});
