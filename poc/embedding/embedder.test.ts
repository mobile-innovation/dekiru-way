import { test, before } from "node:test";
import assert from "node:assert/strict";
import { buildRoadEmbeddingText } from "../../src/lib/search-embedding-text.ts";
import { createEmbedder, cosine, toModelInput, type Embedder } from "./embedder.ts";
import { MODEL_PRESETS, presetFromEnv } from "./models.ts";

/**
 * Stage 2 PoC のテスト（本体の vitest とは別。モデルを実際にロードするため）。
 *   cd poc/embedding && npm test            # 既定 e5-small-q8
 *   EMBED_MODEL=bge-m3-q8 npm test
 * 初回はモデルを Hugging Face から取得する（以後 .model-cache から読む）。
 */

const { preset } = presetFromEnv();
let embedder: Embedder;
before(async () => {
  embedder = await createEmbedder(preset);
});

test("Embedding を生成できる（次元数が揃い、L2 正規化されている）", async () => {
  const [v] = await embedder.embed("passage", ["できなくなったこと：ボタンがとめにくい"]);
  assert.ok(v);
  assert.equal(v.length, embedder.dims);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(norm - 1) < 1e-4, `norm=${norm}`);
});

test("空文字・空白のみは Embedding を作らず null（他の入力の位置はずれない）", async () => {
  const out = await embedder.embed("passage", ["", "つめが切りにくい", "   "]);
  assert.equal(out[0], null);
  assert.ok(out[1] instanceof Float32Array);
  assert.equal(out[2], null);
  assert.deepEqual(await embedder.embed("query", [""]), [null]);
});

test("日本語で生成でき、意味の近い文が遠い文より近くなる", async () => {
  const [q, near, far] = await embedder.embed("query", [
    "シャツのボタンを一人で留めたい",
    "シャツのボタンがとめにくい",
    "階段の上り下りがこわい",
  ]);
  assert.ok(cosine(q!, near!) > cosine(q!, far!));
});

test("query と passage で入力方式を分けられる（e5 は接頭辞、bge-m3 は接頭辞なし）", async () => {
  const e5 = MODEL_PRESETS["e5-small-q8"];
  const bge = MODEL_PRESETS["bge-m3-q8"];
  assert.equal(toModelInput("query", "ボタンがとめにくい", e5), "query: ボタンがとめにくい");
  const road = buildRoadEmbeddingText({ difficulty: "ボタンがとめにくい", situation: "シャツを着るとき" });
  assert.equal(
    toModelInput("passage", road, e5),
    "passage: できなくなったこと：ボタンがとめにくい\n困っている場面：シャツを着るとき",
  );
  assert.equal(toModelInput("query", "ボタン", bge), "ボタン");
  assert.equal(toModelInput("passage", "  ", e5), null);

  // 接頭辞のあるモデルでは、同じ文でも query / passage でベクトルが変わる
  const [asQuery] = await embedder.embed("query", ["ボタンがとめにくい"]);
  const [asPassage] = await embedder.embed("passage", ["ボタンがとめにくい"]);
  const c = cosine(asQuery!, asPassage!);
  if (preset.queryPrefix !== preset.passagePrefix) assert.ok(c < 0.9999, `cos=${c}`);
  else assert.ok(c > 0.9999, `cos=${c}`);
});

test("cosine: 同じ向き=1、直交=0、逆向き=-1、次元違いはエラー", () => {
  const close = (x: number, y: number) => assert.ok(Math.abs(x - y) < 1e-12, `${x} != ${y}`);
  close(cosine([1, 0], [2, 0]), 1);
  close(cosine([1, 0], [0, 3]), 0);
  close(cosine([1, 1], [-1, -1]), -1);
  assert.equal(cosine([0, 0], [1, 0]), 0);
  assert.throws(() => cosine([1], [1, 0]));
});

test("同じ入力なら結果が安定する", async () => {
  const text = buildRoadEmbeddingText({ difficulty: "ペットボトルのふたが開けにくい", tags: ["握る力"] });
  const [a] = await embedder.embed("passage", [text]);
  const [b] = await embedder.embed("passage", [text]);
  assert.ok(cosine(a!, b!) > 0.999999);
});
