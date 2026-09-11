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

/**
 * このユーザーがこれまでに既読にした Attempt id の一覧 (既読引き継ぎ指示書)。
 * ログアウト時にブラウザ側 (localStorage) へ書き出すために使う。
 * 現在は非公開/削除済みになった Attempt の id も含めて返す（既読という「事実」自体は
 * サーバー側の attempt_reads と同じ扱い。表示可否は検索・詳細側の公開ゲートが別途担う）。
 */
export async function listReadAttemptIds(userId: string, limit = 500): Promise<string[]> {
  const rows = await prisma.attemptRead.findMany({
    where: { userId },
    orderBy: { readAt: "desc" },
    take: limit,
    select: { attemptId: true },
  });
  return rows.map((r) => r.attemptId);
}

/**
 * 再ログイン時、ブラウザ側 (localStorage) に溜まった既読 id をアカウント側へ統合する。
 *   - 存在しない Attempt id は無視する（FK 違反を避ける。削除済みなど）。
 *   - 自分の Attempt は既読管理の対象外（`markAttemptRead` と同じ方針）。
 *   - 既存の既読と重複させない（`(user_id, attempt_id)` の一意制約を `skipDuplicates` で活用）。
 * 戻り値は実際に新規登録した件数（参考値。呼び出し側の表示には使わない）。
 */
export async function mergeReadAttemptIds(userId: string, attemptIds: string[]): Promise<number> {
  const uniqueIds = [...new Set(attemptIds)];
  if (uniqueIds.length === 0) return 0;

  const attempts = await prisma.attempt.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, road: { select: { userId: true } } },
  });
  const targetIds = attempts.filter((a) => a.road.userId !== userId).map((a) => a.id);
  if (targetIds.length === 0) return 0;

  const result = await prisma.attemptRead.createMany({
    data: targetIds.map((attemptId) => ({ attemptId, userId })),
    skipDuplicates: true,
  });
  return result.count;
}
