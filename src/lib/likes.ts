import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, assertUuid } from "@/lib/api";
import { PUBLIC_ATTEMPT_WHERE } from "@/lib/search";

/**
 * 公開された経験 (Attempt) への「いいね」。
 *
 * 方針 (指示書):
 *   - 目的は投稿者へ「参考になった」ことを伝えること。人気度・ランキング・検索順位には使わない。
 *   - 1 ユーザー 1 経験につき 1 件 (DB UNIQUE)。二重登録は握りつぶして冪等に扱う。
 *   - 自分の経験にはいいねできない (フロントで隠すだけでなくここでも拒否)。
 *   - 非公開・存在しない経験へのいいねは拒否。
 *   - いいね数はどこにも返さない。
 */

export const LIKE_NOTIFICATION_TYPE = "attempt_liked";

/** いいね対象を検証して、親 Road の所有者 id を返す。非公開/不存在は not_found。 */
async function loadLikeableAttempt(attemptId: string): Promise<{ ownerId: string }> {
  assertUuid(attemptId, "経験");
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, ...PUBLIC_ATTEMPT_WHERE },
    select: { id: true, road: { select: { userId: true } } },
  });
  if (!attempt) {
    throw new ApiError("not_found", "経験が見つかりません（非公開かもしれません）");
  }
  return { ownerId: attempt.road.userId };
}

/**
 * いいねする。
 * - 自分の経験 → 403
 * - すでにいいね済み → 何もしない (冪等)
 * - 新規いいね → attempt_likes に 1 行、投稿者へ未読の通知が無ければ 1 件作成
 */
export async function likeAttempt(attemptId: string, userId: string): Promise<{ liked: true }> {
  const { ownerId } = await loadLikeableAttempt(attemptId);
  if (ownerId === userId) {
    throw new ApiError("forbidden", "自分の経験にはいいねできません");
  }

  // すでにいいね済みなら何もしない (通知も作らない)。
  const already = await prisma.attemptLike.findUnique({
    where: { attemptId_userId: { attemptId, userId } },
    select: { id: true },
  });
  if (already) return { liked: true };

  try {
    await prisma.attemptLike.create({ data: { attemptId, userId } });
  } catch (err) {
    // 競合で同時に 2 回作成された場合の UNIQUE 制約違反は成功扱い。
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { liked: true };
    }
    throw err;
  }

  // 投稿者への通知。未読の同種通知が既にあれば増やさない (通知箱はまとめて 1 つ表示するため)。
  const existingUnread = await prisma.notification.findFirst({
    where: { userId: ownerId, type: LIKE_NOTIFICATION_TYPE, attemptId, isRead: false },
    select: { id: true },
  });
  if (!existingUnread) {
    await prisma.notification.create({
      data: { userId: ownerId, type: LIKE_NOTIFICATION_TYPE, attemptId },
    });
  }

  return { liked: true };
}

/**
 * いいねを取り消す。
 * - 自分が付けたいいねだけを削除する (userId でスコープ)。他人のいいねは触れない。
 * - 付いていなくてもエラーにしない (冪等)。
 * - 通知は消さない (その時点で評価された、という出来事として残す)。
 */
export async function unlikeAttempt(attemptId: string, userId: string): Promise<{ liked: false }> {
  assertUuid(attemptId, "経験");
  await prisma.attemptLike.deleteMany({ where: { attemptId, userId } });
  return { liked: false };
}

/** viewer が指定 Attempt 群のうちどれをいいね済みか。シリアライザ用。 */
export async function likedAttemptIdSet(
  userId: string,
  attemptIds: string[],
): Promise<Set<string>> {
  if (attemptIds.length === 0) return new Set();
  const rows = await prisma.attemptLike.findMany({
    where: { userId, attemptId: { in: attemptIds } },
    select: { attemptId: true },
  });
  return new Set(rows.map((r) => r.attemptId));
}
