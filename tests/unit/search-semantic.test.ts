import { describe, it, expect, vi, afterEach } from "vitest";
import { createSemanticIndex, type SemanticCorpus } from "@/lib/search-semantic";
import type { Embedder } from "@/lib/embedding";
import { env } from "@/lib/env";

/**
 * 意味検索の索引（モデルは使わない。語の有無でベクトルを作る偽の Embedder で順位付けを確かめる）。
 */

const VOCAB = ["ボタン", "つめ", "ふた", "階段"];
function fakeEmbedder(calls: string[] = []): Embedder {
  return {
    async embed(kind, text) {
      const t = text.trim();
      if (!t) return null;
      calls.push(`${kind}:${t}`);
      const v = VOCAB.map((w) => (t.includes(w) ? 1 : 0));
      const v2 = [...v, 0.01]; // 全部 0 にならないよう小さな成分を足す
      const n = Math.sqrt(v2.reduce((s, x) => s + x * x, 0));
      return Float32Array.from(v2.map((x) => x / n));
    },
  };
}

const CORPUS: SemanticCorpus = {
  roads: [
    { id: "r-button", text: "できなくなったこと：ボタンがとめにくい" },
    { id: "r-nail", text: "できなくなったこと：つめが切りにくい" },
    { id: "r-stairs", text: "できなくなったこと：階段がこわい" },
  ],
  attempts: [
    { id: "a-button", text: "試したこと：ボタンエイドを使った" },
    { id: "a-lid", text: "試したこと：ふたオープナーを使った" },
    { id: "a-empty", text: "" },
  ],
};

function makeIndex(opts: { corpus?: () => SemanticCorpus; signature?: () => string; calls?: string[] } = {}) {
  const calls = opts.calls ?? [];
  const embedder = fakeEmbedder(calls);
  return {
    calls,
    index: createSemanticIndex({
      getEmbedder: async () => embedder,
      loadCorpus: async () => (opts.corpus ?? (() => CORPUS))(),
      corpusSignature: async () => (opts.signature ?? (() => "v1"))(),
    }),
  };
}

describe("createSemanticIndex", () => {
  it("検索語に近い順に道・試したことの id を返す", async () => {
    const { index } = makeIndex();
    const r = await index.rank("ボタンが留められない", 10);
    expect(r.roadIds[0]).toBe("r-button");
    expect(r.attemptIds[0]).toBe("a-button");
    expect(r.roadIds).toHaveLength(3);
  });

  it("topK 件までに絞る", async () => {
    const { index } = makeIndex();
    const r = await index.rank("つめ", 1);
    expect(r.roadIds).toEqual(["r-nail"]);
    expect(r.attemptIds).toHaveLength(1);
  });

  it("margin: 1 位との類似度の差が margin を超える結果は出さない（1 位は必ず出す）", async () => {
    const { index } = makeIndex();
    // 「ボタン」は r-button とだけ強く一致し、ほかは 1 位から大きく下がる
    const narrow = await index.rank("ボタン", 10, 0.02);
    expect(narrow.roadIds).toEqual(["r-button"]);
    expect(narrow.attemptIds).toEqual(["a-button"]);
    // margin を十分大きくすれば従来どおり全件（topK まで）
    const wide = await index.rank("ボタン", 10, 2);
    expect(wide.roadIds).toHaveLength(3);
    // margin 0 でも 1 位は必ず出る
    expect((await index.rank("つめ", 10, 0)).roadIds).toEqual(["r-nail"]);
    // 1 位と同点のものは差 0 なので一緒に出る（どれにも一致しない検索語では全件が同点）
    expect((await index.rank("まったく無関係", 10, 0)).roadIds).toHaveLength(3);
  });

  it("空の文章は索引に入れない。空の検索語は空の結果", async () => {
    const { index } = makeIndex();
    const r = await index.rank("ふた", 10);
    expect(r.attemptIds).not.toContain("a-empty");
    expect(await index.rank("   ", 10)).toEqual({ roadIds: [], attemptIds: [] });
  });

  it("文書は 1 件ずつ passage として Embedding し、公開データが変わらない限り作り直さない", async () => {
    const { index, calls } = makeIndex();
    await index.rank("ボタン", 10);
    const passages = calls.filter((c) => c.startsWith("passage:"));
    expect(passages).toHaveLength(5); // 空の 1 件を除く
    await index.rank("つめ", 10);
    expect(calls.filter((c) => c.startsWith("passage:"))).toHaveLength(5);
    expect(calls.filter((c) => c.startsWith("query:"))).toEqual(["query:ボタン", "query:つめ"]);
  });

  it("公開データが変わったら、本文が変わった行だけ Embedding し直す", async () => {
    let sig = "v1";
    let corpus = CORPUS;
    const { index, calls } = makeIndex({ corpus: () => corpus, signature: () => sig });
    await index.rank("ボタン", 10);
    sig = "v2";
    corpus = {
      roads: [...CORPUS.roads.slice(0, 2), { id: "r-stairs", text: "できなくなったこと：駅の階段がこわい" }],
      attempts: CORPUS.attempts,
    };
    calls.length = 0;
    const r = await index.rank("階段", 10);
    expect(calls.filter((c) => c.startsWith("passage:"))).toEqual(["passage:できなくなったこと：駅の階段がこわい"]);
    expect(r.roadIds[0]).toBe("r-stairs");
  });

  it("消えた行は結果に出ない", async () => {
    let sig = "v1";
    let corpus = CORPUS;
    const { index } = makeIndex({ corpus: () => corpus, signature: () => sig });
    await index.rank("ボタン", 10);
    sig = "v2";
    corpus = { roads: CORPUS.roads.slice(1), attempts: CORPUS.attempts.slice(1) };
    const r = await index.rank("ボタン", 10);
    expect(r.roadIds).not.toContain("r-button");
    expect(r.attemptIds).not.toContain("a-button");
  });

  it("同時に呼ばれても索引は 1 回だけ作る", async () => {
    const { index, calls } = makeIndex();
    await Promise.all([index.rank("ボタン", 10), index.rank("つめ", 10), index.rank("ふた", 10)]);
    expect(calls.filter((c) => c.startsWith("passage:"))).toHaveLength(5);
  });

  it("モデルの読み込みに失敗したら例外（呼び出し側が通常検索に戻す）", async () => {
    const index = createSemanticIndex({
      getEmbedder: async () => {
        throw new Error("model not found");
      },
      loadCorpus: async () => CORPUS,
      corpusSignature: async () => "v1",
    });
    await expect(index.rank("ボタン", 10)).rejects.toThrow("model not found");
  });
});

describe("env.semantic", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("既定は無効。有効化とモデル名の両方があるときだけ configured", () => {
    vi.stubEnv("SEMANTIC_SEARCH_ENABLED", "");
    vi.stubEnv("EMBEDDING_MODEL", "some/model");
    expect(env.semantic.configured).toBe(false);
    vi.stubEnv("SEMANTIC_SEARCH_ENABLED", "true");
    vi.stubEnv("EMBEDDING_MODEL", "");
    expect(env.semantic.configured).toBe(false);
    vi.stubEnv("EMBEDDING_MODEL", "some/model");
    expect(env.semantic.configured).toBe(true);
  });

  it("スレッド数は既定 1、不正値も 1。topK は既定 20、上限 500", () => {
    vi.stubEnv("EMBEDDING_THREADS", "");
    expect(env.semantic.threads).toBe(1);
    vi.stubEnv("EMBEDDING_THREADS", "abc");
    expect(env.semantic.threads).toBe(1);
    vi.stubEnv("EMBEDDING_THREADS", "2");
    expect(env.semantic.threads).toBe(2);
    vi.stubEnv("SEMANTIC_SEARCH_TOP_K", "");
    expect(env.semantic.topK).toBe(20);
    vi.stubEnv("SEMANTIC_SEARCH_TOP_K", "9999");
    expect(env.semantic.topK).toBe(500);
  });

  it("margin は既定 0.02（未設定・空・不正値・負の値も 0.02）", () => {
    vi.stubEnv("SEMANTIC_SEARCH_MARGIN", "");
    expect(env.semantic.margin).toBe(0.02);
    vi.stubEnv("SEMANTIC_SEARCH_MARGIN", "0");
    expect(env.semantic.margin).toBe(0);
    vi.stubEnv("SEMANTIC_SEARCH_MARGIN", "abc");
    expect(env.semantic.margin).toBe(0.02);
    vi.stubEnv("SEMANTIC_SEARCH_MARGIN", "-1");
    expect(env.semantic.margin).toBe(0.02);
    vi.stubEnv("SEMANTIC_SEARCH_MARGIN", "0.03");
    expect(env.semantic.margin).toBe(0.03);
  });
});
