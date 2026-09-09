import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * 管理画面の操作記録 (監査ログ)。
 * 「誰が・いつ・どの投稿に・何をしたか」を残す。失敗しても本処理は止めない。
 */

export type AdminAction =
  | "login"
  | "approve"
  | "reject"
  | "unpublish" // 公開中 → pending に戻す (取り下げ)
  | "republish" // rejected → approved (やっぱり公開する)
  | "requeue" // rejected → pending (確認待ちに戻す)
  | "recheck"; // AI 再チェック

/**
 * PATCH /api/admin/posts/{id}（手動での moderationStatus 遷移）の監査ログ action を、
 * 遷移前後の状態から一意に決める。
 */
export function deriveManualModerationAction(
  from: ModerationStatus,
  to: ModerationStatus,
): AdminAction {
  if (to === ModerationStatus.approved) {
    return from === ModerationStatus.rejected ? "republish" : "approve";
  }
  if (to === ModerationStatus.rejected) {
    return "reject";
  }
  // to === pending
  return from === ModerationStatus.approved ? "unpublish" : "requeue";
}

export async function writeAudit(
  adminId: string,
  action: AdminAction,
  opts: {
    attemptId?: string | null;
    detail?: Prisma.InputJsonValue;
  } = {},
): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        attemptId: opts.attemptId ?? null,
        detail: opts.detail,
      },
    });
  } catch (err) {
    console.error(
      "[admin] audit write failed:",
      err instanceof Error ? err.message : "unknown",
    );
  }
}
