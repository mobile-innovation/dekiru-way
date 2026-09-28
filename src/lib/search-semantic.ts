import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { PUBLIC_ATTEMPT_WHERE } from "@/lib/search";
import {
  buildRoadEmbeddingText,
  buildAttemptEmbeddingText,
} from "@/lib/search-embedding-text";
import { getEmbedder, type Embedder } from "@/lib/embedding";

/**
 * 意味検索（Embedding・試験導入。`/experiences?sem=1`）。
 *
 * pgvector は使わず、公開データの Embedding をこのプロセスのメモリに持って、検索のたびに
 * 類似度を計算する（公開データが少ないうちはこれで十分速い。件数が増えたら DB へ移す）。
 *
 * - 対象は公開検索と同じ基準（PUBLIC_ATTEMPT_WHERE）。仮データ（isSeedData）も公開検索と同じく含める。
 * - 文章は Stage 1 の buildRoadEmbeddingText / buildAttemptEmbeddingText で組み立てる。
 * - 公開データの件数・最終更新時刻が変わったら索引を作り直す。本文が変わっていない行は
 *   前回のベクトルを使い回す（変わった行だけ Embedding し直す）。
 * - 戻り値は類似度の高い順の id。絞り込み（結果・タグ・既読）と公開ゲートの最終判定は、
 *   呼び出し側が既存の searchRoads / searchMethods の `ids` 経路で行う。
 * - 固定の類似度しきい値は持たない（e5 系は無関係な文どうしでも類似度が高く出るため、固定の足切りが
 *   効かないことを検証で確認済み）。代わりに「1 位との差が margin 以内」のものだけを候補にする
 *   （1 位から大きく下がった結果＝関係の薄い結果を出さない）。さらに最大 topK 件に絞る。
 */

export interface SemanticDoc {
  id: string;
  text: string;
}
export interface SemanticCorpus {
  roads: SemanticDoc[];
  attempts: SemanticDoc[];
}
export interface SemanticRanking {
  /** 類似度の高い順 */
  roadIds: string[];
  attemptIds: string[];
}

interface IndexedDoc {
  id: string;
  vec: Float32Array;
}
interface SemanticIndexState {
  signature: string;
  roads: IndexedDoc[];
  attempts: IndexedDoc[];
}

export interface SemanticIndexDeps {
  getEmbedder: () => Promise<Embedder>;
  loadCorpus: () => Promise<SemanticCorpus>;
  /** 公開データが変わったら値が変わる文字列（索引を作り直すかの判定）。 */
  corpusSignature: () => Promise<string>;
}

/** 公開されている道・試したことの Embedding 用文章。 */
export async function loadPublicCorpus(): Promise<SemanticCorpus> {
  const [roads, attempts] = await Promise.all([
    prisma.road.findMany({
      where: { attempts: { some: PUBLIC_ATTEMPT_WHERE } },
      select: {
        id: true,
        difficulty: true,
        situation: true,
        goal: true,
        previouslyAble: true,
        roadTags: { select: { tag: { select: { name: true } } } },
      },
    }),
    prisma.attempt.findMany({
      where: PUBLIC_ATTEMPT_WHERE,
      select: { id: true, method: true, memo: true },
    }),
  ]);
  return {
    roads: roads.map(({ roadTags, ...r }) => ({
      id: r.id,
      text: buildRoadEmbeddingText({ ...r, tags: roadTags.map((rt) => rt.tag.name) }),
    })),
    attempts: attempts.map((a) => ({ id: a.id, text: buildAttemptEmbeddingText(a) })),
  };
}

/**
 * 公開データの件数と最終更新時刻。道の編集（タグ含む）は roads.updated_at、
 * 公開・非公開・審査・編集・削除は attempts の件数か updated_at に表れる。
 */
export async function publicCorpusSignature(): Promise<string> {
  const [r, a] = await Promise.all([
    prisma.road.aggregate({
      where: { attempts: { some: PUBLIC_ATTEMPT_WHERE } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.attempt.aggregate({
      where: PUBLIC_ATTEMPT_WHERE,
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
  ]);
  return [
    r._count._all,
    r._max.updatedAt?.toISOString() ?? "",
    a._count._all,
    a._max.updatedAt?.toISOString() ?? "",
  ].join("|");
}

const textKey = (text: string) => createHash("sha256").update(text).digest("hex");

/** L2 正規化済みベクトル同士のコサイン類似度（= 内積）。 */
function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function topIds(q: Float32Array, docs: IndexedDoc[], k: number, margin: number): string[] {
  const scored = docs
    .map((d) => ({ id: d.id, score: dot(q, d.vec) }))
    .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1));
  if (scored.length === 0) return [];
  const floor = scored[0].score - margin;
  return scored
    .filter((d) => d.score >= floor)
    .slice(0, k)
    .map((d) => d.id);
}

export function createSemanticIndex(deps: SemanticIndexDeps) {
  let state: SemanticIndexState | null = null;
  let building: Promise<SemanticIndexState> | null = null;
  /** 本文（のハッシュ）→ ベクトル。本文が変わらない行は作り直さない。 */
  let vectorCache = new Map<string, Float32Array>();

  async function rebuild(signature: string): Promise<SemanticIndexState> {
    const [corpus, embedder] = await Promise.all([deps.loadCorpus(), deps.getEmbedder()]);
    const nextCache = new Map<string, Float32Array>();
    const embedDocs = async (docs: SemanticDoc[]) => {
      const out: IndexedDoc[] = [];
      for (const d of docs) {
        const key = textKey(d.text);
        let vec = nextCache.get(key) ?? vectorCache.get(key);
        if (!vec) {
          const v = await embedder.embed("passage", d.text);
          if (!v) continue; // 空の文章は索引に入れない
          vec = v;
        }
        nextCache.set(key, vec);
        out.push({ id: d.id, vec });
      }
      return out;
    };
    const roads = await embedDocs(corpus.roads);
    const attempts = await embedDocs(corpus.attempts);
    vectorCache = nextCache;
    state = { signature, roads, attempts };
    return state;
  }

  async function ensureIndex(): Promise<SemanticIndexState> {
    const signature = await deps.corpusSignature();
    if (state && state.signature === signature) return state;
    if (!building) {
      building = rebuild(signature).finally(() => {
        building = null;
      });
    }
    return building;
  }

  return {
    /**
     * 検索語に意味が近い順の道 id / 試したこと id。それぞれ、1 位との類似度の差が margin 以内の
     * ものを最大 topK 件（1 位は必ず含む）。
     */
    async rank(query: string, topK: number, margin = Infinity): Promise<SemanticRanking> {
      const index = await ensureIndex();
      const embedder = await deps.getEmbedder();
      const q = await embedder.embed("query", query);
      if (!q) return { roadIds: [], attemptIds: [] };
      return {
        roadIds: topIds(q, index.roads, topK, margin),
        attemptIds: topIds(q, index.attempts, topK, margin),
      };
    },
  };
}

/** アプリで使う索引（プロセス内で 1 つ）。 */
export const semanticIndex = createSemanticIndex({
  getEmbedder,
  loadCorpus: loadPublicCorpus,
  corpusSignature: publicCorpusSignature,
});
