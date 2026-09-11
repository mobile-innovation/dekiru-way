import { prisma } from "@/lib/db";
import {
  buildExperienceWhere,
  buildExperienceOrderBy,
  buildRoadLevelSearchWhere,
  buildMethodSearchWhere,
  experienceInclude,
  PUBLIC_ATTEMPT_WHERE,
} from "@/lib/search";
import { rankBySearchRelevance, RANK_WEIGHT } from "@/lib/search-rank";
import { serializeExperience, serializeRoad, sortAttemptsChronologically } from "@/lib/serializers";
import { likedAttemptIdSet } from "@/lib/likes";
import { readAttemptIdSet } from "@/lib/reads";
import { buildRoadDetailRows, splitDetailRowsIntoPages } from "@/lib/road-detail";
import type { Branch } from "@/components/branching-paths";
import { MAX_RESULT_WINDOW, type ExperienceQuery } from "@/lib/validation";

/**
 * サーバーコンポーネントから直接使うデータ取得。
 * REST API と同じ where/serializer を共有し、二重定義を避ける。
 */

/** 「経験を探す」画面のカード 1 枚 = 一人の道（= 1 Road）。 */
export interface RoadCardDTO {
  /** カードのリンク先。この道の入口となる公開 Attempt の id */
  entryId: string;
  difficulty: string | null;
  goal: string | null;
  tags: string[];
  /** その人が公開している「試したこと」（時系列） */
  attempts: {
    id: string;
    method: string;
    result: string;
    triedAt: string | null;
    achievementPercent: number | null;
  }[];
  attemptCount: number;
  /** ログイン中ユーザーがこの道の公開経験を 1 つでも開いたか (未ログインは false)。 */
  isRead: boolean;
  /** 管理者が用意した仮データ (サンプル) か。カードに「サンプル」表示を出す (指示書 14)。 */
  isSeed: boolean;
}

// 「うまくいった順」用: 前向きな結果ほど小さい
const BEST_RESULT_RANK: Record<string, number> = {
  success: 0,
  partial: 1,
  ongoing: 2,
  no_change: 3,
  failed: 4,
};

/**
 * 「道」単位の検索 (UI修正指示書「道別カード」)。
 * 方法（Attempt）ごとではなく、困りごと（Road）ごとに 1 カード。
 * ページング・件数は「道」単位。`GET /api/v1/experiences`（Attempt 単位）は変更しない。
 *
 * `opts` は検索AI Phase 1 用（省略時は従来と完全に同じ）:
 *   - `terms`: AI が展開した検索語。where を語ごとの OR に広げる。
 *   - `rank`: true なら取得後の 1 ページ分を関連度で並べ替える（helpful/tried と同じ後処理）。
 */
export async function searchRoads(
  q: ExperienceQuery,
  viewerUserId?: string | null,
  opts?: { terms?: string[]; rank?: boolean },
) {
  const skip = (q.page - 1) * q.limit;
  if (skip >= MAX_RESULT_WINDOW) {
    return {
      items: [] as RoadCardDTO[],
      total: 0,
      page: q.page,
      limit: q.limit,
      hasMore: false,
      windowExceeded: true,
    };
  }

  const where = buildRoadLevelSearchWhere(q, viewerUserId, opts);
  const [total, roads] = await Promise.all([
    prisma.road.count({ where }),
    prisma.road.findMany({
      where,
      include: {
        roadTags: { include: { tag: true } },
        attempts: { where: PUBLIC_ATTEMPT_WHERE },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take: q.limit,
    }),
  ]);

  let items: RoadCardDTO[] = roads.map((road) => {
    const pub = road.attempts.slice().sort(sortAttemptsChronologically);
    return {
      entryId: pub[0]!.id, // 最初に試したこと = 道の入口
      difficulty: road.difficulty,
      goal: road.goal,
      tags: road.roadTags.map((rt) => rt.tag.name).sort((a, b) => a.localeCompare(b, "ja")),
      attempts: pub.map((a) => ({
        id: a.id,
        method: a.method,
        result: a.result,
        triedAt: a.triedAt ? a.triedAt.toISOString().slice(0, 10) : null,
        achievementPercent: a.achievementPercent,
      })),
      attemptCount: pub.length,
      isRead: false,
      isSeed: road.isSeedData,
    };
  });

  // ログイン中なら「その道の公開経験を 1 つでも開いたか」を既読として付ける (未ログインは全て false)。
  if (viewerUserId) {
    const readSet = await readAttemptIdSet(
      viewerUserId,
      items.flatMap((i) => i.attempts.map((a) => a.id)),
    );
    items = items.map((i) => ({
      ...i,
      isRead: i.attempts.some((a) => readSet.has(a.id)),
    }));
  }

  // 並び順は「道」単位で解釈し直す（DB は updatedAt desc で取得）
  if (q.sort === "helpful") {
    items = items.sort(
      (a, b) =>
        Math.min(...a.attempts.map((x) => BEST_RESULT_RANK[x.result] ?? 9)) -
        Math.min(...b.attempts.map((x) => BEST_RESULT_RANK[x.result] ?? 9)),
    );
  } else if (q.sort === "tried") {
    const lastTried = (r: RoadCardDTO) =>
      r.attempts.reduce((m, x) => (x.triedAt && x.triedAt > m ? x.triedAt : m), "");
    items = items.sort((a, b) => lastTried(b).localeCompare(lastTried(a)));
  }

  // 検索AI経路のみ: このページ内を関連度で並べ替える（DB の並び順は変えない）。
  if (opts?.rank && opts.terms && opts.terms.length > 0) {
    items = rankBySearchRelevance(items, opts.terms, (r) => [
      { text: r.difficulty, weight: RANK_WEIGHT.road },
      { text: r.goal, weight: RANK_WEIGHT.road },
      ...r.tags.map((t) => ({ text: t, weight: RANK_WEIGHT.road })),
      ...r.attempts.map((a) => ({ text: a.method, weight: RANK_WEIGHT.method })),
    ]);
  }

  return {
    items,
    total,
    page: q.page,
    limit: q.limit,
    hasMore: skip + roads.length < total && q.page < 100,
    windowExceeded: false,
  };
}

/** 「経験を探す」で、検索語が方法（試したこと本文・気づき）の中に当たった 1 件の記録カード。 */
export interface MethodCardDTO {
  /** カードのリンク先 = その方法の経験詳細（＝その方法が属する道の詳細） */
  attemptId: string;
  method: string;
  memo: string | null;
  result: string;
  triedAt: string | null;
  achievementPercent: number | null;
  /** どの道の方法か、の手がかり（内部 road_id は出さない） */
  roadDifficulty: string | null;
  roadGoal: string | null;
  roadTags: string[];
  /** その方法が道詳細ツリーの何ページ目に出るか（1 起点）。1 ならクエリ無しでリンク */
  treePage: number;
  /** ログイン中ユーザーがこの経験を既に開いたか (未ログインは false)。 */
  isRead: boolean;
  /** 管理者が用意した仮データ (サンプル) か (指示書 14)。 */
  isSeed: boolean;
}

/** 道詳細ツリー内で、その Attempt が出るページ番号（1 起点）を road ごとにまとめて計算。 */
async function treePageByAttempt(roadIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (roadIds.length === 0) return out;
  const siblings = await prisma.attempt.findMany({
    where: { roadId: { in: roadIds }, ...PUBLIC_ATTEMPT_WHERE },
    select: { id: true, roadId: true, method: true, result: true, triedAt: true, createdAt: true, previousAttemptId: true },
  });
  const byRoad = new Map<string, typeof siblings>();
  for (const s of siblings) {
    const list = byRoad.get(s.roadId) ?? [];
    list.push(s);
    byRoad.set(s.roadId, list);
  }
  for (const list of byRoad.values()) {
    const branches: Branch[] = list
      .slice()
      .sort(sortAttemptsChronologically)
      .map((s) => ({
        id: s.id,
        method: s.method,
        result: s.result,
        triedAt: s.triedAt ? s.triedAt.toISOString().slice(0, 10) : null,
        previousAttemptId: s.previousAttemptId,
      }));
    const pages = splitDetailRowsIntoPages(buildRoadDetailRows(branches));
    pages.forEach((pageRows, pi) => {
      for (const r of pageRows) out.set(r.branch.id, pi + 1);
    });
  }
  return out;
}

/**
 * 検索語が「方法の中」に当たった公開 Attempt を、方法カードとして返す (指示)。
 * 道カードと同じくページ制御する（クエリは `mp`。道の `page` とは独立）。
 * 1 ページ `limit` 件、深さ上限は道カードと同じ（`page ≤ 100`、`(mp-1)*limit < MAX_RESULT_WINDOW`）。
 * リンク先は「その方法が見えるページ」の道詳細（ツリーが分割されていれば ?p=N 付き）。
 */
export async function searchMethods(
  q: ExperienceQuery,
  viewerUserId?: string | null,
  opts?: { terms?: string[]; rank?: boolean },
) {
  const base = {
    items: [] as MethodCardDTO[],
    total: 0,
    page: q.mp,
    hasMore: false,
    windowExceeded: false,
  };
  const skip = (q.mp - 1) * q.limit;
  if (skip >= MAX_RESULT_WINDOW) return { ...base, windowExceeded: true };

  const where = buildMethodSearchWhere(q, viewerUserId, opts);
  const [total, rows] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      include: { road: { include: { roadTags: { include: { tag: true } } } } },
      orderBy: buildExperienceOrderBy(q.sort),
      skip,
      take: q.limit,
    }),
  ]);

  const pageOf = await treePageByAttempt([...new Set(rows.map((a) => a.roadId))]);
  const readSet = viewerUserId
    ? await readAttemptIdSet(
        viewerUserId,
        rows.map((a) => a.id),
      )
    : new Set<string>();

  let items: MethodCardDTO[] = rows.map((a) => ({
    attemptId: a.id,
    method: a.method,
    memo: a.memo,
    result: a.result,
    triedAt: a.triedAt ? a.triedAt.toISOString().slice(0, 10) : null,
    achievementPercent: a.achievementPercent,
    roadDifficulty: a.road.difficulty,
    roadGoal: a.road.goal,
    roadTags: a.road.roadTags.map((rt) => rt.tag.name).sort((x, y) => x.localeCompare(y, "ja")),
    treePage: pageOf.get(a.id) ?? 1,
    isRead: readSet.has(a.id),
    isSeed: a.road.isSeedData,
  }));

  // 検索AI経路のみ: このページ内を関連度で並べ替える（DB の並び順は変えない）。
  if (opts?.rank && opts.terms && opts.terms.length > 0) {
    items = rankBySearchRelevance(items, opts.terms, (m) => [
      { text: m.roadDifficulty, weight: RANK_WEIGHT.road },
      { text: m.roadGoal, weight: RANK_WEIGHT.road },
      ...m.roadTags.map((t) => ({ text: t, weight: RANK_WEIGHT.road })),
      { text: m.method, weight: RANK_WEIGHT.method },
      { text: m.memo, weight: RANK_WEIGHT.method },
    ]);
  }

  return {
    items,
    total,
    page: q.mp,
    hasMore: skip + rows.length < total && q.mp < 100,
    windowExceeded: false,
  };
}

export async function searchExperiences(q: ExperienceQuery, viewerUserId?: string | null) {
  const skip = (q.page - 1) * q.limit;
  // 深いページングでの実質的な全件取得を SSR 経由でも防ぐ (追加指示書 §4/§15)
  if (skip >= MAX_RESULT_WINDOW) {
    return { items: [], total: 0, page: q.page, limit: q.limit, hasMore: false, windowExceeded: true };
  }
  const where = buildExperienceWhere(q, viewerUserId);
  const [total, rows] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      include: experienceInclude,
      orderBy: buildExperienceOrderBy(q.sort),
      skip,
      take: q.limit,
    }),
  ]);
  const viewer = viewerUserId
    ? {
        userId: viewerUserId,
        likedAttemptIds: await likedAttemptIdSet(viewerUserId, rows.map((r) => r.id)),
        readAttemptIds: await readAttemptIdSet(viewerUserId, rows.map((r) => r.id)),
      }
    : undefined;
  return {
    items: rows.map((r) => serializeExperience(r, { viewer })),
    total,
    page: q.page,
    limit: q.limit,
    hasMore: skip + rows.length < total && q.page < 100,
    windowExceeded: false,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getExperience(id: string, viewerUserId?: string | null) {
  if (!UUID_RE.test(id)) return null;
  const row = await prisma.attempt.findFirst({
    where: { id, ...PUBLIC_ATTEMPT_WHERE },
    include: experienceInclude,
  });
  if (!row) return null;
  const siblings = await prisma.attempt.findMany({
    where: { roadId: row.roadId, ...PUBLIC_ATTEMPT_WHERE },
    include: experienceInclude,
  });
  const viewer = viewerUserId
    ? {
        userId: viewerUserId,
        likedAttemptIds: await likedAttemptIdSet(viewerUserId, [row.id]),
        readAttemptIds: await readAttemptIdSet(viewerUserId, [row.id]),
      }
    : undefined;
  return serializeExperience(row, { siblings, viewer });
}

export async function getPathClusters(opts: { q?: string; tag?: string; limit?: number }) {
  const rows = await prisma.attempt.findMany({
    where: buildExperienceWhere({ q: opts.q, tag: opts.tag }),
    include: experienceInclude,
    orderBy: { createdAt: "desc" },
    take: 400,
  });
  const byRoad = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byRoad.get(r.roadId) ?? [];
    list.push(r);
    byRoad.set(r.roadId, list);
  }
  return [...byRoad.values()]
    .map((attempts) => {
      const road = attempts[0].road;
      const steps = attempts
        .slice()
        .sort(sortAttemptsChronologically)
        .map((a) => ({ experienceId: a.id, method: a.method, result: a.result }));
      return {
        // 内部の road_id は公開面に出さない (追加指示書 §6/§7)。先頭経験の id を key に。
        key: steps[0]?.experienceId ?? attempts[0].id,
        difficulty: road.difficulty,
        goal: road.goal,
        previouslyAble: road.previouslyAble,
        tags: road.roadTags.map((rt) => rt.tag.name),
        isSeed: road.isSeedData,
        steps,
      };
    })
    .sort((a, b) => b.steps.length - a.steps.length)
    .slice(0, opts.limit ?? 8);
}

export async function getMyRoads(userId: string) {
  const roads = await prisma.road.findMany({
    where: { userId },
    include: {
      roadTags: { include: { tag: true } },
      attempts: true,
    },
    orderBy: { updatedAt: "desc" },
  });
  return roads.map(serializeRoad);
}

export async function getMyRoad(userId: string, roadId: string) {
  const road = await prisma.road.findFirst({
    where: { id: roadId, userId },
    include: {
      roadTags: { include: { tag: true } },
      attempts: true,
    },
  });
  return road ? serializeRoad(road) : null;
}

export async function getPopularTags(limit = 20) {
  const tags = await prisma.tag.findMany({
    where: { roadTags: { some: { road: { attempts: { some: PUBLIC_ATTEMPT_WHERE } } } } },
    select: {
      id: true,
      name: true,
      _count: {
        select: { roadTags: { where: { road: { attempts: { some: PUBLIC_ATTEMPT_WHERE } } } } },
      },
    },
  });
  return tags
    .map((t) => ({ id: t.id, name: t.name, roadCount: t._count.roadTags }))
    .sort((a, b) => b.roadCount - a.roadCount || a.name.localeCompare(b.name, "ja"))
    .slice(0, limit);
}
