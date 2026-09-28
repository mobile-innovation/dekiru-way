import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { env } from "@huggingface/transformers";
import { buildRoadEmbeddingText, buildAttemptEmbeddingText } from "../../src/lib/search-embedding-text.ts";
import { createEmbedder, cosine } from "./embedder.ts";
import { presetFromEnv } from "./models.ts";
import { ROADS, ATTEMPTS, QUERIES, VARIANT_PAIRS } from "./dataset.ts";

/**
 * Stage 2 PoC ベンチ。1 プロセス = 1 モデル（メモリを分けて測るため）。
 *   EMBED_MODEL=e5-small-q8 npm run bench
 * 結果は results/<preset>-<cold|warm>.json に保存し、要約を標準出力に出す。
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { name, preset } = presetFromEnv();
const mb = (n: number) => Math.round(n / 1024 / 1024);
let peakRss = process.memoryUsage().rss;
const sample = () => {
  peakRss = Math.max(peakRss, process.memoryUsage().rss);
  return mb(process.memoryUsage().rss);
};
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const r = await fn();
  return [r, Math.round(performance.now() - t)];
}

const modelCacheDir = path.join(env.cacheDir as string, preset.modelId);
const cacheWasWarm = fs.existsSync(modelCacheDir);
const rssBefore = sample();

// ---- ロード ----
const [embedder, loadMs] = await timed(() => createEmbedder(preset));
const rssAfterLoad = sample();
const [, reloadMs] = await timed(() => createEmbedder(preset)); // 同一プロセス内の 2 回目（ディスクキャッシュから）
const rssAfterReload = sample();

// ---- 生成時間 ----
const one = "シャツのボタンがとめにくい";
const [, firstSingleMs] = await timed(() => embedder.embed("query", [one]));
const singleRuns: number[] = [];
for (let i = 0; i < 5; i++) singleRuns.push((await timed(() => embedder.embed("query", [one])))[1]);

const roadTexts = ROADS.map((r) => buildRoadEmbeddingText(r));
const attemptTexts = ATTEMPTS.map((a) => buildAttemptEmbeddingText(a));
const [roadVecs, roadsMs] = await timed(() => embedder.embed("passage", roadTexts));
const [attemptVecs, attemptsMs] = await timed(() => embedder.embed("passage", attemptTexts));
const ten = roadTexts.slice(0, 10);
const [, tenBatchMs] = await timed(() => embedder.embed("passage", ten));
const [, tenSeqMs] = await timed(async () => {
  for (const t of ten) await embedder.embed("passage", [t]);
});
const [queryVecs, queriesMs] = await timed(() => embedder.embed("query", QUERIES.map((q) => q.q)));
sample();

// 安定性: 同じ入力を 2 回
const [s1] = await embedder.embed("passage", [roadTexts[0]]);
const [s2] = await embedder.embed("passage", [roadTexts[0]]);
const stability = cosine(s1!, s2!);

// ---- 検索品質 ----
const rank = <T extends { id: string }>(qv: Float32Array, items: T[], vecs: (Float32Array | null)[]) =>
  items
    .map((it, i) => ({ id: it.id, score: vecs[i] ? cosine(qv, vecs[i]!) : -1 }))
    .sort((a, b) => b.score - a.score);

let hit1 = 0;
let hit3 = 0;
let mrr = 0;
const queryResults = QUERIES.map((q, qi) => {
  const roads = rank(queryVecs[qi]!, ROADS, roadVecs);
  const attempts = rank(queryVecs[qi]!, ATTEMPTS, attemptVecs);
  const pos = roads.findIndex((r) => r.id === q.relevantRoads[0]);
  if (pos === 0) hit1++;
  if (pos >= 0 && pos < 3) hit3++;
  mrr += pos >= 0 ? 1 / (pos + 1) : 0;
  return {
    q: q.q,
    expected: q.relevantRoads,
    expectedAttempts: q.relevantAttempts ?? [],
    expectedRank: pos + 1,
    topRoads: roads.slice(0, 3).map((r) => ({
      ...r,
      score: +r.score.toFixed(4),
      difficulty: ROADS.find((x) => x.id === r.id)!.difficulty,
    })),
    lastRoad: { ...roads.at(-1)!, score: +roads.at(-1)!.score.toFixed(4) },
    topAttempts: attempts.slice(0, 3).map((a) => ({
      ...a,
      score: +a.score.toFixed(4),
      method: ATTEMPTS.find((x) => x.id === a.id)!.method,
    })),
  };
});

// ---- 長文 ----
const sentence = "朝、シャツの小さいボタンをとめようとしても、指先に力が入らず、何度もやり直してしまう。";
const long2000 = sentence.repeat(Math.ceil(2000 / sentence.length)).slice(0, 2000);
const longRoadText = buildRoadEmbeddingText({ difficulty: long2000, situation: "毎朝", tags: ["着替え"] });
const longTokens = await embedder.countTokens("passage", longRoadText);
let longError: string | null = null;
let longMs = -1;
let tailIgnored: number | null = null;
try {
  [, longMs] = await timed(() => embedder.embed("passage", [longRoadText]));
  // 先頭が同じで末尾だけ違う 2 文 → 類似度 1.0 なら末尾は切り捨てられている（truncation）
  const head = buildRoadEmbeddingText({ difficulty: long2000 });
  const [a, b] = await embedder.embed("passage", [
    head + "\n困っている場面：お風呂に入るとき",
    head + "\n困っている場面：駅の階段を下りるとき",
  ]);
  tailIgnored = +cosine(a!, b!).toFixed(6);
} catch (e) {
  longError = e instanceof Error ? e.message : String(e);
}
sample();
const datasetTokenMax = Math.max(
  ...(await Promise.all(roadTexts.map((t) => embedder.countTokens("passage", t)))),
  ...(await Promise.all(attemptTexts.map((t) => embedder.countTokens("passage", t)))),
);
const charsFor512 = await (async () => {
  // 何文字でモデル上限に達するか（この文面での目安）
  let lo = 1;
  let hi = long2000.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const n = await embedder.countTokens("passage", buildRoadEmbeddingText({ difficulty: long2000.slice(0, mid) }));
    if (n <= embedder.maxLength) lo = mid;
    else hi = mid - 1;
  }
  return lo;
})();

// ---- 表記ゆれ ----
const variants = [];
for (const [x, y] of VARIANT_PAIRS) {
  const [vx, vy] = await embedder.embed("query", [x, y]);
  variants.push({ a: x, b: y, cosine: +cosine(vx!, vy!).toFixed(4) });
}

// ---- 空文字 ----
const empties = await embedder.embed("passage", ["", "   ", buildAttemptEmbeddingText({})]);

const modelFiles = fs.existsSync(modelCacheDir)
  ? fs
      .readdirSync(path.join(modelCacheDir, "onnx"))
      .map((f) => ({ f, mb: +(fs.statSync(path.join(modelCacheDir, "onnx", f)).size / 1e6).toFixed(1) }))
  : [];

const result = {
  preset: name,
  ...preset,
  env: {
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    transformers: JSON.parse(
      fs.readFileSync(path.join(HERE, "node_modules/@huggingface/transformers/package.json"), "utf8"),
    ).version,
  },
  cacheWasWarm,
  modelFiles,
  dims: embedder.dims,
  maxLength: embedder.maxLength,
  timingMs: {
    load: loadMs,
    reloadSameProcess: reloadMs,
    firstSingle: firstSingleMs,
    singleMedian: singleRuns.sort((a, b) => a - b)[2],
    roads18Batch: roadsMs,
    attempts30Batch: attemptsMs,
    ten10Batch: tenBatchMs,
    ten10Sequential: tenSeqMs,
    queries12Batch: queriesMs,
    long2000: longMs,
  },
  memoryMb: { before: rssBefore, afterLoad: rssAfterLoad, afterReload: rssAfterReload, peak: mb(peakRss) },
  stabilitySameInput: stability,
  quality: { hitAt1: hit1, hitAt3: hit3, mrr: +(mrr / QUERIES.length).toFixed(3), n: QUERIES.length },
  queryResults,
  long: {
    chars: longRoadText.length,
    tokens: longTokens,
    maxLength: embedder.maxLength,
    error: longError,
    tailDiffCosine: tailIgnored,
    datasetTokenMax,
    charsUntilMaxLength: charsFor512,
  },
  variants,
  emptyInputs: empties.map((v) => v === null),
};

fs.mkdirSync(path.join(HERE, "results"), { recursive: true });
const out = path.join(HERE, "results", `${name}-${cacheWasWarm ? "warm" : "cold"}.json`);
fs.writeFileSync(out, JSON.stringify(result, null, 2));

console.log(`# ${name} (${preset.modelId}, ${preset.dtype}) cache=${cacheWasWarm ? "warm" : "cold"}`);
console.log(JSON.stringify({ dims: result.dims, maxLength: result.maxLength, timingMs: result.timingMs, memoryMb: result.memoryMb, quality: result.quality, stability }, null, 0));
for (const r of queryResults) {
  console.log(
    `Q「${r.q}」 正解${r.expected.join("/")}→${r.expectedRank}位 | ` +
      r.topRoads.map((t, i) => `${i + 1}.${t.id}(${t.score}) ${t.difficulty}`).join(" | ") +
      ` || 試: ` +
      r.topAttempts.map((t) => `${t.id}(${t.score})`).join(" "),
  );
}
console.log("long:", JSON.stringify(result.long));
console.log("variants:", variants.map((v) => `${v.a}⇔${v.b}=${v.cosine}`).join(" / "));
console.log("empty→null:", result.emptyInputs.join(","), " saved:", path.relative(HERE, out));
