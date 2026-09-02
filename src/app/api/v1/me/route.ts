import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { handle, ok, errorResponse } from "@/lib/api";

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
