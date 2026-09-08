import { handle, noContent } from "@/lib/api";
import { requireUserId } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";

/**
 * POST /api/v1/notifications/read — 自分の未読通知をすべて既読にする。
 * トップ画面上部の通知ボックスの「閉じる」から呼ぶ。ログイン必須。
 */
export const POST = handle(async (_req) => {
  const userId = await requireUserId();
  enforceRateLimit({ key: `notif:read:${userId}`, ...RATE_PRESETS.write });
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return noContent();
});
