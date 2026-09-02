import { prisma } from "@/lib/db";
import { handle, ok, noContent, parseJson, ApiError } from "@/lib/api";
import { requireUserId, assertRoadOwner } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { roadUpdateSchema } from "@/lib/validation";
import { serializeRoad } from "@/lib/serializers";
import { syncRoadTags } from "@/lib/tags";
import { toDbDate } from "@/lib/dates";

const roadInclude = {
  roadTags: { include: { tag: true } },
  attempts: { include: { photos: true } },
} as const;

// GET /api/v1/roads/{roadId} — 本人のみ (非公開データ)。
export const GET = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { roadId } = await ctx.params;
  await assertRoadOwner(roadId, userId);
  const road = await prisma.road.findUniqueOrThrow({ where: { id: roadId }, include: roadInclude });
  return ok(serializeRoad(road));
});

// PATCH /api/v1/roads/{roadId} — 本人のみ。
export const PATCH = handle(async (req, ctx) => {
  const userId = await requireUserId();
  const { roadId } = await ctx.params;
  await assertRoadOwner(roadId, userId);
  enforceRateLimit({ key: `road:update:${userId}`, ...RATE_PRESETS.write });

  const input = await parseJson(req, roadUpdateSchema);
  if (Object.keys(input).length === 0) {
    throw new ApiError("bad_request", "更新する項目がありません");
  }
  const { tags, startedAt, ...rest } = input;

  await prisma.road.update({
    where: { id: roadId },
    data: {
      ...rest,
      ...(startedAt !== undefined ? { startedAt: toDbDate(startedAt) } : {}),
    },
  });
  await syncRoadTags(roadId, tags);

  const road = await prisma.road.findUniqueOrThrow({ where: { id: roadId }, include: roadInclude });
  return ok(serializeRoad(road));
});

// DELETE /api/v1/roads/{roadId} — 本人のみ。attempts / photos は cascade で消える。
export const DELETE = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { roadId } = await ctx.params;
  await assertRoadOwner(roadId, userId);
  enforceRateLimit({ key: `road:delete:${userId}`, ...RATE_PRESETS.write });

  const photos = await prisma.attemptPhoto.findMany({
    where: { attempt: { roadId } },
    select: { storageUrl: true },
  });
  await prisma.road.delete({ where: { id: roadId } });

  // ストレージ上の実体も掃除する (失敗しても致命的には扱わない)
  const { deleteByUrl } = await import("@/lib/storage");
  await Promise.allSettled(photos.map((p) => deleteByUrl(p.storageUrl)));

  return noContent();
});
