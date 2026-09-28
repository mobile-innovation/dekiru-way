import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertLocalDatabaseUrl, assertEvalDatabaseUrl } from "./anonymize.ts";

/**
 * 匿名化 export の安全性テスト（ローカルの開発 DB で実行。本番 DB には接続しない）。
 *   cd poc/embedding && npm run test:stage3:export
 * 開発 DB に一時的なデータ（公開 / 非公開 / 審査待ち / 仮データ）を作り、export 結果に
 * 余計な情報が出ないことを確かめてから削除する。
 */

assertLocalDatabaseUrl(); // ローカル以外（本番など）ならここで止まる
assert.throws(() => assertEvalDatabaseUrl(), "このテストは開発 DB 用（評価用 DB では実行しない）");

const { prisma } = await import("../../../src/lib/db.ts");
const { exportPublicSnapshot } = await import("./export-public.ts");
const { PUBLIC_ATTEMPT_WHERE } = await import("../../../src/lib/search.ts");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const MARK = `anonexp${Date.now()}`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ALLOWED_KEYS = new Set([
  "label", "roads", "attempts",
  "id", "isSeedData", "difficulty", "situation", "goal", "previouslyAble", "tags",
  "roadId", "method", "memo",
]);

const fx = {
  userId: "",
  googleSub: `${MARK}:google-sub`,
  displayName: `${MARK}-表示名`,
  roadId: "",
  hiddenRoadId: "",
  attemptIds: [] as string[],
};
const PRIVATE_VALUES = {
  seedKeyword: `${MARK}-seedkw`,
  roadMemo: `${MARK}-道のメモ（公開面の検索対象外）`,
  progress: `${MARK}-進捗`,
  feeling: `${MARK}-気持ち`,
  unpublishedMethod: `${MARK}-非公開の方法`,
  pendingMethod: `${MARK}-審査待ちの方法`,
  rejectedMethod: `${MARK}-却下された方法`,
  hiddenRoadDifficulty: `${MARK}-審査待ちしか無い道`,
};

before(async () => {
  const user = await prisma.user.create({ data: { googleSub: fx.googleSub, displayName: fx.displayName } });
  fx.userId = user.id;
  const road = await prisma.road.create({
    data: {
      userId: user.id,
      difficulty: `${MARK}-ボタンがとめにくい`,
      situation: `${MARK}-朝の着替え`,
      goal: `${MARK}-一人で着替えたい`,
      previouslyAble: `${MARK}-以前はできていた`,
      memo: PRIVATE_VALUES.roadMemo,
      progress: PRIVATE_VALUES.progress,
      startedAt: new Date("2026-01-02"),
      isSeedData: true,
      dataOrigin: "ai_seed",
      seedKeyword: PRIVATE_VALUES.seedKeyword,
      roadTags: {
        create: [`${MARK}-ゆ`, `${MARK}-あ`].map((name) => ({
          tag: { connectOrCreate: { where: { name }, create: { name } } },
        })),
      },
    },
  });
  fx.roadId = road.id;
  const mk = (method: string, extra: object) =>
    prisma.attempt.create({
      data: { roadId: road.id, method, result: "success", triedAt: new Date("2026-02-03"), feeling: PRIVATE_VALUES.feeling, ...extra },
    });
  const pub1 = await mk(`${MARK}-公開の方法1`, { isPublished: true, moderationStatus: "approved", memo: `${MARK}-メモ1` });
  const pub2 = await mk(`${MARK}-公開の方法2`, { isPublished: true, moderationStatus: "approved" });
  const unpub = await mk(PRIVATE_VALUES.unpublishedMethod, { isPublished: false, moderationStatus: "approved" });
  const pend = await mk(PRIVATE_VALUES.pendingMethod, { isPublished: true, moderationStatus: "pending" });
  const rej = await mk(PRIVATE_VALUES.rejectedMethod, { isPublished: true, moderationStatus: "rejected" });
  fx.attemptIds = [pub1.id, pub2.id, unpub.id, pend.id, rej.id];

  const hidden = await prisma.road.create({
    data: { userId: user.id, difficulty: PRIVATE_VALUES.hiddenRoadDifficulty },
  });
  fx.hiddenRoadId = hidden.id;
  await prisma.attempt.create({
    data: { roadId: hidden.id, method: `${MARK}-審査待ち`, result: "ongoing", isPublished: true, moderationStatus: "pending" },
  });
});

after(async () => {
  await prisma.road.deleteMany({ where: { id: { in: [fx.roadId, fx.hiddenRoadId] } } });
  await prisma.tag.deleteMany({ where: { name: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { id: fx.userId } });
  await prisma.$disconnect();
});

function allKeys(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      allKeys(x, out);
    }
  }
  return out;
}

test("export に出るキーは評価に要る最小限だけ（userId / 日付 / dataOrigin / seedKeyword / text / exportedAt / publicGate / result 等は無い）", async () => {
  const snap = await exportPublicSnapshot(prisma, "test");
  const extra = [...allKeys(snap)].filter((k) => !ALLOWED_KEYS.has(k));
  assert.deepEqual(extra, []);
  assert.deepEqual(Object.keys(snap).sort(), ["attempts", "label", "roads"]); // 対応表などの追加の出力が無い
});

test("実 UUID・利用者の識別情報・日付・非公開の値が JSON のどこにも含まれない", async () => {
  const json = JSON.stringify(await exportPublicSnapshot(prisma, "test"));
  assert.doesNotMatch(json, UUID);
  for (const v of [fx.userId, fx.googleSub, fx.displayName, fx.roadId, fx.hiddenRoadId, ...fx.attemptIds]) {
    assert.ok(!json.includes(v), `含まれてはいけない値: ${v}`);
  }
  for (const [k, v] of Object.entries(PRIVATE_VALUES)) assert.ok(!json.includes(v), `含まれてはいけない値: ${k}`);
  for (const d of ["2026-01-02", "2026-02-03"]) assert.ok(!json.includes(d), `日付が含まれている: ${d}`);
  assert.ok(!json.includes("ai_seed"), "dataOrigin が含まれている");
  assert.ok(!json.includes("\"success\""), "result が含まれている");
});

test("必要な道の項目と isSeedData が残り、匿名化 ID で試したことと正しく対応する", async () => {
  const snap = await exportPublicSnapshot(prisma, "test");
  const road = snap.roads.find((r) => r.difficulty === `${MARK}-ボタンがとめにくい`);
  assert.ok(road);
  assert.match(road.id, /^road-\d{3,}$/);
  assert.equal(road.isSeedData, true);
  assert.equal(road.situation, `${MARK}-朝の着替え`);
  assert.equal(road.goal, `${MARK}-一人で着替えたい`);
  assert.equal(road.previouslyAble, `${MARK}-以前はできていた`);
  assert.deepEqual(road.tags, [`${MARK}-あ`, `${MARK}-ゆ`]);

  const mine = snap.attempts.filter((a) => a.method.startsWith(`${MARK}-公開の方法`));
  assert.equal(mine.length, 2);
  for (const a of mine) {
    assert.match(a.id, /^attempt-\d{3,}$/);
    assert.equal(a.roadId, road.id);
  }
  assert.equal(mine.find((a) => a.method.endsWith("1"))!.memo, `${MARK}-メモ1`);
  assert.equal(mine.find((a) => a.method.endsWith("2"))!.memo, null);

  // すべての試したことが、export に含まれる道を指している
  const roadIds = new Set(snap.roads.map((r) => r.id));
  for (const a of snap.attempts) assert.ok(roadIds.has(a.roadId));
});

test("対象件数は PUBLIC_ATTEMPT_WHERE（公開検索と同じ基準）と一致する", async () => {
  const snap = await exportPublicSnapshot(prisma, "test");
  assert.equal(snap.roads.length, await prisma.road.count({ where: { attempts: { some: PUBLIC_ATTEMPT_WHERE } } }));
  assert.equal(snap.attempts.length, await prisma.attempt.count({ where: PUBLIC_ATTEMPT_WHERE }));
});

test("CLI は public-<label>.json を 1 つ書くだけ（対応表などのファイルを作らない）", () => {
  const dataDir = path.join(HERE, "..", "data");
  fs.mkdirSync(dataDir, { recursive: true });
  const before_ = new Set(fs.readdirSync(dataDir));
  const label = `test-${MARK}`;
  execFileSync(
    path.join(ROOT, "node_modules/.bin/tsx"),
    ["poc/embedding/stage3/export-public.ts", label],
    { cwd: ROOT, env: process.env, stdio: "pipe" },
  );
  const created = fs.readdirSync(dataDir).filter((f) => !before_.has(f));
  try {
    assert.deepEqual(created, [`public-${label}.json`]);
    const json = fs.readFileSync(path.join(dataDir, created[0]), "utf8");
    assert.doesNotMatch(json, UUID);
  } finally {
    for (const f of created) fs.rmSync(path.join(dataDir, f));
  }
});
