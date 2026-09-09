import type { Prisma } from "@prisma/client";
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
  attempts: true,
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

  // 「できなくなったこと」は、一度値が入ると変更できない (道の同一性を保つため)。
  // まだ空のものは初回だけ設定できる。同じ値の再送信・省略は許可。
  const current = await prisma.road.findUniqueOrThrow({
    where: { id: roadId },
    select: { difficulty: true },
  });
  const locked: { field: string; message: string }[] = [];
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
    if (rest.difficulty !== undefined) guardWhere.difficulty = null;

    const { count } = await prisma.road.updateMany({ where: guardWhere, data: updateData });
    if (count === 0) {
      const stillExists = await prisma.road.findUnique({ where: { id: roadId }, select: { id: true } });
      if (!stillExists) throw new ApiError("not_found", "道が見つかりません");
      // 直前の読み取り後に、別のリクエストが difficulty を先に確定させた。
      throw new ApiError("conflict", "他の変更と競合しました。もう一度お試しください");
    }
  }
  await syncRoadTags(roadId, tags);

  // 道そのものは審査しない。道のタイトル・タグを含む公開テキストは、その道で
  // 「経験として公開」した試したことが公開される時点で AI 審査される
  // (applyModerationOnPublish が attempt.road を読む)。

  const road = await prisma.road.findUniqueOrThrow({ where: { id: roadId }, include: roadInclude });
  return ok(serializeRoad(road));
});

// DELETE /api/v1/roads/{roadId} — 本人のみ。attempts は cascade で消える。
export const DELETE = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { roadId } = await ctx.params;
  await assertRoadOwner(roadId, userId);
  enforceRateLimit({ key: `road:delete:${userId}`, ...RATE_PRESETS.write });

  await prisma.road.delete({ where: { id: roadId } });
  return noContent();
});
