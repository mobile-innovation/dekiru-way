import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRoadEmbeddingText } from "../../../src/lib/search-embedding-text.ts";

/**
 * Stage 3: evaluate.ts の summary.json から、人が読む report.md を作る（DB・モデルは使わない）。
 *   node_modules/.bin/tsx poc/embedding/stage3/report.ts local
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? "local";
const DIR = path.join(HERE, "..", "results", `stage3-${label}`);
const s = JSON.parse(fs.readFileSync(path.join(DIR, "summary.json"), "utf8"));
const snap = JSON.parse(fs.readFileSync(path.join(HERE, "..", "data", `public-${label}.json`), "utf8"));
const roadById = new Map<string, { difficulty: string | null; isSeedData: boolean; text: string }>(
  snap.roads.map((r: Parameters<typeof buildRoadEmbeddingText>[0] & { id: string }) => [
    r.id,
    { ...r, text: buildRoadEmbeddingText(r) },
  ]),
);
const attemptById = new Map<string, { method: string }>(snap.attempts.map((a: { id: string }) => [a.id, a]));

const short = (t: string | null | undefined, n = 22) => {
  const v = (t ?? "").replace(/\n/g, " ");
  return v.length > n ? v.slice(0, n) + "…" : v;
};
const roadName = (id: string) => {
  const r = roadById.get(id)!;
  return `${r.isSeedData ? "［仮］" : ""}${short(r.difficulty)}`;
};
const L: string[] = [];
const p = (x = "") => L.push(x);

p(`# Stage 3 検証レポート（${label}）`);
p();
p(`モデル: ${s.model}（最大 ${s.maxLength} トークン）／ 道 ${s.counts.roads} 件（うち仮データ ${s.counts.seedRoads}）／ 試したこと ${s.counts.attempts} 件`);
p();
p("## 1. トークン数");
p();
p("| | 総数 | 空 | ≤512 | >512 | 最大 token | 平均 token | 最大文字 | 平均文字 |");
p("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
for (const [k, t] of [["道", s.roadTokens], ["試したこと", s.attemptTokens]] as const) {
  p(`| ${k} | ${t.total} | ${t.empty} | ${t.within512} | ${t.over512} | ${t.maxTokens} | ${t.meanTokens} | ${t.maxChars} | ${t.meanChars} |`);
}
p();
p(`- 道の token 分布: ${JSON.stringify(s.roadTokens.tokenDistribution)}`);
p(`- 試したことの token 分布: ${JSON.stringify(s.attemptTokens.tokenDistribution)}`);
p(`- 入力上限いっぱい（道 各項目 2000 文字 / 試したこと method 2000・memo 4000）の最悪ケース: 道 ${s.worst.road.tokens} token、試したこと ${s.worst.attempt.tokens} token`);
p(`  - 道: ${s.worst.road.lines.map((l: { label: string; status: string }) => `${l.label}=${l.status}`).join(" / ")}`);
p(`  - 試したこと: ${s.worst.attempt.lines.map((l: { label: string; status: string }) => `${l.label}=${l.status}`).join(" / ")}`);
p();

p("## 2. 512 トークン対策 A / B / C（合成長文での回復テスト）");
p();
p("実データの道の「できなくなったこと」に無関係な文章を足して 512 超にし、後ろの項目の文言で検索したときの順位。");
p("複数の道で同じ文言（仮データの定型文など）を持つ probe は順位が同点で決まらないため集計から除外。");
p();
const probeCount = new Map<string, number>();
for (const r of s.recovery) probeCount.set(r.q, (probeCount.get(r.q) ?? 0) + 1);
const dupText = new Set<string>();
for (const r of snap.roads) {
  for (const f of ["goal", "previouslyAble"]) {
    const v = r[f];
    if (v && snap.roads.filter((x: Record<string, unknown>) => x[f] === v).length > 1) dupText.add(v);
  }
}
const uniq = s.recovery.filter((r: { q: string }) => !dupText.has(r.q));
const agg = (key: string) => {
  const ranks = uniq.map((r: Record<string, number>) => r[key]);
  return {
    hit1: ranks.filter((x: number) => x === 1).length,
    hit3: ranks.filter((x: number) => x <= 3).length,
    mean: +(ranks.reduce((a: number, b: number) => a + b, 0) / ranks.length).toFixed(2),
  };
};
p(`| 方式 | 1 位 | 3 位以内 | 平均順位 |（probe ${uniq.length} 件）`);
p("| --- | --- | --- | --- |");
for (const [k, name] of [
  ["rankShort", "元の短い文章（基準）"],
  ["rankLongA", "A: 先頭 512 で切り捨て"],
  ["rankLongB", "B: 全項目を残して均等に切り詰め"],
  ["rankLongC", "C: 項目別 Embedding の最大値"],
]) {
  const a = agg(k);
  p(`| ${name} | ${a.hit1} | ${a.hit3} | ${a.mean} |`);
}
p();
const byFrom = (from: string) => uniq.filter((r: { from: string }) => r.from === from);
for (const from of ["goal", "previouslyAble", "tags"]) {
  const rs = byFrom(from);
  if (rs.length === 0) continue;
  const m = (k: string) => (rs.reduce((a: number, r: Record<string, number>) => a + r[k], 0) / rs.length).toFixed(1);
  p(`- ${from} から検索（${rs.length} 件）の平均順位: 基準 ${m("rankShort")} / A ${m("rankLongA")} / B ${m("rankLongB")} / C ${m("rankLongC")}`);
}
p(`- 実データで B により文章が変わった件数: 道 ${s.strategyB.roadsChanged} / 試したこと ${s.strategyB.attemptsChanged}（512 超が 0 件のため）`);
p(`- C のベクトル数: ${s.cFieldVectors}（道 ${s.counts.roads} 件 → 約 ${(s.cFieldVectors / s.counts.roads).toFixed(1)} 倍）`);
p();

p("## 3. 類似度の分布（道 / 試したこと、方式 A）");
p();
p("| | 1 位 | 3 位 | 10 位 | ランダム（関連性未判定） |");
p("| --- | --- | --- | --- | --- |");
for (const k of ["roads", "attempts"]) {
  const d = s.similarity[k];
  const f = (q: { min: number; median: number; max: number }) => `${q.min} / **${q.median}** / ${q.max}`;
  p(`| ${k === "roads" ? "道" : "試したこと"} (min / 中央値 / max) | ${f(d.top1)} | ${f(d.top3)} | ${f(d.top10)} | ${f(d.random)} |`);
}
p();

p("## 4. クエリ別（Embedding 上位 3 / ILIKE / fuzzy）");
p();
p("ILIKE 件数 = 通常検索の道カード総数（`searchRoads`）。fuzzy = 表記ゆれ検索の候補数（本番では ILIKE 0 件のときだけ動く）。");
p("人の評価は `review-roads.csv` / `review-attempts.csv` の「評価」列に ◎ / △ / × を記入する。");
p();
p("| query | 分類 | ILIKE | fuzzy | Embedding 道 上位3（score） | C 1 位が A と違う | Embedding 試したこと 1 位 |");
p("| --- | --- | --- | --- | --- | --- | --- |");
for (const q of s.perQuery) {
  const top3 = q.embeddingRoadsA
    .slice(0, 3)
    .map((x: { id: string; score: number }) => `${roadName(x.id)} ${x.score.toFixed(3)}`)
    .join("<br>");
  const cDiff = q.embeddingRoadsC[0]?.id !== q.embeddingRoadsA[0]?.id ? `→ ${roadName(q.embeddingRoadsC[0].id)}（${q.embeddingRoadsC[0].field}）` : "";
  const att = q.embeddingAttempts[0];
  p(
    `| ${q.q.length > 30 ? q.q.slice(0, 30) + "…" : q.q} | ${q.category} | ${q.ilikeRoads.total} | ${q.fuzzyRoads.length} | ${top3} | ${cDiff} | ${short(attemptById.get(att.id)?.method)} ${att.score.toFixed(3)} |`,
  );
}
p();
const zeroIlike = s.perQuery.filter((q: { ilikeRoads: { total: number } }) => q.ilikeRoads.total === 0);
const zeroBoth = zeroIlike.filter((q: { fuzzyRoads: string[] }) => q.fuzzyRoads.length === 0);
p(`- ILIKE 0 件のクエリ: ${zeroIlike.length} / ${s.perQuery.length}（うち fuzzy も 0 件: ${zeroBoth.length}）`);
p(`  - ${zeroBoth.map((q: { q: string }) => `「${short(q.q, 20)}」`).join(" ")}`);

fs.writeFileSync(path.join(DIR, "report.md"), L.join("\n") + "\n");
console.log(L.join("\n"));
