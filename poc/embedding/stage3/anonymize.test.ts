import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anonymizeSnapshot,
  evalUuid,
  assertEvalDatabaseUrl,
  assertLocalDatabaseUrl,
  type SourceRoad,
  type SourceAttempt,
} from "./anonymize.ts";

/** 匿名化（純関数）と接続先ガードのテスト。DB には接続しない。 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const roads: SourceRoad[] = Array.from({ length: 5 }, (_, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  isSeedData: i % 2 === 0,
  difficulty: `困りごと${i}`,
  situation: null,
  goal: `目標${i}`,
  previouslyAble: null,
  tags: ["ゆ", "あ"],
}));
const attempts: SourceAttempt[] = roads.flatMap((r, i) => [
  { id: `11111111-0000-4000-8000-00000000000${i}`, roadId: r.id, method: `方法${i}-a`, memo: null },
  { id: `22222222-0000-4000-8000-00000000000${i}`, roadId: r.id, method: `方法${i}-b`, memo: "メモ" },
]);

test("実 ID を出さず、road-001 / attempt-001 形式の連番にする", () => {
  const snap = anonymizeSnapshot("t", roads, attempts);
  const json = JSON.stringify(snap);
  assert.doesNotMatch(json, UUID);
  assert.deepEqual(Object.keys(snap).sort(), ["attempts", "label", "roads"]);
  assert.deepEqual(snap.roads.map((r) => r.id).sort(), ["road-001", "road-002", "road-003", "road-004", "road-005"]);
  assert.equal(new Set(snap.attempts.map((a) => a.id)).size, 10);
  for (const a of snap.attempts) assert.match(a.id, /^attempt-\d{3}$/);
});

test("道と試したことの対応は、匿名化 ID どうしで正しく保たれる", () => {
  const snap = anonymizeSnapshot("t", roads, attempts);
  for (const a of snap.attempts) {
    const road = snap.roads.find((r) => r.id === a.roadId)!;
    const n = a.method.match(/^方法(\d)/)![1];
    assert.equal(road.difficulty, `困りごと${n}`);
  }
});

test("連番はランダム化した後に振る（入力順＝時系列が ID から分からない）", () => {
  // 常に j=0 を選ぶ乱数（Fisher–Yates で入力順とは違う並びになる）
  const snap = anonymizeSnapshot("t", roads, attempts, () => 0);
  assert.notDeepEqual(
    snap.roads.map((r) => r.difficulty),
    roads.map((r) => r.difficulty),
  );
  // 既定（crypto.randomInt）でも全件そろう
  assert.equal(anonymizeSnapshot("t", roads, attempts).roads.length, 5);
});

test("タグは名前順に揃え、isSeedData は残す", () => {
  const snap = anonymizeSnapshot("t", roads, attempts);
  for (const r of snap.roads) assert.deepEqual(r.tags, ["あ", "ゆ"]);
  assert.equal(snap.roads.filter((r) => r.isSeedData).length, 3);
});

test("道が見つからない試したことは例外（取得条件のずれを見逃さない）", () => {
  assert.throws(() =>
    anonymizeSnapshot("t", roads, [{ id: "x", roadId: "missing", method: "m", memo: null }]),
  );
});

test("evalUuid は評価用 ID から決定的に作る UUID 形式", () => {
  assert.equal(evalUuid("local", "road-001"), evalUuid("local", "road-001"));
  assert.notEqual(evalUuid("local", "road-001"), evalUuid("local", "road-002"));
  assert.notEqual(evalUuid("local", "road-001"), evalUuid("prod", "road-001"));
  assert.match(evalUuid("local", "road-001"), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("接続先ガード: 評価用はローカルかつ *_eval だけ", () => {
  assert.doesNotThrow(() => assertEvalDatabaseUrl("postgresql://u:p@localhost:5433/dekiru_eval?schema=public"));
  assert.throws(() => assertEvalDatabaseUrl("postgresql://u:p@localhost:5433/dekiru?schema=public"));
  assert.throws(() => assertEvalDatabaseUrl("postgresql://u:p@db.example.com:5432/dekiru_eval"));
  assert.throws(() => assertEvalDatabaseUrl(""));
  assert.doesNotThrow(() => assertLocalDatabaseUrl("postgresql://u:p@127.0.0.1:5433/dekiru"));
  assert.throws(() => assertLocalDatabaseUrl("postgresql://u:p@203.0.113.1:5433/dekiru"));
});
