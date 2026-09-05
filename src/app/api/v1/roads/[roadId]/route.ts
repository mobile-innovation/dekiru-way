import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handle, ok, noContent, parseJson, ApiError } from "@/lib/api";
import { requireUserId, assertRoadOwner } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { roadUpdateSchema } from "@/lib/validation";
import { serializeRoad } from "@/lib/serializers";
import { syncRoadTags, normalizeTagName } from "@/lib/tags";
import { toDbDate } from "@/lib/dates";
import { applyRoadModeration, ROAD_MODERATED_FIELDS } from "@/lib/moderation";

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

  // タイトルと「できなくなったこと」は、一度値が入ると変更できない (道の同一性を保つため)。
  // まだ空のものは初回だけ設定できる。同じ値の再送信・省略は許可。
  const current = await prisma.road.findUniqueOrThrow({
    where: { id: roadId },
    select: {
      title: true,
      difficulty: true,
      goal: true,
      situation: true,
      previouslyAble: true,
      progress: true,
      nextAction: true,
      memo: true,
      status: true,
      roadTags: { select: { tag: { select: { name: true } } } },
    },
  });
  const locked: { field: string; message: string }[] = [];
  if (current.title && rest.title !== undefined && rest.title !== current.title) {
    locked.push({ field: "title", message: "タイトルは一度設定すると変更できません" });
  }
  if (current.difficulty && rest.difficulty !== undefined && rest.difficulty !== current.difficulty) {
    locked.push({
      field: "difficulty",
      message: "「できなくなったこと」は一度設定すると変更できません",
    });
  }
  if (locked.length > 0) {
    throw new ApiError("conflict", locked.map((l) => l.message).join(" / "), locked);
  }
  // すでに確定している項目は書き込み対象から外す (同値でも無駄な更新をしない)。
  if (current.title) delete rest.title;
  if (current.difficulty) delete rest.difficulty;

  // ここまでの読み取り (current) と書き込みの間に他のリクエストが同じ未設定項目を
  // 先に埋める競合を防ぐため、「まだ null であること」を書き込み条件に含めて原子的に更新する
  // (read-then-write では両者が確認を通り、後勝ちで一方の入力が黙って消えてしまう)。
  const updateData = {
    ...rest,
    ...(startedAt !== undefined ? { startedAt: toDbDate(startedAt) } : {}),
  };
  // タグだけの更新など、road テーブルに書く scalar 項目が無いときは空の UPDATE を発行しない。
  if (Object.keys(updateData).length > 0) {
    const guardWhere: Prisma.RoadWhereInput = { id: roadId };
    if (rest.title !== undefined) guardWhere.title = null;
    if (rest.difficulty !== undefined) guardWhere.difficulty = null;

    const { count } = await prisma.road.updateMany({ where: guardWhere, data: updateData });
    if (count === 0) {
      const stillExists = await prisma.road.findUnique({ where: { id: roadId }, select: { id: true } });
      if (!stillExists) throw new ApiError("not_found", "道が見つかりません");
      // 直前の読み取り後に、別のリクエストが title/difficulty を先に確定させた。
      throw new ApiError("conflict", "他の変更と競合しました。もう一度お試しください");
    }
  }
  await syncRoadTags(roadId, tags);

  // 審査対象の項目 (タグ含む) が変わったら道の内容を再審査する
  // (NG/不明なら pending に戻り公開面から外れる)。タグも経験のタグ一覧・検索に公開されるため対象に含める。
  const fieldsChanged = ROAD_MODERATED_FIELDS.some(
    (f) => rest[f] !== undefined && rest[f] !== current[f],
  );
  const sortedTagNames = (names: string[]) =>
    Array.from(new Set(names.map(normalizeTagName).filter((n) => n.length > 0))).sort();
  const tagsChanged =
    tags !== undefined &&
    JSON.stringify(sortedTagNames(tags)) !==
      JSON.stringify(sortedTagNames(current.roadTags.map((rt) => rt.tag.name)));
  if (fieldsChanged || tagsChanged) {
    await applyRoadModeration(roadId);
  }

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
