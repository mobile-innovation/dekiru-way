import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { PUBLIC_ATTEMPT_WHERE } from "../../../src/lib/search.ts";
import { anonymizeSnapshot, type AnonSnapshot, type RandomInt } from "./anonymize.ts";

/**
 * Stage 3.1: 公開データの匿名化スナップショットを書き出す（読み取りのみ。DB は変更しない）。
 *
 * 対象は公開検索と同じ基準（PUBLIC_ATTEMPT_WHERE をそのまま使う）:
 *   - Attempt: PUBLIC_ATTEMPT_WHERE（isPublished && approved）
 *   - Road:    公開 Attempt を 1 つ以上持つ道。isSeedData は公開検索と同じく区別しない（フラグだけ残す）
 * DB からは評価に要るカラムだけを select する（userId・日付などはメモリにも読まない）。
 * 実 ID は道と試したことの対応付けのためにメモリ内でだけ使い、ファイルには評価用 ID だけを書く。
 *
 * 実行（リポジトリのルートで）:
 *   node_modules/.bin/tsx --env-file=.env poc/embedding/stage3/export-public.ts local
 * 出力: poc/embedding/data/public-<label>.json（git 管理外）
 */

export async function exportPublicSnapshot(
  db: PrismaClient,
  label: string,
  rand?: RandomInt,
): Promise<AnonSnapshot> {
  const roads = await db.road.findMany({
    where: { attempts: { some: PUBLIC_ATTEMPT_WHERE } },
    select: {
      id: true,
      isSeedData: true,
      difficulty: true,
      situation: true,
      goal: true,
      previouslyAble: true,
      roadTags: { select: { tag: { select: { name: true } } } },
    },
  });
  const attempts = await db.attempt.findMany({
    where: PUBLIC_ATTEMPT_WHERE,
    select: { id: true, roadId: true, method: true, memo: true },
  });
  return anonymizeSnapshot(
    label,
    roads.map(({ roadTags, ...r }) => ({ ...r, tags: roadTags.map((rt) => rt.tag.name) })),
    attempts,
    rand,
  );
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const label = process.argv[2];
  if (!label || !/^[a-z0-9-]+$/.test(label)) {
    console.error("使い方: export-public.ts <label>（英小文字・数字・ハイフン）");
    process.exit(1);
  }
  const { prisma } = await import("../../../src/lib/db.ts");
  const snapshot = await exportPublicSnapshot(prisma, label);
  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `public-${label}.json`);
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log(`roads=${snapshot.roads.length} attempts=${snapshot.attempts.length} → ${out}`);
  await prisma.$disconnect();
}
