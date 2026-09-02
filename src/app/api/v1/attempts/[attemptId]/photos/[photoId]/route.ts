import { prisma } from "@/lib/db";
import { handle, noContent, ApiError, assertUuid } from "@/lib/api";
import { requireUserId, assertAttemptOwner } from "@/lib/authz";
import { deleteByUrl } from "@/lib/storage";

// DELETE /api/v1/attempts/{attemptId}/photos/{photoId} — 本人のみ。
export const DELETE = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { attemptId, photoId } = await ctx.params;
  assertUuid(photoId, "写真");
  await assertAttemptOwner(attemptId, userId);

  const photo = await prisma.attemptPhoto.findUnique({ where: { id: photoId } });
  if (!photo || photo.attemptId !== attemptId) {
    throw new ApiError("not_found", "写真が見つかりません");
  }
  await prisma.attemptPhoto.delete({ where: { id: photoId } });
  await deleteByUrl(photo.storageUrl);
  return noContent();
});
