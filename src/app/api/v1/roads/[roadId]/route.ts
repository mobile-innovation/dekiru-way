import { prisma } from "@/lib/db";
import { handle, ok, noContent, parseJson, ApiError } from "@/lib/api";
import { requireUserId, assertRoadOwner } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { roadUpdateSchema } from "@/lib/validation";
import { serializeRoad } from "@/lib/serializers";
import { syncRoadTags } from "@/lib/tags";
import { toDbDate } from "@/lib/dates";
import {
  readRoadPublicSnapshot,
  roadPublicContentChanged,
  remoderateApprovedAttemptsOfRoad,
} from "@/lib/moderation";

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

  // 「できなくなったこと」は他の必須項目 (goal) と同じ通常の編集可能項目
  // (道を編集画面の編集可否修正指示。以前は一度値が入ると変更不可だったが、その制限は廃止した)。
  // roadUpdateSchema 自体が「difficulty を送るなら空文字は不可」を検証済みなので、ここでの
  // 追加チェックは不要。
  const updateData = {
    ...rest,
    ...(startedAt !== undefined ? { startedAt: toDbDate(startedAt) } : {}),
  };
  // 比較は保存後の値どうしで行う (trim・タグ名の正規化後に同じなら「変更なし」)。
  const before = await readRoadPublicSnapshot(roadId);
  // タグだけの更新など、road テーブルに書く scalar 項目が無いときは空の UPDATE を発行しない。
  if (Object.keys(updateData).length > 0) {
    await prisma.road.update({ where: { id: roadId }, data: updateData });
  }
  await syncRoadTags(roadId, tags);

  // 道そのものは審査状態を持たない。道の公開テキスト (困っていること・タグ等) は、その道の
  // 試したことを公開する時点の AI 審査本文に含まれる (applyModerationOnPublish が attempt.road を読む)。
  // 承認後に公開項目が変わったときは、その道の公開中・承認済みの経験を再審査する (H-2)。
  // NG・不明なら試したことの編集と同じく pending に戻り、公開面から外れる。
  const after = await readRoadPublicSnapshot(roadId);
  if (roadPublicContentChanged(before, after)) {
    await remoderateApprovedAttemptsOfRoad(roadId);
  }

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
