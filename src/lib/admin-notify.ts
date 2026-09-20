import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sendAdminMail } from "@/lib/mail";

/**
 * 「新しい登録 (審査待ちの投稿) があります」管理者通知。
 *
 * 方針 (メール通知指示書):
 *   - 登録データの保存を最優先とする。この関数はその後に呼び、失敗しても例外を投げない。
 *   - 二重送信対策: `attempts.pending_notified_at` を条件付き UPDATE
 *     (`moderationStatus=pending AND pendingNotifiedAt IS NULL` のときだけ 1 行更新) で
 *     「送信権」を確定させる。0 行なら既に通知済み、または現在 pending ではない → 何もしない。
 *     承認・却下されると呼び出し側 (moderation.ts / 管理画面の判断 API) が
 *     `pendingNotifiedAt` を null に戻すので、再び pending になれば改めて通知される。
 *   - 本文には登録内容を載せない (件名・状態・日時・管理画面リンクのみ)。
 */
export async function notifyAdminOfNewPending(attemptId: string, createdAt: Date): Promise<void> {
  let claimed: number;
  try {
    const result = await prisma.attempt.updateMany({
      where: { id: attemptId, moderationStatus: "pending", pendingNotifiedAt: null },
      data: { pendingNotifiedAt: new Date() },
    });
    claimed = result.count;
  } catch (err) {
    logNotification(attemptId, "failed", err instanceof Error ? err.message : "unknown_error");
    return;
  }
  if (claimed === 0) return; // 既に通知済み、または pending ではない

  if (!env.mail.configured) {
    logNotification(attemptId, "skipped", "mail_not_configured");
    return;
  }

  const when = createdAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const adminUrl = `${env.site.url}/admin/moderation`;
  const result = await sendAdminMail({
    subject: "【できる道】新しい登録があります",
    text:
      `できる道に新しい登録がありました。\n\n` +
      `状態：審査待ち\n登録日時：${when}\n\n` +
      `管理画面から内容を確認してください。\n\n` +
      `管理画面：\n${adminUrl}\n`,
  });

  logNotification(attemptId, result.ok ? "sent" : "failed", result.error);
}

/**
 * 送信成否のログ。個人情報・登録内容は出さず、識別子と結果だけ残す。
 */
function logNotification(
  registrationId: string,
  status: "sent" | "skipped" | "failed",
  errorMessage?: string,
): void {
  try {
    console.log(
      JSON.stringify({
        tag: "admin-notify",
        notification_type: "new_registration_pending",
        registration_id: registrationId,
        status,
        ...(errorMessage ? { error_message: errorMessage } : {}),
        sent_at: new Date().toISOString(),
      }),
    );
  } catch {
    /* ログ失敗は握りつぶす */
  }
}
