import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { assertEvalDatabaseUrl, evalUuid, type AnonSnapshot } from "./anonymize.ts";

/**
 * 評価用 DB への投入テスト。DATABASE_URL が評価専用 DB（localhost の *_eval）のときだけ動く。
 *   cd poc/embedding && npm run test:stage3:evaldb
 * 既存の migrations を評価用 DB に当て（migrate deploy。データを消す reset は使わない）、匿名化スナップショット（合成）を投入して、
 * 既存の searchRoads / searchMethods / fuzzySearch*Ids がそのまま使えることを確かめる。
 */

assertEvalDatabaseUrl(); // 開発 DB・本番 DB ならここで止まる

const { migrateEvalDb, loadSnapshot } = await import("./eval-db.ts");
const { prisma } = await import("../../../src/lib/db.ts");
const { searchRoads, searchMethods } = await import("../../../src/lib/queries.ts");
const { fuzzySearchRoadIds, fuzzySearchAttemptIds } = await import("../../../src/lib/search-fuzzy.ts");

const LABEL = "evaltest";
const SNAP: AnonSnapshot = {
  label: LABEL,
  roads: [
    {
      id: "road-001",
      isSeedData: false,
      difficulty: "指先に力が入りにくく、小さいボタンが自分でとめられない",
      situation: "急いでいる朝",
      goal: "朝、自分で着替えを済ませたい",
      previouslyAble: null,
      tags: ["手先", "着替え"],
    },
    {
      id: "road-002",
      isSeedData: true,
      difficulty: "つめ切りをしっかり握れず、狙った位置で切れない",
      situation: null,
      goal: "自分でつめの手入れをしたい",
      previouslyAble: "普通のつめ切りで切れていた",
      tags: ["手先"],
    },
  ],
  attempts: [
    { id: "attempt-001", roadId: "road-002", method: "テコ型のつめ切りを使った", memo: "力が弱くても切れた" },
    { id: "attempt-002", roadId: "road-001", method: "ボタンエイドを使ってみた", memo: null },
    { id: "attempt-003", roadId: "road-001", method: "マグネット式のボタンに替えた", memo: "外出前に楽になった" },
  ],
};
const q = (text: string, kind: "road" | "method") => ({
  q: text, result: undefined, tag: undefined, read: undefined,
  page: 1, mp: 1, kind, limit: 10, sort: "recent" as const, ai: undefined,
});

before(async () => {
  migrateEvalDb();
  await loadSnapshot(prisma, SNAP);
});
after(async () => {
  await prisma.$disconnect();
});

test("ダミーユーザー 1 人・道・試したこと・タグが評価用 ID 由来の UUID で入る", async () => {
  assert.equal(await prisma.user.count(), 1);
  const roads = await prisma.road.findMany({ include: { roadTags: { include: { tag: true } } } });
  assert.deepEqual(
    roads.map((r) => r.id).sort(),
    SNAP.roads.map((r) => evalUuid(LABEL, r.id)).sort(),
  );
  const r1 = roads.find((r) => r.id === evalUuid(LABEL, "road-001"))!;
  assert.deepEqual(r1.roadTags.map((rt) => rt.tag.name).sort(), ["手先", "着替え"]);
  assert.equal(roads.find((r) => r.id === evalUuid(LABEL, "road-002"))!.isSeedData, true);

  const attempts = await prisma.attempt.findMany();
  assert.equal(attempts.length, 3);
  for (const a of attempts) {
    assert.equal(a.isPublished, true);
    assert.equal(a.moderationStatus, "approved");
  }
  assert.equal(
    attempts.find((a) => a.id === evalUuid(LABEL, "attempt-001"))!.roadId,
    evalUuid(LABEL, "road-002"),
  );
  assert.equal(await prisma.tag.count(), 2);
});

test("既存の searchRoads / searchMethods（ILIKE）が評価用 DB でそのまま動く", async () => {
  const roads = await searchRoads(q("ボタン", "road"));
  assert.equal(roads.total, 1);
  assert.ok(
    [evalUuid(LABEL, "attempt-002"), evalUuid(LABEL, "attempt-003")].includes(roads.items[0].entryId),
  );
  const methods = await searchMethods(q("つめ切り", "method"));
  assert.deepEqual(methods.items.map((m) => m.attemptId), [evalUuid(LABEL, "attempt-001")]);
});

test("既存の fuzzySearchRoadIds / fuzzySearchAttemptIds（pg_trgm）が評価用 DB でそのまま動く", async () => {
  const r = await fuzzySearchRoadIds("小さいボタンがとめられない", 10);
  assert.equal(r[0], evalUuid(LABEL, "road-001"));
  const a = await fuzzySearchAttemptIds("テコ型のつめ切り", 10);
  assert.equal(a[0], evalUuid(LABEL, "attempt-001"));
});

test("投入し直すと前の中身は残らない（評価用 DB は毎回スナップショットだけになる）", async () => {
  await loadSnapshot(prisma, { ...SNAP, roads: SNAP.roads.slice(0, 1), attempts: SNAP.attempts.slice(1) });
  assert.equal(await prisma.road.count(), 1);
  assert.equal(await prisma.attempt.count(), 2);
  assert.equal(await prisma.user.count(), 1);
  await loadSnapshot(prisma, SNAP);
});
