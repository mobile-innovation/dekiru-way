import {
  buildRoadEmbeddingText,
  buildAttemptEmbeddingText,
  normalizeEmbeddingValue,
  type RoadEmbeddingInput,
  type AttemptEmbeddingInput,
} from "../../../src/lib/search-embedding-text.ts";
import type { Embedder } from "../embedder.ts";

/**
 * Stage 3: 512 トークン対策の 3 方式（PoC。Stage 1 の組み立て関数は変えずに使う）。
 *
 *   A: Stage 1 の文章をそのまま渡し、モデル側の truncation（先頭 512 トークン）に任せる
 *   B: 上限を超えるときだけ、全項目を残したまま長い項目から均等に切り詰めて 512 以内にする
 *      （各項目の値を最大 c 文字に揃え、収まる最大の c を二分探索）。並び順は Stage 1 と同じ
 *      = 優先順 difficulty → situation → goal → previouslyAble → tags。
 *      ※ Stage 1 の並びが既に優先順なので、「優先順に入れて入らない分を捨てる」だけだと A と同じになる。
 *        そのため B は「後ろの項目が丸ごと消えない」ことを目的にした構成にしている。
 *   C: 項目ごとに別々に Embedding し、クエリとの類似度は項目ごとの最大値を使う
 *      （1 項目自体が 512 を超える場合、その項目の中ではモデル側 truncation がかかる）。
 */

export const ROAD_FIELDS = ["difficulty", "situation", "goal", "previouslyAble", "tags"] as const;
export type RoadField = (typeof ROAD_FIELDS)[number];
export const ATTEMPT_FIELDS = ["method", "memo"] as const;

type Fits = (text: string) => Promise<boolean>;

function capRoad(road: RoadEmbeddingInput, c: number): RoadEmbeddingInput {
  const cut = (v: string | null | undefined) => normalizeEmbeddingValue(v).slice(0, c);
  const tags: string[] = [];
  let used = 0;
  for (const t of road.tags ?? []) {
    const n = normalizeEmbeddingValue(t);
    if (!n) continue;
    if (used + n.length > c) break;
    tags.push(n);
    used += n.length + 1;
  }
  return {
    difficulty: cut(road.difficulty),
    situation: cut(road.situation),
    goal: cut(road.goal),
    previouslyAble: cut(road.previouslyAble),
    tags,
  };
}

async function waterFill<T>(
  input: T,
  build: (x: T) => string,
  cap: (x: T, c: number) => T,
  maxLen: number,
  fits: Fits,
): Promise<{ text: string; cap: number | null }> {
  const full = build(input);
  if (await fits(full)) return { text: full, cap: null };
  let lo = 1;
  let hi = maxLen;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (await fits(build(cap(input, mid)))) lo = mid;
    else hi = mid - 1;
  }
  return { text: build(cap(input, lo)), cap: lo };
}

export function fitsWithin(embedder: Embedder): Fits {
  return async (text) => (await embedder.countTokens("passage", text)) <= embedder.maxLength;
}

export function roadTextB(road: RoadEmbeddingInput, embedder: Embedder) {
  const longest = Math.max(
    ...[road.difficulty, road.situation, road.goal, road.previouslyAble].map((v) => (v ?? "").length),
    (road.tags ?? []).join("、").length,
  );
  return waterFill(road, buildRoadEmbeddingText, capRoad, longest, fitsWithin(embedder));
}

export function attemptTextB(attempt: AttemptEmbeddingInput, embedder: Embedder) {
  const longest = Math.max((attempt.method ?? "").length, (attempt.memo ?? "").length);
  return waterFill(
    attempt,
    buildAttemptEmbeddingText,
    (a, c) => ({
      method: normalizeEmbeddingValue(a.method).slice(0, c),
      memo: normalizeEmbeddingValue(a.memo).slice(0, c),
    }),
    longest,
    fitsWithin(embedder),
  );
}

/** C: 項目ごとの 1 行テキスト（Stage 1 の組み立てに 1 項目だけ渡す）。空の項目は出さない。 */
export function roadFieldTextsC(road: RoadEmbeddingInput): { field: RoadField; text: string }[] {
  return ROAD_FIELDS.map((field) => ({
    field,
    text: buildRoadEmbeddingText(field === "tags" ? { tags: road.tags } : { [field]: road[field] }),
  })).filter((x) => x.text !== "");
}

export function attemptFieldTextsC(a: AttemptEmbeddingInput) {
  return ATTEMPT_FIELDS.map((field) => ({
    field,
    text: buildAttemptEmbeddingText({ [field]: a[field] }),
  })).filter((x) => x.text !== "");
}

/**
 * 512 を超える文章で、各項目の行が「全部残る / 途中で切れる / 丸ごと消える」のどれか。
 * 行ごとに先頭からの累積トークン数（特殊トークン・接頭辞込み）を数えて判定する。
 */
export async function lineCutStatus(
  text: string,
  embedder: Embedder,
): Promise<{ label: string; status: "kept" | "partial" | "dropped"; cumTokens: number }[]> {
  const lines = text.split("\n");
  const out = [];
  let prev = 0;
  for (let k = 1; k <= lines.length; k++) {
    const cum = await embedder.countTokens("passage", lines.slice(0, k).join("\n"));
    const label = lines[k - 1].split("：")[0];
    const status = cum <= embedder.maxLength ? "kept" : prev < embedder.maxLength ? "partial" : "dropped";
    out.push({ label, status: status as "kept" | "partial" | "dropped", cumTokens: cum });
    prev = cum;
  }
  return out;
}
