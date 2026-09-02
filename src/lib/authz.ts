import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ApiError, assertUuid } from "@/lib/api";

/**
 * 認証・認可ヘルパ。
 * 所有者チェックは必ずここ (= サーバ側) を通す。UI でボタンを隠すだけにしない (指示書 10)。
 */

/** ログイン中のアプリ内 user.id を返す。未ログインなら null。 */
export async function getOptionalUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/**
 * ログイン必須。未ログインなら 401。
 * セッション (JWT) が指す user が DB に無い場合も 401 にする。
 * これをしないと、別環境で発行された Cookie や開発 DB の再シード後などに、
 * 後続の書き込みが `roads_user_id_fkey` などの FK 制約違反 (500) になってしまう。
 */
export async function requireUserId(): Promise<string> {
  const id = await getOptionalUserId();
  if (!id) {
    throw new ApiError("unauthorized", "この操作にはログインが必要です");
  }
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) {
    throw new ApiError("unauthorized", "ログインし直してください");
  }
  return id;
}

/**
 * Road の所有者であることを保証する。
 * - 存在しない → 404
 * - 他人のもの → 403
 */
export async function assertRoadOwner(roadId: string, userId: string) {
  assertUuid(roadId, "道");
  const road = await prisma.road.findUnique({
    where: { id: roadId },
    select: { id: true, userId: true },
  });
  if (!road) throw new ApiError("not_found", "道が見つかりません");
  if (road.userId !== userId) {
    throw new ApiError("forbidden", "他の人の道は変更できません");
  }
  return road;
}

/**
 * Attempt の所有者であることを保証し、親 road_id も返す。
 */
export async function assertAttemptOwner(attemptId: string, userId: string) {
  assertUuid(attemptId, "試したこと");
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, roadId: true, road: { select: { userId: true } } },
  });
  if (!attempt) throw new ApiError("not_found", "試したことが見つかりません");
  if (attempt.road.userId !== userId) {
    throw new ApiError("forbidden", "他の人の記録は変更できません");
  }
  return { id: attempt.id, roadId: attempt.roadId };
}
