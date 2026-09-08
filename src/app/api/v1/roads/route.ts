import { prisma } from "@/lib/db";
import { handle, ok, created, parseJson } from "@/lib/api";
import { requireUserId } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { roadCreateSchema } from "@/lib/validation";
import { serializeRoad } from "@/lib/serializers";
import { syncRoadTags } from "@/lib/tags";
import { toDbDate } from "@/lib/dates";
import { generateRoadTitle } from "@/lib/ai/local";
import { applyRoadModeration } from "@/lib/moderation";

const roadInclude = {
  roadTags: { include: { tag: true } },
  attempts: true,
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
      // 道のページは初期は公開。非公開にしたい場合は道の詳細画面で切り替えられる。
      visibility: input.visibility ?? "public",
    },
  });
  await syncRoadTags(road.id, tags);

  // タイトル未入力なら「できなくなったこと」からローカル AI で見出しを補う。
  // 生成は補助レイヤー: 失敗・タイムアウト・未設定なら title は null のまま (指示書 ローカルAI v1)。
  if (!road.title && road.difficulty) {
    const generated = await generateRoadTitle(road.difficulty);
    if (generated) {
      await prisma.road.update({ where: { id: road.id }, data: { title: generated } });
    }
  }

  // 道の内容を AI 審査する。NG/不明なら pending になり、この道の経験は公開面に出ない。
  await applyRoadModeration(road.id);

  const full = await prisma.road.findUniqueOrThrow({
    where: { id: road.id },
    include: roadInclude,
  });
  return created(serializeRoad(full));
});
