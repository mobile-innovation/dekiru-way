import { Prisma, type AttemptResult } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publicAttemptSql } from "@/lib/search";
import { MAX_RESULT_WINDOW, type ExperienceQuery } from "@/lib/validation";

/**
 * 表記ゆれに強い検索（pg_trgm、AI・外部サービス不使用）。
 *
 * 通常のキーワード検索（ILIKE 部分一致。空白区切りの単語ごとの OR も含む。`resolveTerms`
 * 参照）で 0 件だったときだけ使う最後の手段。「つめが切りにくい」のように、保存されている
 * 文言（「つめを...切りにくく」等）と語順・言い回しが違うと ILIKE では見つからない場合を拾う。
 *
 * 短い単語（2〜3文字程度）どうしの類似度判定には向かない: pg_trgm の類似度は文字列の前後を
 * 境界パディングして計算するため、短い語が文中の途中（単語の切れ目が無い日本語では地の文の
 * 途中）に埋まっていると類似度が実質 0 になりやすい（実測で確認済み）。そのため単語分割は
 * せず、基本のキーワード検索（`resolveTerms` の単語分割）に任せ、ここではフレーズ全体の
 * 言い回しの違いだけを扱う。意味の異なる同義語（「爪切り」→「つめ」等）までは拾えない
 * （それには embedding が要る）。
 *
 * DB 内の pg_trgm 拡張だけで完結する（外部サービス呼び出し無し。課金・停止リスク無し）。
 * しきい値は実測（「つめが切りにくい」と保存文言の類似度が 0.125、語順が近い「つめ切り」が
 * ちょうど 0.1 だった）を踏まえて、境界のケースも拾えるよう 0.1 よりわずかに低くしている。
 *
 * 返す id は「類似度が高い順」。呼び出し側 (`searchRoads` / `searchMethods` の `ids`) は
 * この順を関連度順として扱い、Prisma の where（公開ゲート・絞り込み）で最終判定する。
 * ここでの絞り込み (`FuzzyFilters`) は、上位候補を切り出す前に条件に合わないものを除いて
 * 取りこぼしを防ぐためのもの（最終的な正しさは Prisma 側の where が保証する）。
 */
const FUZZY_SIMILARITY_THRESHOLD = 0.08;

/**
 * 候補 id の最大件数。深いページングの上限 (`MAX_RESULT_WINDOW`) と同じにして、
 * 到達可能なページぶんの候補を一度に確保する（1 ページ分だけ取ると 2 ページ目以降が空になる）。
 */
export const FUZZY_CANDIDATE_LIMIT = MAX_RESULT_WINDOW;

/**
 * 候補抽出の段階で適用する絞り込み。意味は `buildRoadLevelSearchWhere` /
 * `buildMethodSearchWhere`（src/lib/search.ts）の result / tag / read と揃える。
 */
export interface FuzzyFilters {
  result?: AttemptResult;
  tag?: ExperienceQuery["tag"];
  read?: ExperienceQuery["read"];
  viewerUserId?: string | null;
}

/**
 * タグ名 → tag id。照合は Prisma の `equals` + `mode: "insensitive"` をそのまま使い、
 * 通常検索のタグ絞り込みと同じ判定にする。null = タグ指定なし、[] = 該当タグなし。
 */
async function resolveTagIds(tag: string | undefined): Promise<string[] | null> {
  if (!tag) return null;
  const tags = await prisma.tag.findMany({
    where: { name: { equals: tag, mode: "insensitive" } },
    select: { id: true },
  });
  return tags.map((t) => t.id);
}

/** 公開されている道のうち、difficulty/situation/goal/previouslyAble が検索語に近い順の id。 */
export async function fuzzySearchRoadIds(
  term: string,
  limit: number,
  filters: FuzzyFilters = {},
): Promise<string[]> {
  const t = term.trim();
  if (!t) return [];
  const tagIds = await resolveTagIds(filters.tag);
  if (tagIds && tagIds.length === 0) return [];

  // 道が公開面に出る条件: 公開 Attempt（result 指定時はその結果のもの）を 1 つ以上持つ。
  const resultSql = filters.result
    ? Prisma.sql`AND a.result = ${filters.result}::"AttemptResult"`
    : Prisma.empty;
  const conds: Prisma.Sql[] = [
    Prisma.sql`EXISTS (
      SELECT 1 FROM attempts a
      WHERE a.road_id = r.id AND ${publicAttemptSql("a")} ${resultSql}
    )`,
  ];
  // 既読 / 未読: 道が「viewer が読んだ公開経験（result 指定時はその結果のもの）」を持つか / 全く持たないか。
  if (filters.read && filters.viewerUserId) {
    const readSql = Prisma.sql`EXISTS (
      SELECT 1 FROM attempts a
      JOIN attempt_reads ar ON ar.attempt_id = a.id
      WHERE a.road_id = r.id AND ${publicAttemptSql("a")} ${resultSql}
        AND ar.user_id = ${filters.viewerUserId}::uuid
    )`;
    conds.push(filters.read === "read" ? readSql : Prisma.sql`NOT ${readSql}`);
  }
  if (tagIds) {
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM road_tags rt WHERE rt.road_id = r.id AND rt.tag_id = ANY(${tagIds}::uuid[])
    )`);
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT r.id
    FROM roads r
    WHERE ${Prisma.join(conds, " AND ")}
    AND GREATEST(
      similarity(COALESCE(r.difficulty, ''), ${t}),
      similarity(COALESCE(r.situation, ''), ${t}),
      similarity(COALESCE(r.goal, ''), ${t}),
      similarity(COALESCE(r.previously_able, ''), ${t})
    ) >= ${FUZZY_SIMILARITY_THRESHOLD}
    ORDER BY GREATEST(
      similarity(COALESCE(r.difficulty, ''), ${t}),
      similarity(COALESCE(r.situation, ''), ${t}),
      similarity(COALESCE(r.goal, ''), ${t}),
      similarity(COALESCE(r.previously_able, ''), ${t})
    ) DESC, r.id
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}

/** 公開されている試したこと（Attempt）のうち、method/memo が検索語に近い順の id。 */
export async function fuzzySearchAttemptIds(
  term: string,
  limit: number,
  filters: FuzzyFilters = {},
): Promise<string[]> {
  const t = term.trim();
  if (!t) return [];
  const tagIds = await resolveTagIds(filters.tag);
  if (tagIds && tagIds.length === 0) return [];

  const conds: Prisma.Sql[] = [publicAttemptSql("a")];
  if (filters.result) conds.push(Prisma.sql`a.result = ${filters.result}::"AttemptResult"`);
  if (filters.read && filters.viewerUserId) {
    const readSql = Prisma.sql`EXISTS (
      SELECT 1 FROM attempt_reads ar
      WHERE ar.attempt_id = a.id AND ar.user_id = ${filters.viewerUserId}::uuid
    )`;
    conds.push(filters.read === "read" ? readSql : Prisma.sql`NOT ${readSql}`);
  }
  if (tagIds) {
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM road_tags rt WHERE rt.road_id = a.road_id AND rt.tag_id = ANY(${tagIds}::uuid[])
    )`);
  }

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT a.id
    FROM attempts a
    WHERE ${Prisma.join(conds, " AND ")}
    AND GREATEST(
      similarity(a.method, ${t}),
      similarity(COALESCE(a.memo, ''), ${t})
    ) >= ${FUZZY_SIMILARITY_THRESHOLD}
    ORDER BY GREATEST(
      similarity(a.method, ${t}),
      similarity(COALESCE(a.memo, ''), ${t})
    ) DESC, a.id
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}
