/**
 * Stage 2 PoC: 比較するローカル Embedding モデルの設定。
 * 本番コードにモデル名を持ち込まないよう、モデル名・前処理はこの PoC の設定としてだけ持つ。
 * 実行時は環境変数 EMBED_MODEL（下記 preset のキー）で切り替える。
 *
 * 仕様の出典（各モデルカード）:
 *   - intfloat/multilingual-e5-small: 入力の先頭に必ず "query: " / "passage: " を付ける
 *     （非英語でも同じ）。平均プーリング（average_pool）＋ L2 正規化。最大 512 トークン。
 *   - BAAI/bge-m3: クエリに指示文（prefix）は不要。CLS プーリング＋ L2 正規化。最大 8192 トークン。
 *     Xenova/bge-m3 のモデルカードの Transformers.js 例も pooling: 'cls', normalize: true。
 */

export type Pooling = "mean" | "cls";
/** Transformers.js の dtype。q8 = onnx/model_quantized.onnx、fp32 = onnx/model.onnx。 */
export type Dtype = "q8" | "fp32";

export interface ModelPreset {
  /** Hugging Face 上のモデル ID（Transformers.js 用 ONNX 変換版） */
  modelId: string;
  dtype: Dtype;
  pooling: Pooling;
  /** 検索語 (query) に付ける接頭辞。不要なら "" */
  queryPrefix: string;
  /** 文書 (passage / document) に付ける接頭辞。不要なら "" */
  passagePrefix: string;
}

export const MODEL_PRESETS = {
  "e5-small-q8": {
    modelId: "Xenova/multilingual-e5-small",
    dtype: "q8",
    pooling: "mean",
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
  },
  "e5-small-fp32": {
    modelId: "Xenova/multilingual-e5-small",
    dtype: "fp32",
    pooling: "mean",
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
  },
  "bge-m3-q8": {
    modelId: "Xenova/bge-m3",
    dtype: "q8",
    pooling: "cls",
    queryPrefix: "",
    passagePrefix: "",
  },
} as const satisfies Record<string, ModelPreset>;

export type PresetName = keyof typeof MODEL_PRESETS;

export function presetFromEnv(name = process.env.EMBED_MODEL ?? "e5-small-q8"): {
  name: PresetName;
  preset: ModelPreset;
} {
  if (!(name in MODEL_PRESETS)) {
    throw new Error(`EMBED_MODEL=${name} は未定義。候補: ${Object.keys(MODEL_PRESETS).join(", ")}`);
  }
  return { name: name as PresetName, preset: MODEL_PRESETS[name as PresetName] };
}
