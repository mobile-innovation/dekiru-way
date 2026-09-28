import { env } from "@/lib/env";

/**
 * ローカル Embedding モデル（Transformers.js / onnxruntime-node, CPU）の読み込み。
 * 意味検索（src/lib/search-semantic.ts）専用。従量課金 API は使わない。
 *
 * - `@huggingface/transformers` は動的 import する。意味検索を使わない限りモジュールも
 *   モデルも読み込まれない（無効時のメモリ増加なし）。
 * - 最初に呼ばれたときに 1 回だけ読み込み、以後は同じインスタンスを使う。
 *   読み込みに失敗したら次回また試す（失敗を固定しない）。
 * - 1 件ずつ Embedding する。q8 モデルは複数件をまとめて渡すとパディングの影響で
 *   ベクトルがわずかに変わり、僅差の順位が入れ替わることを PoC で確認しているため。
 */

export type EmbedKind = "query" | "passage";

export interface Embedder {
  /** 空文字（空白のみ）は null。ベクトルは L2 正規化済み。 */
  embed(kind: EmbedKind, text: string): Promise<Float32Array | null>;
}

let loading: Promise<Embedder> | null = null;

export function getEmbedder(): Promise<Embedder> {
  if (!loading) {
    loading = loadEmbedder().catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

async function loadEmbedder(): Promise<Embedder> {
  const cfg = env.semantic;
  if (!cfg.configured) throw new Error("意味検索が有効化されていません");

  const tf = await import("@huggingface/transformers");
  tf.env.allowRemoteModels = cfg.allowRemote;
  if (cfg.modelPath) {
    tf.env.localModelPath = cfg.modelPath;
    tf.env.cacheDir = cfg.modelPath;
  }
  const extractor = await tf.pipeline("feature-extraction", cfg.model, {
    dtype: cfg.dtype as "q8",
    device: "cpu",
    session_options: { intraOpNumThreads: cfg.threads, interOpNumThreads: 1 },
  });

  return {
    async embed(kind, text) {
      const t = text.trim();
      if (!t) return null;
      const input = (kind === "query" ? cfg.queryPrefix : cfg.passagePrefix) + t;
      const out = await extractor(input, { pooling: cfg.pooling, normalize: true });
      return Float32Array.from(out.data as Float32Array);
    },
  };
}
