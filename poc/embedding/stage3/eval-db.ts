import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { assertEvalDatabaseUrl, evalUuid, type AnonSnapshot } from "./anonymize.ts";

/**
 * Stage 3.1: 評価専用 DB（開発 DB・本番 DB とは別の PostgreSQL database）。
 * 既存の Prisma schema / migrations をそのまま当て、匿名化スナップショットを投入する。
 * これにより既存の searchRoads / searchMethods / fuzzySearch*Ids を無改造で評価に使える。
 *
 * 安全装置: DATABASE_URL が「localhost かつ DB 名が *_eval」でなければ何もしない。
 *
 * 使い方（リポジトリのルートで。--env-file は付けない = .env の開発 DB を読まない）:
 *   export EVAL_DB="postgresql://dekiru:dekiru@localhost:5433/dekiru_eval?schema=public"
 *   DATABASE_URL=$EVAL_DB node_modules/.bin/tsx poc/embedding/stage3/eval-db.ts setup
 *   DATABASE_URL=$EVAL_DB node_modules/.bin/tsx poc/embedding/stage3/eval-db.ts load local
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * 評価用 DB に既存の migrations を当てる（無ければ DB を作成。既に適用済みなら何もしない）。
 * データを消す `prisma migrate reset` は使わない（中身の入れ替えは loadSnapshot が *_eval に限って行う）。
 */
export function migrateEvalDb(url = process.env.DATABASE_URL): void {
  assertEvalDatabaseUrl(url);
  execFileSync(path.join(ROOT, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}

/**
 * 匿名化スナップショットを評価用 DB に投入する（既存の中身は消す）。
 *   - ダミーユーザー 1 人がすべての道の持ち主
 *   - 道 / 試したことの UUID は評価用 ID から決定的に生成（evalUuid）。本番の UUID は持っていない
 *   - 試したことは公開・承認済み（export 対象 = 公開データなので）。result は export に含めないため
 *     スキーマ上の必須値として "ongoing" を入れる（ILIKE / fuzzy / Embedding の評価には使わない）
 *   - createdAt / updatedAt は export に無いので、投入順（= export 時にランダム化した順）で機械的に振る。
 *     ILIKE の既定の並び（updatedAt desc）は本番の新しい順を再現しない
 */
export async function loadSnapshot(db: PrismaClient, snap: AnonSnapshot): Promise<void> {
  assertEvalDatabaseUrl();
  const L = snap.label;
  const base = Date.UTC(2000, 0, 1);
  await db.$transaction([
    db.roadTag.deleteMany(),
    db.attempt.deleteMany(),
    db.road.deleteMany(),
    db.tag.deleteMany(),
    db.user.deleteMany(),
  ]);
  const userId = evalUuid(L, "user");
  await db.user.create({ data: { id: userId, googleSub: `eval:${L}` } });

  const tagNames = [...new Set(snap.roads.flatMap((r) => r.tags))];
  await db.tag.createMany({ data: tagNames.map((name) => ({ id: evalUuid(L, `tag:${name}`), name })) });

  await db.road.createMany({
    data: snap.roads.map((r, i) => ({
      id: evalUuid(L, r.id),
      userId,
      isSeedData: r.isSeedData,
      difficulty: r.difficulty,
      situation: r.situation,
      goal: r.goal,
      previouslyAble: r.previouslyAble,
      createdAt: new Date(base + i * 1000),
      updatedAt: new Date(base + i * 1000),
    })),
  });
  await db.roadTag.createMany({
    data: snap.roads.flatMap((r) =>
      r.tags.map((name) => ({ roadId: evalUuid(L, r.id), tagId: evalUuid(L, `tag:${name}`) })),
    ),
  });
  await db.attempt.createMany({
    data: snap.attempts.map((a, i) => ({
      id: evalUuid(L, a.id),
      roadId: evalUuid(L, a.roadId),
      method: a.method,
      memo: a.memo,
      result: "ongoing" as const,
      isPublished: true,
      moderationStatus: "approved" as const,
      createdAt: new Date(base + i * 1000),
      updatedAt: new Date(base + i * 1000),
    })),
  });
}

export function readSnapshot(label: string): AnonSnapshot {
  const file = path.join(ROOT, "poc/embedding/data", `public-${label}.json`);
  return JSON.parse(fs.readFileSync(file, "utf8")) as AnonSnapshot;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  assertEvalDatabaseUrl();
  const [cmd, label] = process.argv.slice(2);
  if (cmd === "setup") {
    migrateEvalDb();
    console.log("評価用 DB に migrations を適用しました");
  } else if (cmd === "load" && label) {
    const { prisma } = await import("../../../src/lib/db.ts");
    const snap = readSnapshot(label);
    await loadSnapshot(prisma, snap);
    console.log(`投入しました: roads=${snap.roads.length} attempts=${snap.attempts.length}（label=${label}）`);
    await prisma.$disconnect();
  } else {
    console.error("使い方: eval-db.ts setup | eval-db.ts load <label>");
    process.exit(1);
  }
}
