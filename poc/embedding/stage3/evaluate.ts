import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../../src/lib/db.ts";
import { searchRoads, searchMethods } from "../../../src/lib/queries.ts";
import { fuzzySearchRoadIds, fuzzySearchAttemptIds } from "../../../src/lib/search-fuzzy.ts";
import { buildRoadEmbeddingText, buildAttemptEmbeddingText } from "../../../src/lib/search-embedding-text.ts";
import type { ExperienceQuery } from "../../../src/lib/validation.ts";
import { createEmbedder, cosine } from "../embedder.ts";
import { presetFromEnv } from "../models.ts";
import { STAGE3_QUERIES } from "./queries.ts";
import { assertEvalDatabaseUrl, evalUuid, type AnonSnapshot } from "./anonymize.ts";
import {
  roadTextB,
  attemptTextB,
  roadFieldTextsC,
  lineCutStatus,
} from "./strategies.ts";

/**
 * Stage 3: 公開データでの Embedding 検索検証（読み取りのみ。本番検索コード・DB は変更しない）。
 * 入力は匿名化スナップショット（export-public.ts）。ILIKE / fuzzy は既存関数（searchRoads /
 * searchMethods / fuzzySearch*Ids）をそのまま呼ぶが、接続先は評価専用 DB（*_eval）に限る
 * （eval-db.ts で同じスナップショットを投入しておく）。開発 DB・本番 DB には接続しない。
 *   DATABASE_URL=$EVAL_DB node_modules/.bin/tsx poc/embedding/stage3/evaluate.ts local
 * Embedding 用の文章はスナップショットに保存せず、ここで Stage 1 の関数から作り直す。
 * 出力: poc/embedding/results/stage3-<label>/（git 管理外。投稿内容を含む）
 */

assertEvalDatabaseUrl();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] ?? "local";
const raw = JSON.parse(
  fs.readFileSync(path.join(HERE, "..", "data", `public-${label}.json`), "utf8"),
) as AnonSnapshot;
const snap = {
  roads: raw.roads.map((r) => ({ ...r, text: buildRoadEmbeddingText(r) })),
  attempts: raw.attempts.map((a) => ({ ...a, text: buildAttemptEmbeddingText(a) })),
};
// 評価用 DB の UUID（evalUuid で決定的に生成）→ 評価用 ID
const anonOfDbId = new Map<string, string>([
  ...snap.roads.map((r) => [evalUuid(label, r.id), r.id] as [string, string]),
  ...snap.attempts.map((a) => [evalUuid(label, a.id), a.id] as [string, string]),
]);
const anon = (dbId: string) => {
  const id = anonOfDbId.get(dbId);
  if (!id) throw new Error(`評価用 DB に、スナップショットに無い行があります（eval-db.ts load ${label} を先に実行）`);
  return id;
};
const OUT = path.join(HERE, "..", "results", `stage3-${label}`);
fs.mkdirSync(OUT, { recursive: true });

const { preset, name } = presetFromEnv();
const emb = await createEmbedder(preset);
const MAX = emb.maxLength;
const log = (...a: unknown[]) => console.log(...a);

// ------------------------------------------------------------------ 1. トークン数
const bucket = (n: number, edges: number[]) => {
  for (const e of edges) if (n <= e) return `≤${e}`;
  return `>${edges.at(-1)}`;
};
async function tokenStats(items: { id: string; text: string }[]) {
  const rows = [];
  for (const it of items) {
    const tokens = it.text ? await emb.countTokens("passage", it.text) : 0;
    rows.push({ id: it.id, chars: it.text.length, tokens, over: tokens > MAX, truncatedTo: Math.min(tokens, MAX) });
  }
  const nonEmpty = rows.filter((r) => r.chars > 0);
  const tokenEdges = [16, 32, 64, 128, 256, 512];
  const charEdges = [20, 50, 100, 200, 500, 1000, 2000];
  const dist = (key: "tokens" | "chars", edges: number[]) =>
    nonEmpty.reduce<Record<string, number>>((m, r) => {
      const b = bucket(r[key], edges);
      m[b] = (m[b] ?? 0) + 1;
      return m;
    }, {});
  const over = rows.filter((r) => r.over);
  const cut: Record<string, Record<string, number>> = {};
  for (const r of over) {
    const text = items.find((i) => i.id === r.id)!.text;
    for (const l of await lineCutStatus(text, emb)) {
      cut[l.label] ??= { kept: 0, partial: 0, dropped: 0 };
      cut[l.label][l.status]++;
    }
  }
  return {
    total: rows.length,
    empty: rows.length - nonEmpty.length,
    within512: nonEmpty.filter((r) => !r.over).length,
    over512: over.length,
    maxTokens: Math.max(0, ...rows.map((r) => r.tokens)),
    meanTokens: +(nonEmpty.reduce((s, r) => s + r.tokens, 0) / Math.max(1, nonEmpty.length)).toFixed(1),
    maxChars: Math.max(0, ...rows.map((r) => r.chars)),
    meanChars: +(nonEmpty.reduce((s, r) => s + r.chars, 0) / Math.max(1, nonEmpty.length)).toFixed(1),
    tokenDistribution: dist("tokens", tokenEdges),
    charDistribution: dist("chars", charEdges),
    cutFieldsWhenOver: cut,
    rows,
  };
}
const roadTokens = await tokenStats(snap.roads);
const attemptTokens = await tokenStats(snap.attempts);
log("roads", JSON.stringify({ ...roadTokens, rows: undefined }));
log("attempts", JSON.stringify({ ...attemptTokens, rows: undefined }));

// ------------------------------------------------------------------ 2. 最大長（FIELD_MAX）での理論上の最悪ケース
const FILLER =
  "その日は朝から少し肌寒く、家族は仕事に出かけていて家には自分ひとりだった。窓の外では近所の子どもたちが登校していく声が聞こえ、" +
  "いつもと同じように台所でお茶をいれてから、新聞を読み、午後には病院の予約があることを思い出した。";
const fill = (base: string, len: number) => (base + FILLER.repeat(Math.ceil(len / FILLER.length))).slice(0, len);
const worstRoad = buildRoadEmbeddingText({
  difficulty: fill("", 2000),
  situation: fill("", 2000),
  goal: fill("", 2000),
  previouslyAble: fill("", 2000),
  tags: Array.from({ length: 10 }, (_, i) => `タグ${i + 1}`),
});
const worstAttempt = buildAttemptEmbeddingText({ method: fill("", 2000), memo: fill("", 4000) });
const worst = {
  road: { chars: worstRoad.length, tokens: await emb.countTokens("passage", worstRoad), lines: await lineCutStatus(worstRoad, emb) },
  attempt: { chars: worstAttempt.length, tokens: await emb.countTokens("passage", worstAttempt), lines: await lineCutStatus(worstAttempt, emb) },
};
log("worst", JSON.stringify({ road: { ...worst.road }, attempt: { ...worst.attempt } }));

// ------------------------------------------------------------------ 3. 道・試したことの Embedding（A / B / C）
const embedAll = async (texts: string[]) => {
  const out: (Float32Array | null)[] = [];
  for (let i = 0; i < texts.length; i += 16) out.push(...(await emb.embed("passage", texts.slice(i, i + 16))));
  return out;
};
const roadA = await embedAll(snap.roads.map((r) => r.text));
const roadBTexts = await Promise.all(snap.roads.map(async (r) => (await roadTextB(r, emb)).text));
const bDiffers = roadBTexts.filter((t, i) => t !== snap.roads[i].text).length;
const roadB = bDiffers === 0 ? roadA : await embedAll(roadBTexts);
const roadCFields = snap.roads.map((r) => roadFieldTextsC(r));
const cFlat = roadCFields.flatMap((fs_, i) => fs_.map((f) => ({ road: i, field: f.field, text: f.text })));
const cVecs = await embedAll(cFlat.map((c) => c.text));
const attemptA = await embedAll(snap.attempts.map((a) => a.text));
const attemptBTexts = await Promise.all(snap.attempts.map(async (a) => (await attemptTextB(a, emb)).text));
const attemptBDiffers = attemptBTexts.filter((t, i) => t !== snap.attempts[i].text).length;

const scoreC = (qv: Float32Array) =>
  snap.roads.map((_, i) => {
    let best = -1;
    let field = "";
    cFlat.forEach((c, j) => {
      if (c.road !== i || !cVecs[j]) return;
      const s = cosine(qv, cVecs[j]!);
      if (s > best) {
        best = s;
        field = c.field;
      }
    });
    return { score: best, field };
  });

// ------------------------------------------------------------------ 4. 長文の A / B / C 回復テスト（合成）
// 実データの道の difficulty の後ろに無関係な文章を足して 512 を超えさせ、後ろの項目（goal / previouslyAble /
// tags）の文言をそのままクエリにしたとき、その道が何位に来るか（他の道は元のまま）。
const targets = snap.roads
  .map((r, i) => ({ r, i }))
  .filter(({ r }) => (r.difficulty ?? "").length >= 8 && r.goal && (r.previouslyAble || r.tags.length > 0));
const recovery = [];
for (const { r, i } of targets) {
  const longRoad = { ...r, difficulty: (r.difficulty ?? "") + "。" + fill("", 1500) };
  const longA = buildRoadEmbeddingText(longRoad);
  const longB = (await roadTextB(longRoad, emb)).text;
  const [vA, vB] = await emb.embed("passage", [longA, longB]);
  const cTexts = roadFieldTextsC(longRoad);
  const cV = await emb.embed("passage", cTexts.map((c) => c.text));
  const probes = [
    { from: "goal", q: r.goal! },
    ...(r.previouslyAble ? [{ from: "previouslyAble", q: r.previouslyAble }] : []),
    ...(r.tags.length > 0 ? [{ from: "tags", q: r.tags.join(" ") }] : []),
  ];
  for (const p of probes) {
    const [qv] = await emb.embed("query", [p.q]);
    const rankWith = (target: number) =>
      1 + snap.roads.filter((_, j) => j !== i && roadA[j] && cosine(qv!, roadA[j]!) > target).length;
    const otherC = scoreC(qv!);
    const rankC = (target: number) => 1 + otherC.filter((s, j) => j !== i && s.score > target).length;
    const cBest = Math.max(...cV.map((v) => (v ? cosine(qv!, v) : -1)));
    recovery.push({
      road: r.id,
      from: p.from,
      q: p.q,
      rankShort: rankWith(cosine(qv!, roadA[i]!)),
      rankLongA: rankWith(cosine(qv!, vA!)),
      rankLongB: rankWith(cosine(qv!, vB!)),
      rankLongC: rankC(cBest),
      tokensLongA: await emb.countTokens("passage", longA),
      tokensLongB: await emb.countTokens("passage", longB),
    });
  }
}
log("recovery", JSON.stringify(recovery.map(({ q, ...x }) => x)));

// ------------------------------------------------------------------ 5. クエリごとの比較（Embedding / ILIKE / fuzzy）
const roadIdOfAttempt = new Map(snap.attempts.map((a) => [a.id, a.roadId]));
const roadIdx = new Map(snap.roads.map((r, i) => [r.id, i]));
const attemptIdx = new Map(snap.attempts.map((a, i) => [a.id, i]));
const baseQ = (q: string, kind: ExperienceQuery["kind"]): ExperienceQuery => ({
  q,
  result: undefined,
  tag: undefined,
  read: undefined,
  page: 1,
  mp: 1,
  kind,
  limit: 10,
  sort: "recent",
  ai: undefined,
});
const top = <T>(arr: { i: number; score: number; extra?: T }[], k = 10) =>
  arr.filter((x) => x.score > -1).sort((a, b) => b.score - a.score).slice(0, k);

const rng = (() => {
  let s = 20260925;
  return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
})();
const dist = { top1: [] as number[], top3: [] as number[], top10: [] as number[], random: [] as number[] };
const attemptDist = { top1: [] as number[], top3: [] as number[], top10: [] as number[], random: [] as number[] };

const perQuery = [];
for (const { q, category } of STAGE3_QUERIES) {
  const [qv] = await emb.embed("query", [q]);
  const eA = top(snap.roads.map((_, i) => ({ i, score: roadA[i] ? cosine(qv!, roadA[i]!) : -1 })));
  const eB = bDiffers === 0 ? eA : top(snap.roads.map((_, i) => ({ i, score: roadB[i] ? cosine(qv!, roadB[i]!) : -1 })));
  const cs = scoreC(qv!);
  const eC = top(snap.roads.map((_, i) => ({ i, score: cs[i].score, extra: cs[i].field })));
  const eAtt = top(snap.attempts.map((_, i) => ({ i, score: attemptA[i] ? cosine(qv!, attemptA[i]!) : -1 })));

  const [ilRoad, ilMethod, fzRoad, fzAttempt] = await Promise.all([
    searchRoads(baseQ(q, "road")),
    searchMethods(baseQ(q, "method")),
    fuzzySearchRoadIds(q, 10),
    fuzzySearchAttemptIds(q, 10),
  ]);

  const allRoadScores = snap.roads.map((_, i) => (roadA[i] ? cosine(qv!, roadA[i]!) : -1)).filter((s) => s > -1);
  dist.top1.push(eA[0]?.score);
  dist.top3.push(eA[2]?.score);
  dist.top10.push(eA[9]?.score);
  for (let k = 0; k < 5; k++) dist.random.push(allRoadScores[Math.floor(rng() * allRoadScores.length)]);
  const allAttScores = snap.attempts.map((_, i) => (attemptA[i] ? cosine(qv!, attemptA[i]!) : -1)).filter((s) => s > -1);
  attemptDist.top1.push(eAtt[0]?.score);
  attemptDist.top3.push(eAtt[2]?.score);
  attemptDist.top10.push(eAtt[9]?.score);
  for (let k = 0; k < 5; k++) attemptDist.random.push(allAttScores[Math.floor(rng() * allAttScores.length)]);

  perQuery.push({
    q,
    category,
    embeddingRoadsA: eA.map((x) => ({ id: snap.roads[x.i].id, score: +x.score.toFixed(4) })),
    embeddingRoadsB: eB.map((x) => ({ id: snap.roads[x.i].id, score: +x.score.toFixed(4) })),
    embeddingRoadsC: eC.map((x) => ({ id: snap.roads[x.i].id, score: +x.score.toFixed(4), field: x.extra })),
    embeddingAttempts: eAtt.map((x) => ({ id: snap.attempts[x.i].id, score: +x.score.toFixed(4) })),
    ilikeRoads: { total: ilRoad.total, ids: ilRoad.items.map((it) => roadIdOfAttempt.get(anon(it.entryId))!) },
    ilikeAttempts: { total: ilMethod.total, ids: ilMethod.items.map((it) => anon(it.attemptId)) },
    fuzzyRoads: fzRoad.map(anon),
    fuzzyAttempts: fzAttempt.map(anon),
  });
}
const quant = (xs: number[]) => {
  const s = xs.filter((x) => typeof x === "number").sort((a, b) => a - b);
  const at = (p: number) => +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))].toFixed(4);
  return { n: s.length, min: at(0), p25: at(0.25), median: at(0.5), p75: at(0.75), max: at(1) };
};
const similarity = {
  roads: Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, quant(v)])),
  attempts: Object.fromEntries(Object.entries(attemptDist).map(([k, v]) => [k, quant(v)])),
};
log("similarity", JSON.stringify(similarity));

// ------------------------------------------------------------------ 6. 人間評価用 CSV（◎ 明らかに関連 / △ 可能性あり / × 関連しない）
const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (file: string, header: string[], rows: unknown[][]) =>
  fs.writeFileSync(
    path.join(OUT, file),
    "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n",
  );
const oneLine = (t: string) => t.replace(/\n/g, " / ");
const rankOf = (ids: string[], id: string) => {
  const p = ids.indexOf(id);
  return p >= 0 ? p + 1 : "";
};

const roadRows: unknown[][] = [];
const attemptRows: unknown[][] = [];
for (const pq of perQuery) {
  const roadIds = [
    ...new Set([
      ...pq.embeddingRoadsA.map((x) => x.id),
      ...pq.embeddingRoadsC.map((x) => x.id),
      ...pq.ilikeRoads.ids,
      ...pq.fuzzyRoads,
    ]),
  ];
  for (const id of roadIds) {
    const r = snap.roads[roadIdx.get(id)!];
    const a = pq.embeddingRoadsA.find((x) => x.id === id);
    const c = pq.embeddingRoadsC.find((x) => x.id === id);
    roadRows.push([
      pq.q,
      pq.category,
      id,
      r.isSeedData ? "仮データ" : "",
      a ? pq.embeddingRoadsA.indexOf(a) + 1 : "",
      a?.score ?? "",
      c ? pq.embeddingRoadsC.indexOf(c) + 1 : "",
      c ? `${c.score} (${c.field})` : "",
      rankOf(pq.ilikeRoads.ids, id),
      rankOf(pq.fuzzyRoads, id),
      "",
      oneLine(r.text),
    ]);
  }
  const attIds = [...new Set([...pq.embeddingAttempts.map((x) => x.id), ...pq.ilikeAttempts.ids, ...pq.fuzzyAttempts])];
  for (const id of attIds) {
    const at = snap.attempts[attemptIdx.get(id)!];
    const e = pq.embeddingAttempts.find((x) => x.id === id);
    attemptRows.push([
      pq.q,
      pq.category,
      id,
      e ? pq.embeddingAttempts.indexOf(e) + 1 : "",
      e?.score ?? "",
      rankOf(pq.ilikeAttempts.ids, id),
      rankOf(pq.fuzzyAttempts, id),
      "",
      oneLine(at.text),
    ]);
  }
}
writeCsv(
  "review-roads.csv",
  ["query", "category", "road", "seed", "emb_A_rank", "emb_A_score", "emb_C_rank", "emb_C_score(field)", "ilike_rank", "fuzzy_rank", "評価(◎/△/×)", "text"],
  roadRows,
);
writeCsv(
  "review-attempts.csv",
  ["query", "category", "attempt", "emb_rank", "emb_score", "ilike_rank", "fuzzy_rank", "評価(◎/△/×)", "text"],
  attemptRows,
);

const summary = {
  label,
  model: name,
  maxLength: MAX,
  counts: { roads: snap.roads.length, attempts: snap.attempts.length, seedRoads: snap.roads.filter((r) => r.isSeedData).length },
  roadTokens,
  attemptTokens,
  worst,
  strategyB: { roadsChanged: bDiffers, attemptsChanged: attemptBDiffers },
  cFieldVectors: cFlat.length,
  recovery,
  similarity,
  perQuery,
};
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
log(`B changed roads=${bDiffers} attempts=${attemptBDiffers}; C vectors=${cFlat.length}; out=${path.relative(process.cwd(), OUT)}`);
await prisma.$disconnect();
