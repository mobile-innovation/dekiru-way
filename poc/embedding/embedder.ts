import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline, AutoTokenizer, type FeatureExtractionPipeline } from "@huggingface/transformers";
import type { ModelPreset } from "./models.ts";

/**
 * Stage 2 PoC: Transformers.js（Node / onnxruntime-node, CPU）でローカル Embedding を作る。
 * 外部 API は呼ばない（初回だけ Hugging Face からモデルファイルを取得し、以後はローカルキャッシュ）。
 *
 * Stage 1 の buildRoadEmbeddingText / buildAttemptEmbeddingText は変えず、
 * モデル固有の接頭辞（e5 の "query: " / "passage: "）はここ（モデル入力の直前）で付ける。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** モデルのキャッシュ先（PoC ディレクトリ内。git 管理外）。 */
env.cacheDir = path.join(HERE, ".model-cache");

export type InputKind = "query" | "passage";

/** モデルに渡す直前の入力。空（空白のみ含む）なら null（Embedding を作らない）。 */
export function toModelInput(kind: InputKind, text: string, preset: ModelPreset): string | null {
  const t = text.trim();
  if (!t) return null;
  return (kind === "query" ? preset.queryPrefix : preset.passagePrefix) + t;
}

/** コサイン類似度。正規化済みベクトルなら内積と同じ。 */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface Embedder {
  preset: ModelPreset;
  dims: number;
  /** 空の入力は null を返す（位置は入力と対応）。 */
  embed(kind: InputKind, texts: string[]): Promise<(Float32Array | null)[]>;
  /** モデル入力（接頭辞込み）のトークン数。truncation しない。 */
  countTokens(kind: InputKind, text: string): Promise<number>;
  /** tokenizer の最大入力長（model_max_length）。 */
  maxLength: number;
}

export async function createEmbedder(preset: ModelPreset): Promise<Embedder> {
  const extractor: FeatureExtractionPipeline = await pipeline("feature-extraction", preset.modelId, {
    dtype: preset.dtype,
    device: "cpu",
  });
  const tokenizer = await AutoTokenizer.from_pretrained(preset.modelId);
  const maxLength = Number(tokenizer.model_max_length);

  async function embed(kind: InputKind, texts: string[]): Promise<(Float32Array | null)[]> {
    const inputs = texts.map((t) => toModelInput(kind, t, preset));
    const nonEmpty = inputs.filter((x): x is string => x !== null);
    const out: (Float32Array | null)[] = inputs.map(() => null);
    if (nonEmpty.length === 0) return out;
    const tensor = await extractor(nonEmpty, { pooling: preset.pooling, normalize: true });
    const dims = tensor.dims[1];
    const data = tensor.data as Float32Array;
    let j = 0;
    inputs.forEach((x, i) => {
      if (x === null) return;
      out[i] = data.slice(j * dims, (j + 1) * dims);
      j++;
    });
    return out;
  }

  const probe = await embed("query", ["次元数の確認"]);
  return {
    preset,
    dims: probe[0]!.length,
    maxLength,
    embed,
    async countTokens(kind, text) {
      const input = toModelInput(kind, text, preset) ?? "";
      const enc = tokenizer(input, { truncation: false });
      return enc.input_ids.dims[1];
    },
  };
}
