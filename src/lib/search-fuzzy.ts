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
 *
 * 2026-09-29: 短い検索語が長い本文の一部と一致する場合（「手動装置」→「手動運転装置を車に…」）は
 * similarity() が低く出る（0.074）ため、word_similarity()（本文の中で最も一致する範囲との類似度）も
 * 見る。語尾だけの一致は word_similarity でも 0.27〜0.29 程度だったので、しきい値はそれより上に置く。
 * 道の候補には、その道の公開済みの試したこと（方法・メモ）との一致も含める（通常検索の道カードと同じ）。
 */
const FUZZY_SIMILARITY_THRESHOLD = 0.08;
const FUZZY_WORD_SIMILARITY_THRESHOLD = 0.35;

/** 1 つの本文カラムが検索語に近いか（similarity または word_similarity がしきい値以上）。 */
const fieldMatches = (field: Prisma.Sql, t: string) =>
  Prisma.sql`(similarity(${field}, ${t}) >= ${FUZZY_SIMILARITY_THRESHOLD} OR word_similarity(${t}, ${field}) >= ${FUZZY_WORD_SIMILARITY_THRESHOLD})`;
/** 並び順に使う近さ（similarity と word_similarity の大きい方）。 */
const fieldScore = (field: Prisma.Sql, t: string) =>
  Prisma.sql`GREATEST(similarity(${field}, ${t}), word_similarity(${t}, ${field}))`;

/**
 * 内容語の手がかり。しきい値が低いので、短い検索語では「〜なくなった」「〜にくい」のような語尾の
 * 3 文字組だけで類似度を超えてしまう（本番で「字が読みづらくなった」に「…移動できなくなった」の道が
 * 並んだ）。そこで、検索語に含まれる漢字（1 文字ずつ）とカタカナ語（2 文字以上の並び）を内容語とみなし、
 * 1 つも含まない道・試したことは候補から外す。漢字もカタカナも無い（ひらがなだけの）検索語には掛けない。
 * 語尾・言い回しとして使われやすい表記は内容語から除く。
 */
const NON_CONTENT_PHRASES = ["出来", "難し", "分か", "事", "時", "方"];

/** 検索語の内容語（漢字 1 文字 / カタカナ 2 文字以上）。表記は NFKC に揃える（半角カナ → 全角）。 */
export function contentTokens(term: string): string[] {
  let t = term.normalize("NFKC");
  for (const p of NON_CONTENT_PHRASES) t = t.split(p).join(" ");
  const kanji = t.match(/\p{Script=Han}/gu) ?? [];
  const katakana = t.match(/[\p{Script=Katakana}ー]{2,}/gu) ?? [];
  return [...new Set([...kanji, ...katakana])];
}

/** 内容語のどれかを含むかの正規表現（内容語が無ければ null = 条件を掛けない）。 */
function contentPattern(term: string): string | null {
  const tokens = contentTokens(term);
  if (tokens.length === 0) return null;
  return tokens.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
}

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

/**
 * 公開されている道のうち、difficulty/situation/goal/previouslyAble、またはその道の公開済みの
 * 試したこと（方法・メモ）が検索語に近い順の id。
 */
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
  // 本文カラムごとの一致。語尾だけの一致を除くため、そのカラム自体が検索語の内容語
  // （漢字・カタカナ語）を 1 つ以上含むことも条件にする（内容語が無い検索語では掛けない）。
  const content = contentPattern(t);
  const hit = (f: Prisma.Sql) =>
    content ? Prisma.sql`(${fieldMatches(f, t)} AND ${f} ~ ${content})` : fieldMatches(f, t);
  const roadFields = [
    Prisma.sql`COALESCE(r.difficulty, '')`,
    Prisma.sql`COALESCE(r.situation, '')`,
    Prisma.sql`COALESCE(r.goal, '')`,
    Prisma.sql`COALESCE(r.previously_able, '')`,
  ];
  // その道の公開済みの試したこと（result 指定時はその結果のもの）。非公開の本文では当てない。
  const pubAttemptOfRoad = Prisma.sql`a.road_id = r.id AND ${publicAttemptSql("a")} ${resultSql}`;
  const method = Prisma.sql`a.method`;
  const memo = Prisma.sql`COALESCE(a.memo, '')`;

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT r.id
    FROM roads r
    WHERE ${Prisma.join(conds, " AND ")}
    AND (
      ${Prisma.join(roadFields.map(hit), " OR ")}
      OR EXISTS (
        SELECT 1 FROM attempts a
        WHERE ${pubAttemptOfRoad} AND (${hit(method)} OR ${hit(memo)})
      )
    )
    ORDER BY GREATEST(
      ${Prisma.join(roadFields.map((f) => fieldScore(f, t)), ", ")},
      COALESCE((
        SELECT MAX(GREATEST(${fieldScore(method, t)}, ${fieldScore(memo, t)}))
        FROM attempts a WHERE ${pubAttemptOfRoad}
      ), 0)
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
  // 本文カラムごとの一致（道と同じく、そのカラム自体が内容語を含むことも条件にする）。
  const content = contentPattern(t);
  const hit = (f: Prisma.Sql) =>
    content ? Prisma.sql`(${fieldMatches(f, t)} AND ${f} ~ ${content})` : fieldMatches(f, t);
  const method = Prisma.sql`a.method`;
  const memo = Prisma.sql`COALESCE(a.memo, '')`;

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT a.id
    FROM attempts a
    WHERE ${Prisma.join(conds, " AND ")}
    AND (${hit(method)} OR ${hit(memo)})
    ORDER BY GREATEST(${fieldScore(method, t)}, ${fieldScore(memo, t)}) DESC, a.id
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}
