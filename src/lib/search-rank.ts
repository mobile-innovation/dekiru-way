/**
 * 検索結果のページ内関連度スコア (検索AI構築 v1 / Phase 1)。
 *
 * DB の並び順 (`buildExperienceOrderBy` / `updatedAt desc`) は変えず、
 * 取得後の 1 ページ分だけを関連度で並べ替えるための純関数。AI は使わない。
 * 既存の helpful / tried 並べ替え（`src/lib/queries.ts`）と同じ位置づけ。
 */

export interface RankField {
  text: string | null | undefined;
  /** この場所で一致したときの加点。呼び出し側が「困りごと=高 / 方法本文=中」を決める。 */
  weight: number;
}

/** road 側テキスト（困りごと・目標・タグ）は高め、method 本文は中くらい。 */
export const RANK_WEIGHT = { road: 3, method: 2 } as const;

/**
 * fields のどこかに term が含まれれば weight を加点。完全一致は 2 倍。
 * terms が空、または全フィールド空ならスコア 0。
 */
export function scoreText(fields: RankField[], terms: string[]): number {
  const needles = terms.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
  if (needles.length === 0) return 0;

  let score = 0;
  for (const field of fields) {
    const hay = (field.text ?? "").trim().toLowerCase();
    if (!hay) continue;
    for (const needle of needles) {
      if (hay === needle) score += field.weight * 2;
      else if (hay.includes(needle)) score += field.weight;
    }
  }
  return score;
}

/**
 * items をスコア降順の安定ソートで返す（同点は入力順を保つ）。
 * terms が空、または items が空ならそのまま返す。
 */
export function rankBySearchRelevance<T>(
  items: T[],
  terms: string[],
  toFields: (item: T) => RankField[],
): T[] {
  if (terms.length === 0 || items.length === 0) return items;
  return items
    .map((item, index) => ({ item, index, score: scoreText(toFields(item), terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.item);
}
