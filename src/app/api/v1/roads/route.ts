import { prisma } from "@/lib/db";
import { handle, ok, created, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { roadCreateSchema } from "@/lib/validation";
import { serializeRoad } from "@/lib/serializers";
import { syncRoadTags } from "@/lib/tags";
import { toDbDate } from "@/lib/dates";

const roadInclude = {
  roadTags: { include: { tag: true } },
  attempts: { include: { photos: true } },
} as const;

// GET /api/v1/roads — 自分の道の一覧 (指示書 11)。
export const GET = handle(async () => {
  const userId = await requireUserId();
  const roads = await prisma.road.findMany({
    where: { userId },
    include: roadInclude,
    orderBy: { updatedAt: "desc" },
  });
  return ok({ items: roads.map(serializeRoad) });
});

// POST /api/v1/roads — 道を作る (指示書 6-⑤)。
export const POST = handle(async (req) => {
  const userId = await requireUserId();
  enforceRateLimit({ key: `road:create:${userId}`, ...RATE_PRESETS.write });

  const input = await parseJson(req, roadCreateSchema);
  const { tags, startedAt, ...rest } = input;

  const road = await prisma.road.create({
    data: {
      userId,
      ...rest,
      startedAt: toDbDate(startedAt) ?? null,
      visibility: input.visibility ?? "private",
    },
  });
  await syncRoadTags(road.id, tags);

  const full = await prisma.road.findUniqueOrThrow({
    where: { id: road.id },
    include: roadInclude,
  });
  return created(serializeRoad(full));
});
