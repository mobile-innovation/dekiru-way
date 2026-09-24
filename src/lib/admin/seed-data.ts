import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { toDbDate } from "@/lib/dates";
import { serializeAttempt, sortAttemptsChronologically } from "@/lib/serializers";
import { publishStateOf, type PublishState } from "@/lib/publish-state";
import { bumpRoadUpdatedAt } from "@/lib/moderation";
import type { SeedRoadWithAttemptsInput, SeedUpdateInput } from "@/lib/validation";

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
  /**
   * 公開状態。複数 Attempt を持つ仮データ (Markdown取り込み) は、このモジュールの
   * publish/unpublish がすべての Attempt を同時に切り替えるため (1 つの試行錯誤の物語として
   * まとめて確認・公開する。管理画面更新指示書 §7/§12)、先頭 Attempt の状態で代表する。
   */
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
  /** 試したこと。Markdown取り込みは複数件、AI 生成は 1 件（従来どおり）。時系列順。 */
  attempts: ReturnType<typeof serializeAttempt>[];
}

function serializeSeedRoad(road: SeedRoadRow): SeedDataDTO {
  const sorted = road.attempts.slice().sort(sortAttemptsChronologically);
  const first = sorted[0] ?? null;
  return {
    id: road.id,
    dataOrigin: road.dataOrigin,
    aiGenerated: road.dataOrigin === "ai_seed",
    createdAt: road.createdAt.toISOString(),
    updatedAt: road.updatedAt.toISOString(),
    publishState: first ? publishStateOf(first) : "private",
    isPublished: first?.isPublished ?? false,
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
    attempts: sorted.map(serializeAttempt),
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
 * Road（＋複数可の Attempt）を「すべて非公開」で保存する (指示書 9 / 11。
 * 管理画面更新指示書「複数の試したことを持つ道」§13 の「既存の保存処理」に相当)。
 * `keyword` は生成時のテーマ、または Markdown取り込み時の識別ラベル。
 *
 * Attempt は Road ごとに 1 件ずつ順番に `create` する。既存スキーマに並び順を持つ列は無く、
 * 表示順は全画面で `triedAt ?? createdAt` (`sortAttemptsChronologically`) に従っているため
 * (指示書 §6「勝手に新しい並び順を導入しない」)、Markdown / 配列の順に 1 件ずつ作成し、
 * 生成される `createdAt` の単調増加だけで順序を保証する（`createMany` を使うとこの順序保証が
 * 崩れるため使わない。1 トランザクション内での連続 `create` が異なる `createdAt` を持つことは
 * 実際に確認済み）。
 */
export async function persistSeedRoads(
  roads: SeedRoadWithAttemptsInput[],
  keyword?: string | null,
): Promise<SeedDataDTO[]> {
  const owner = await getOrCreateSeedOwner();
  const ids: string[] = [];
  const seedKeyword = keyword?.trim() ? keyword.trim() : null;

  await prisma.$transaction(async (tx) => {
    for (const r of roads) {
      const road = await tx.road.create({
        data: {
          userId: owner.id,
          isSeedData: true,
          dataOrigin: "ai_seed",
          seedKeyword,
          difficulty: r.difficulty ?? null,
          previouslyAble: r.previouslyAble ?? null,
          goal: r.goal ?? null,
          situation: r.situation ?? null,
          startedAt: toDbDate(r.startedAt) ?? null,
          memo: r.memo ?? null,
          status: r.status ?? null,
          progress: r.progress ?? null,
          nextAction: r.nextAction ?? null,
        },
        select: { id: true },
      });
      for (const a of r.attempts) {
        await tx.attempt.create({
          data: {
            roadId: road.id,
            method: a.method,
            result: a.result,
            triedAt: toDbDate(a.triedAt) ?? null,
            memo: a.attemptMemo ?? null,
            // 保存時は必ず非公開。moderationStatus は既定の pending のまま。
            isPublished: false,
          },
        });
      }
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

/**
 * 仮データ一覧。`published` を指定すると、公開 / 非公開でしぼり込む
 * (一覧画面の「非公開／公開」表示切り替え。既定＝しぼり込みなし)。
 * タブの件数表示用に、非公開・公開・全体の件数も返す。
 */
export async function listSeedData(opts: { page?: number; published?: boolean } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const seed: Prisma.RoadWhereInput = { isSeedData: true };
  const where: Prisma.RoadWhereInput =
    opts.published === undefined
      ? seed
      : { ...seed, attempts: { some: { isPublished: opts.published } } };

  const [total, allCount, privateCount, publishedCount, rows] = await Promise.all([
    prisma.road.count({ where }),
    prisma.road.count({ where: seed }),
    prisma.road.count({ where: { ...seed, attempts: { some: { isPublished: false } } } }),
    prisma.road.count({ where: { ...seed, attempts: { some: { isPublished: true } } } }),
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
    counts: { all: allCount, private: privateCount, published: publishedCount },
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

/**
 * 1 件編集。Road 側 / Attempt 側の指定されたフィールドだけ更新する。
 * **既知の制限**: 複数 Attempt を持つ仮データ（Markdown取り込み）でも、Attempt 側の更新は
 * 先頭（時系列順で最初）の 1 件だけに効く。Markdown取り込みの確認・編集は保存前（parse 直後）に
 * 画面上で完結させる設計のため、保存後の編集 API は 2 件目以降の Attempt を編集する手段を今回は
 * 持たない（他の Attempt が消えたり書き換わったりはしない。編集できないだけ）。
 * 管理画面更新指示書 §16「今回の作業で不要な全面改修はしない」に沿った判断。
 */
export async function updateSeedData(
  roadId: string,
  input: SeedUpdateInput,
): Promise<SeedDataDTO> {
  const road = await requireSeedRoad(roadId);
  const attempt = road.attempts.slice().sort(sortAttemptsChronologically)[0];

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
 * 複数 Attempt を持つ仮データ（Markdown取り込み）は、1 つの試行錯誤の物語として道ごと確認・
 * 公開する設計のため、その道の Attempt を**すべて同時に**公開する（管理画面更新指示書 §7/§9/§12。
 * 「公開は1件ずつ」の「1件」を Road 単位と解釈した — 1 つの道の一部の Attempt だけを公開すると
 * 途中で切れた話になってしまうため）。
 */
export async function publishSeedData(roadId: string): Promise<SeedDataDTO> {
  const road = await requireSeedRoad(roadId);
  if (road.attempts.length === 0) {
    throw new ApiError("bad_request", "この仮データには試したことがありません");
  }
  await prisma.attempt.updateMany({
    where: { roadId },
    data: { isPublished: true, moderationStatus: ModerationStatus.approved },
  });
  // 公開経験が付いた道として検索の並び (roads.updatedAt desc) で浮上させる。
  await bumpRoadUpdatedAt(roadId);
  return (await getSeedData(roadId))!;
}

/**
 * 1 件非公開に戻す (指示書 11)。一般ユーザーの検索・詳細から出なくなる。
 * `publishSeedData` と対で、その道の Attempt をすべて同時に非公開へ戻す。
 */
export async function unpublishSeedData(roadId: string): Promise<SeedDataDTO> {
  const road = await requireSeedRoad(roadId);
  if (road.attempts.length > 0) {
    await prisma.attempt.updateMany({
      where: { roadId },
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
