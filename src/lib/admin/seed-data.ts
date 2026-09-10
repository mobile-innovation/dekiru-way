import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { toDbDate } from "@/lib/dates";
import { serializeAttempt } from "@/lib/serializers";
import { publishStateOf, type PublishState } from "@/lib/publish-state";
import { bumpRoadUpdatedAt } from "@/lib/moderation";
import type { SeedDraftInput, SeedUpdateInput } from "@/lib/validation";

/**
 * 管理画面「仮データ管理」のサーバー処理 (実装指示書 3 / 9 / 10 / 11 / 12 / 15)。
 *
 * すべて呼び出し側で requireAdmin* 済みの前提。
 *
 * 安全策:
 *   - 仮データは Road.isSeedData = true / dataOrigin = "ai_seed" で作る。
 *   - すべての「取得・編集・公開・非公開・削除」は requireSeedRoad() を通し、
 *     対象が仮データでなければ not_found にする。→ 実ユーザーの Road / Attempt は
 *     この経路から一切触れない (指示書 15)。
 *   - 一括公開・一括削除は実装しない。関数はすべて 1 件単位。
 *   - 保存時の Attempt は必ず isPublished = false / moderationStatus = pending。
 */

/** 仮データ Road を所有するシステム利用者 (Road.userId は NOT NULL)。ログインせず公開面に出ない。 */
export const SEED_OWNER_SUB = "system:ai-seed-data";

const PAGE_SIZE = 20;

async function getOrCreateSeedOwner(): Promise<{ id: string }> {
  return prisma.user.upsert({
    where: { googleSub: SEED_OWNER_SUB },
    update: {},
    create: { googleSub: SEED_OWNER_SUB, displayName: "仮データ（管理者作成）" },
    select: { id: true },
  });
}

type SeedRoadRow = Prisma.RoadGetPayload<{ include: { attempts: true } }>;

export interface SeedDataDTO {
  id: string;
  dataOrigin: string;
  /** AI 生成由来か (dataOrigin === "ai_seed")。一覧の「AI生成」表示用。 */
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  /** その仮データ (＝ Road の唯一の Attempt) の公開状態。 */
  publishState: PublishState;
  isPublished: boolean;
  road: {
    difficulty: string | null;
    previouslyAble: string | null;
    goal: string | null;
    situation: string | null;
    startedAt: string | null;
    memo: string | null;
    status: string | null;
    progress: string | null;
    nextAction: string | null;
  };
  attempt: ReturnType<typeof serializeAttempt> | null;
}

function serializeSeedRoad(road: SeedRoadRow): SeedDataDTO {
  const attempt = road.attempts[0] ?? null;
  return {
    id: road.id,
    dataOrigin: road.dataOrigin,
    aiGenerated: road.dataOrigin === "ai_seed",
    createdAt: road.createdAt.toISOString(),
    updatedAt: road.updatedAt.toISOString(),
    publishState: attempt ? publishStateOf(attempt) : "private",
    isPublished: attempt?.isPublished ?? false,
    road: {
      difficulty: road.difficulty,
      previouslyAble: road.previouslyAble,
      goal: road.goal,
      situation: road.situation,
      startedAt: road.startedAt ? road.startedAt.toISOString().slice(0, 10) : null,
      memo: road.memo,
      status: road.status,
      progress: road.progress,
      nextAction: road.nextAction,
    },
    attempt: attempt ? serializeAttempt(attempt) : null,
  };
}

/** 対象が「仮データの Road」であることを保証する。実ユーザーの Road なら not_found。 */
async function requireSeedRoad(roadId: string): Promise<SeedRoadRow> {
  const road = await prisma.road.findFirst({
    where: { id: roadId, isSeedData: true },
    include: { attempts: true },
  });
  if (!road) throw new ApiError("not_found", "仮データが見つかりません");
  return road;
}

/**
 * 生成された候補を「すべて非公開」で保存する (指示書 9)。
 * `keyword` は生成時のテーマ。同じテーマの再生成で重複を避けるため Road に残す。
 */
export async function persistSeedDrafts(
  drafts: SeedDraftInput[],
  keyword?: string | null,
): Promise<SeedDataDTO[]> {
  const owner = await getOrCreateSeedOwner();
  const ids: string[] = [];
  const seedKeyword = keyword?.trim() ? keyword.trim() : null;

  await prisma.$transaction(async (tx) => {
    for (const d of drafts) {
      const road = await tx.road.create({
        data: {
          userId: owner.id,
          isSeedData: true,
          dataOrigin: "ai_seed",
          seedKeyword,
          difficulty: d.difficulty ?? null,
          previouslyAble: d.previouslyAble ?? null,
          goal: d.goal ?? null,
          situation: d.situation ?? null,
          startedAt: toDbDate(d.startedAt) ?? null,
          memo: d.memo ?? null,
          status: d.status ?? null,
          progress: d.progress ?? null,
          nextAction: d.nextAction ?? null,
        },
        select: { id: true },
      });
      await tx.attempt.create({
        data: {
          roadId: road.id,
          method: d.method,
          result: d.result,
          triedAt: toDbDate(d.triedAt) ?? null,
          memo: d.attemptMemo ?? null,
          // 保存時は必ず非公開。moderationStatus は既定の pending のまま。
          isPublished: false,
        },
      });
      ids.push(road.id);
    }
  });

  const rows = await prisma.road.findMany({
    where: { id: { in: ids } },
    include: { attempts: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeSeedRoad);
}

export async function listSeedData(opts: { page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.RoadWhereInput = { isSeedData: true };
  const [total, rows] = await Promise.all([
    prisma.road.count({ where }),
    prisma.road.findMany({
      where,
      include: { attempts: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return {
    items: rows.map(serializeSeedRoad),
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: page * PAGE_SIZE < total,
  };
}

/**
 * 同じテーマ (キーワード) で過去に生成済みの仮データを、重複回避の参照用に返す。
 * 完全一致の seed_keyword に加え、スペース区切りの語を含むもの (テーマの言い回し違い) も拾う。
 * 生成のたびに違う内容を出すため generate エンドポイントから呼ぶ。
 */
export async function listSeedDataForTheme(
  keyword: string,
): Promise<{ difficulty: string | null; method: string; result: string | null }[]> {
  const kw = keyword.trim();
  if (kw.length === 0) return [];
  const rows = await prisma.road.findMany({
    where: {
      isSeedData: true,
      OR: [
        { seedKeyword: kw },
        { seedKeyword: { contains: kw, mode: "insensitive" } },
      ],
    },
    include: { attempts: { orderBy: { createdAt: "asc" }, take: 1 } },
    orderBy: { createdAt: "desc" },
    take: 120,
  });
  return rows.map((r) => ({
    difficulty: r.difficulty,
    method: r.attempts[0]?.method ?? "",
    result: r.attempts[0]?.result ?? null,
  }));
}

export async function getSeedData(roadId: string): Promise<SeedDataDTO | null> {
  const road = await prisma.road.findFirst({
    where: { id: roadId, isSeedData: true },
    include: { attempts: true },
  });
  return road ? serializeSeedRoad(road) : null;
}

/** 1 件編集。Road 側 / Attempt 側の指定されたフィールドだけ更新する。 */
export async function updateSeedData(
  roadId: string,
  input: SeedUpdateInput,
): Promise<SeedDataDTO> {
  const road = await requireSeedRoad(roadId);
  const attempt = road.attempts[0];

  const has = (k: keyof SeedUpdateInput) => Object.prototype.hasOwnProperty.call(input, k);

  const roadData: Prisma.RoadUpdateInput = {
    ...(has("difficulty") ? { difficulty: input.difficulty ?? null } : {}),
    ...(has("previouslyAble") ? { previouslyAble: input.previouslyAble ?? null } : {}),
    ...(has("goal") ? { goal: input.goal ?? null } : {}),
    ...(has("situation") ? { situation: input.situation ?? null } : {}),
    ...(has("startedAt") ? { startedAt: toDbDate(input.startedAt) ?? null } : {}),
    ...(has("memo") ? { memo: input.memo ?? null } : {}),
    ...(has("status") ? { status: input.status ?? null } : {}),
    ...(has("progress") ? { progress: input.progress ?? null } : {}),
    ...(has("nextAction") ? { nextAction: input.nextAction ?? null } : {}),
  };

  const attemptData: Prisma.AttemptUpdateInput = {
    ...(input.method !== undefined ? { method: input.method } : {}),
    ...(input.result !== undefined ? { result: input.result } : {}),
    ...(has("triedAt") ? { triedAt: toDbDate(input.triedAt) ?? null } : {}),
    ...(has("attemptMemo") ? { memo: input.attemptMemo ?? null } : {}),
  };

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (Object.keys(roadData).length > 0) {
    ops.push(prisma.road.update({ where: { id: roadId }, data: roadData }));
  }
  if (attempt && Object.keys(attemptData).length > 0) {
    ops.push(prisma.attempt.update({ where: { id: attempt.id }, data: attemptData }));
  }
  if (ops.length > 0) await prisma.$transaction(ops);

  return (await getSeedData(roadId))!;
}

/**
 * 1 件公開 (指示書 10)。管理者が確認画面で精査済みのため AI 審査は通さず、
 * 直接 isPublished = true / moderationStatus = approved にする。
 */
export async function publishSeedData(roadId: string): Promise<SeedDataDTO> {
  const road = await requireSeedRoad(roadId);
  const attempt = road.attempts[0];
  if (!attempt) throw new ApiError("bad_request", "この仮データには試したことがありません");
  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { isPublished: true, moderationStatus: ModerationStatus.approved },
  });
  // 公開経験が付いた道として検索の並び (roads.updatedAt desc) で浮上させる。
  await bumpRoadUpdatedAt(roadId);
  return (await getSeedData(roadId))!;
}

/** 1 件非公開に戻す (指示書 11)。一般ユーザーの検索・詳細から出なくなる。 */
export async function unpublishSeedData(roadId: string): Promise<SeedDataDTO> {
  const road = await requireSeedRoad(roadId);
  const attempt = road.attempts[0];
  if (attempt) {
    await prisma.attempt.update({
      where: { id: attempt.id },
      data: { isPublished: false, moderationStatus: ModerationStatus.pending },
    });
  }
  return (await getSeedData(roadId))!;
}

/** 1 件削除 (指示書 12)。Road を消すと紐づく Attempt は FK cascade で消える。 */
export async function deleteSeedData(roadId: string): Promise<void> {
  await requireSeedRoad(roadId); // 仮データ以外なら not_found
  await prisma.road.delete({ where: { id: roadId } });
}
