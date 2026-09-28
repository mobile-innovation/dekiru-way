import path from "node:path";
import { fileURLToPath } from "node:url";
import { env, pipeline } from "@huggingface/transformers";
import { presetFromEnv } from "./models.ts";

/**
 * メモリだけを測る最小スクリプト（pipeline 1 つだけをロードし、短文を 1 回 Embedding する）。
 *   EMBED_MODEL=e5-small-q8 [ARENA=off] tsx mem-probe.ts
 * ARENA=off で onnxruntime の CPU メモリアリーナ / メモリパターンを無効にしたときの差も見る。
 */
env.cacheDir = path.join(path.dirname(fileURLToPath(import.meta.url)), ".model-cache");
const { name, preset } = presetFromEnv();
const arenaOff = process.env.ARENA === "off";
const mem = () => {
  const m = process.memoryUsage();
  return { rss: Math.round(m.rss / 1048576), heap: Math.round(m.heapUsed / 1048576), external: Math.round(m.external / 1048576) };
};
const base = mem();
const extractor = await pipeline("feature-extraction", preset.modelId, {
  dtype: preset.dtype,
  device: "cpu",
  ...(arenaOff ? { session_options: { enableCpuMemArena: false, enableMemPattern: false } } : {}),
});
const loaded = mem();
const texts = Array.from({ length: 10 }, (_, i) => `${preset.passagePrefix}できなくなったこと：ボタンがとめにくい ${i}`);
const t = performance.now();
await extractor(texts, { pooling: preset.pooling, normalize: true });
const ms = Math.round(performance.now() - t);
const after = mem();
console.log(JSON.stringify({ name, arena: arenaOff ? "off" : "on", base, loaded, afterEmbed10: after, embed10Ms: ms }));
