import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError, assertUuid } from "@/lib/api";
import { PUBLIC_ATTEMPT_WHERE } from "@/lib/search";

/**
 * 「この経験を開いて見た」= 既読 のユーザーごとの状態。
 *
 * 方針 (指示書):
 *   - 検索結果に出ただけでは既読にしない。経験詳細を実際に開いた時点で登録する。
 *   - ユーザーごとの状態。既読数・閲覧数は出さない。検索順位にも使わない。
 *   - 1 ユーザー 1 経験につき 1 件 (DB UNIQUE)。二重は握りつぶして冪等に扱う。
 *   - 自分の経験は既読管理の対象外 (無駄な行を作らない)。
 *   - 非公開・存在しない経験は登録できない。
 */

/**
 * 経験を既読にする。
 * - 未公開/不存在 → not_found
 * - 自分の経験 → 何もしない (own)
 * - すでに既読 → 何もしない (冪等)
 */
export async function markAttemptRead(
  attemptId: string,
  userId: string,
): Promise<{ read: boolean }> {
  assertUuid(attemptId, "経験");
  const attempt = await prisma.attempt.findFirst({
    where: { id: attemptId, ...PUBLIC_ATTEMPT_WHERE },
    select: { id: true, road: { select: { userId: true } } },
  });
  if (!attempt) {
    throw new ApiError("not_found", "経験が見つかりません（非公開かもしれません）");
  }
  // 自分の経験は既読管理しない (指示書 13/14)。
  if (attempt.road.userId === userId) return { read: false };

  const existing = await prisma.attemptRead.findUnique({
    where: { userId_attemptId: { userId, attemptId } },
    select: { id: true },
  });
  if (existing) return { read: true };

  try {
    await prisma.attemptRead.create({ data: { attemptId, userId } });
  } catch (err) {
    // 競合による UNIQUE 制約違反は成功扱い。
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { read: true };
    }
    throw err;
  }
  return { read: true };
}

/** viewer が指定 Attempt 群のうちどれを既読にしているか。カード/シリアライザ用。 */
export async function readAttemptIdSet(
  userId: string,
  attemptIds: string[],
): Promise<Set<string>> {
  if (attemptIds.length === 0) return new Set();
  const rows = await prisma.attemptRead.findMany({
    where: { userId, attemptId: { in: attemptIds } },
    select: { attemptId: true },
  });
  return new Set(rows.map((r) => r.attemptId));
}
