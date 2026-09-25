import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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
 */
const FUZZY_SIMILARITY_THRESHOLD = 0.08;

/** 公開されている道のうち、difficulty/situation/goal/previouslyAble が検索語に近い順の id。 */
export async function fuzzySearchRoadIds(term: string, limit: number): Promise<string[]> {
  const t = term.trim();
  if (!t) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT r.id
    FROM roads r
    WHERE EXISTS (
      SELECT 1 FROM attempts a
      WHERE a.road_id = r.id AND a.is_published = true AND a.moderation_status = 'approved'
    )
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
    ) DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}

/** 公開されている試したこと（Attempt）のうち、method/memo が検索語に近い順の id。 */
export async function fuzzySearchAttemptIds(term: string, limit: number): Promise<string[]> {
  const t = term.trim();
  if (!t) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT a.id
    FROM attempts a
    WHERE a.is_published = true AND a.moderation_status = 'approved'
    AND GREATEST(
      similarity(a.method, ${t}),
      similarity(COALESCE(a.memo, ''), ${t})
    ) >= ${FUZZY_SIMILARITY_THRESHOLD}
    ORDER BY GREATEST(
      similarity(a.method, ${t}),
      similarity(COALESCE(a.memo, ''), ${t})
    ) DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => r.id);
}
