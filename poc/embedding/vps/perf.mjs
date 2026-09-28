// Stage 3: VPS 上での e5-small q8 性能計測（単体スクリプト。DB・利用者データは使わない）。
//
//   node perf.mjs                                  # 既定（onnxruntime のスレッド数は既定値）
//   THREADS=1 node perf.mjs                        # 推論スレッドを 1 本に制限
//   PROBE_URL=http://localhost:4000/ node perf.mjs # 計測中の Next.js の応答時間も測る
//
// モデルは同梱の ./models から読む（外部に取りに行かない: allowRemoteModels=false）。
// 結果は標準出力と ./perf-<THREADS>-<時刻>.json に出す。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { monitorEventLoopDelay } from "node:perf_hooks";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL_ID = process.env.MODEL_ID ?? "Xenova/multilingual-e5-small";
const THREADS = process.env.THREADS ? Number(process.env.THREADS) : null;
const PROBE_URL = process.env.PROBE_URL ?? null;

const mb = (n) => Math.round(n / 1048576);
const mem = () => {
  const m = process.memoryUsage();
  return { rss: mb(m.rss), heap: mb(m.heapUsed), external: mb(m.external) };
};
let peakRss = process.memoryUsage().rss;
const tick = () => (peakRss = Math.max(peakRss, process.memoryUsage().rss));
/** 経過時間と CPU 時間（user+system）。cpuRatio ≒ 使ったコア数。 */
async function measure(fn) {
  const c0 = process.cpuUsage();
  const t0 = performance.now();
  const r = await fn();
  const wall = performance.now() - t0;
  const c = process.cpuUsage(c0);
  tick();
  const cpu = (c.user + c.system) / 1000;
  return { r, ms: Math.round(wall), cpuMs: Math.round(cpu), cpuRatio: +(cpu / Math.max(1, wall)).toFixed(2) };
}
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * Next.js の応答時間を「別プロセス」から測る（このプロセスは Embedding でイベントループが
 * 止まることがあるため、同じプロセスから fetch すると Next ではなく自分の遅延を測ってしまう）。
 */
function probeLatency(n = 5, gapMs = 300) {
  if (!PROBE_URL) return Promise.resolve(null);
  const code = `
    const url = process.argv[1], n = +process.argv[2], gap = +process.argv[3];
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = performance.now();
      try { const r = await fetch(url, { headers: { "user-agent": "dekiru-embedding-perf" } }); await r.arrayBuffer(); out.push(Math.round(performance.now() - t)); }
      catch { out.push(-1); }
      await new Promise((r) => setTimeout(r, gap));
    }
    console.log(JSON.stringify(out));`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", code, PROBE_URL, String(n), String(gapMs)]);
    let buf = "";
    child.stdout.on("data", (d) => (buf += d));
    child.on("close", () => {
      const samples = JSON.parse(buf || "[]");
      resolve({ samples, median: samples.length ? median(samples) : null });
    });
  });
}

/** このプロセスのイベントループがどれだけ止まったか（同一プロセスに載せたときの影響の目安）。 */
async function withLoopDelay(fn) {
  const h = monitorEventLoopDelay({ resolution: 10 });
  h.enable();
  const r = await fn();
  h.disable();
  return { r, loopDelayMs: { p50: +(h.percentile(50) / 1e6).toFixed(1), p99: +(h.percentile(99) / 1e6).toFixed(1), max: +(h.max / 1e6).toFixed(1) } };
}

// 合成テキスト（Stage 1 の書式に合わせた道の文章。利用者データではない）
const TOPICS = [
  ["シャツのボタンがとめにくい", "朝の着替えのとき", "一人で着替えたい", "以前は何も考えずにとめていた", "着替え、手先"],
  ["つめが切りにくい", "お風呂上がり", "自分でつめを切りたい", "", "身だしなみ"],
  ["駅の階段がこわい", "人が多い時間帯", "通院で駅を使いたい", "手すりなしで上り下りしていた", "外出、移動"],
  ["ペットボトルのふたが開けにくい", "外出先で飲み物を買ったとき", "自分で水分をとりたい", "", "握る力"],
  ["薬を飲んだか忘れてしまう", "昼食後", "飲み忘れをなくしたい", "", "くすり、習慣"],
];
const passage = (i) => {
  const [d, s, g, p, t] = TOPICS[i % TOPICS.length];
  return [
    `できなくなったこと：${d}（${i}）`,
    s && `困っている場面：${s}`,
    `できるようになりたいこと：${g}`,
    p && `以前できていたこと：${p}`,
    t && `タグ：${t}`,
  ]
    .filter(Boolean)
    .map((l, k) => (k === 0 ? `passage: ${l}` : l))
    .join("\n");
};
const batch = (n) => Array.from({ length: n }, (_, i) => passage(i));

const result = {
  when: new Date().toISOString(),
  env: {
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    totalMemMb: mb(os.totalmem()),
    freeMemMbAtStart: mb(os.freemem()),
    loadavgAtStart: os.loadavg(),
  },
  model: MODEL_ID,
  dtype: "q8",
  threads: THREADS ?? "default",
  memory: { atStart: mem() },
};

const nextIdle = await probeLatency();

const { env, pipeline } = await import("@huggingface/transformers");
env.allowRemoteModels = false;
env.localModelPath = path.join(HERE, "models");
result.memory.afterImport = mem();

const opts = {
  dtype: "q8",
  device: "cpu",
  ...(THREADS ? { session_options: { intraOpNumThreads: THREADS, interOpNumThreads: 1 } } : {}),
};
const load1 = await measure(() => pipeline("feature-extraction", MODEL_ID, opts));
const extractor = load1.r;
result.memory.afterLoad = mem();
const load2 = await measure(() => pipeline("feature-extraction", MODEL_ID, opts));
await load2.r.dispose?.();
result.memory.afterSecondLoadDisposed = mem();

const run = (texts) => extractor(texts, { pooling: "mean", normalize: true });
const dims = (await run(["passage: 次元の確認"])).dims[1];

const timings = {};
for (const n of [1, 10, 30, 100]) {
  const texts = batch(n);
  const reps = n >= 100 ? 3 : 5;
  const runs = [];
  for (let k = 0; k < reps; k++) runs.push(await measure(() => run(texts)));
  timings[`batch${n}`] = {
    msMedian: median(runs.map((x) => x.ms)),
    msAll: runs.map((x) => x.ms),
    cpuRatioMedian: median(runs.map((x) => x.cpuRatio)),
  };
}
// クエリ 1 件（検索時に毎回発生するもの）
const q = [];
for (let k = 0; k < 10; k++) q.push(await measure(() => run(["query: 指が動かしにくくてシャツを着るのが大変"])));
timings.query1 = { msMedian: median(q.map((x) => x.ms)), cpuRatioMedian: median(q.map((x) => x.cpuRatio)) };

// 同時実行: クエリ 1 件を 4 本 / 8 本同時に投げたときの全体時間
for (const c of [4, 8]) {
  const m = await measure(() =>
    Promise.all(Array.from({ length: c }, (_, i) => run([`query: 同時実行の確認 ${i}`]))),
  );
  timings[`concurrent${c}xQuery1`] = { ms: m.ms, cpuRatio: m.cpuRatio };
}

// 100 件バッチを 3 回続けて実行している間の、このプロセスのイベントループ遅延と Next.js の応答時間
const texts100 = batch(100);
const probeDuring = probeLatency(8, 200);
const during = await withLoopDelay(async () => {
  for (let k = 0; k < 3; k++) await run(texts100);
});
const nextDuringBatch = await probeDuring;
// クエリ 1 件だけのときのイベントループ遅延
const queryLoop = await withLoopDelay(async () => {
  for (let k = 0; k < 10; k++) await run(["query: 指が動かしにくくてシャツを着るのが大変"]);
});
timings.eventLoopDelay = { during3xBatch100: during.loopDelayMs, during10xQuery1: queryLoop.loopDelayMs };

result.dims = dims;
result.timingMs = {
  loadFirst: load1.ms,
  loadFirstCpuMs: load1.cpuMs,
  loadSecondSameProcess: load2.ms,
  ...timings,
};
result.memory.afterRuns = mem();
result.memory.peakRss = mb(peakRss);
result.memory.freeMemMbAtEnd = mb(os.freemem());
result.next = PROBE_URL ? { url: PROBE_URL, idle: nextIdle, duringBatch100: nextDuringBatch } : null;

const out = path.join(HERE, `perf-${THREADS ?? "default"}-${Date.now()}.json`);
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(`saved: ${out}`);
