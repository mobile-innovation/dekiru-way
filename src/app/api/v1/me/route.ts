import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { handle, ok, noContent, errorResponse, ApiError } from "@/lib/api";
import { requireUserId } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { ANON_SUBMITTER_SUB } from "@/lib/quick-submit";

// GET /api/v1/me — ログイン中のユーザー情報。未ログインは 401。
export const GET = handle(async () => {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse("unauthorized", "ログインしていません");
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, displayName: true, avatarUrl: true, createdAt: true },
  });
  if (!user) {
    return errorResponse("unauthorized", "ユーザーが見つかりません");
  }
  return ok({
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
  });
});

/**
 * DELETE /api/v1/me — 「できる道」アカウントと、本人に紐づくサービス内データを削除する。
 *
 * - 削除対象は必ず認証セッションから取得した本人の user.id のみ（クライアントから id は受け取らない）。
 * - `users` を消すと FK の ON DELETE CASCADE で `roads` → `attempts` → `road_tags` /
 *   `attempt_likes` / `attempt_reads` / `notifications` まで一括で消える（本人が公開していた経験も
 *   検索・閲覧できなくなる）。単一の DELETE 文なので原子的。
 * - Google アカウントそのものには一切触れない。
 * - 削除後はセッション Cookie を破棄する。
 */
export const DELETE = handle(async () => {
  const userId = await requireUserId();
  enforceRateLimit({ key: `account:delete:${userId}`, ...RATE_PRESETS.write });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { googleSub: true },
  });
  if (!user) {
    // 直前に別タブで削除済みなど
    return noContent();
  }
  if (user.googleSub === ANON_SUBMITTER_SUB) {
    throw new ApiError("forbidden", "このアカウントは削除できません");
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id: userId } });
  });

  // セッションを無効化（JWT Cookie を破棄）。Google アカウントは削除しない。
  await signOut({ redirect: false });
  return noContent();
});
