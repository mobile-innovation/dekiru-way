import { prisma } from "@/lib/db";
import { handle, ok, created, ApiError } from "@/lib/api";
import { requireUserId, assertAttemptOwner } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { photoMetaSchema } from "@/lib/validation";
import { serializePhoto } from "@/lib/serializers";
import { uploadImage } from "@/lib/storage";

const MAX_PHOTOS_PER_ATTEMPT = 8;

// GET /api/v1/attempts/{attemptId}/photos — 本人のみ。
export const GET = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { attemptId } = await ctx.params;
  await assertAttemptOwner(attemptId, userId);
  const photos = await prisma.attemptPhoto.findMany({
    where: { attemptId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return ok({ items: photos.map(serializePhoto) });
});

// POST /api/v1/attempts/{attemptId}/photos — multipart/form-data (file, caption?, sortOrder?)。
export const POST = handle(async (req, ctx) => {
  const userId = await requireUserId();
  const { attemptId } = await ctx.params;
  await assertAttemptOwner(attemptId, userId);
  enforceRateLimit({ key: `photo:upload:${userId}`, ...RATE_PRESETS.upload });

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new ApiError("unsupported_media_type", "multipart/form-data で送信してください");
  }

  const count = await prisma.attemptPhoto.count({ where: { attemptId } });
  if (count >= MAX_PHOTOS_PER_ATTEMPT) {
    throw new ApiError("conflict", `写真は 1 件の記録につき ${MAX_PHOTOS_PER_ATTEMPT} 枚までです`);
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ApiError("bad_request", "画像ファイル (file) が必要です");
  }
  const meta = photoMetaSchema.parse({
    caption: form.get("caption") ?? undefined,
    sortOrder: form.get("sortOrder") ?? undefined,
  });

  const uploaded = await uploadImage(file, `attempts/${attemptId}`);
  const photo = await prisma.attemptPhoto.create({
    data: {
      attemptId,
      storageUrl: uploaded.storageUrl,
      caption: meta.caption ?? null,
      sortOrder: meta.sortOrder ?? count,
    },
  });
  return created(serializePhoto(photo));
});
