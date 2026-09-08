/**
 * 「経験を探す」の件数が多いときの挙動を目視確認するためのデモデータ。
 *
 *   npx tsx scripts/seed-search-demo.ts          # 投入（再実行で作り直し）
 *   npx tsx scripts/seed-search-demo.ts --clean  # 削除だけ
 *
 * 確認できること:
 *   /experiences?q=デモ困りごと … 困りごと（Road）に当たる → 道カードが 24 件 → ページ送り（20 / ページ）
 *   /experiences?q=デモ方法     … 方法（Attempt）だけに当たる → 方法カードが 20 件 + 「ほかにも…」注記
 *                                （道カードの 2 ページ目に行くと方法セクションは消える）
 */
import { PrismaClient, type AttemptResult } from "@prisma/client";

const prisma = new PrismaClient();

const GOOGLE_SUB = "demo:search-volume";
const ROAD_WORD = "デモ困りごと";
const METHOD_WORD = "デモ方法";
const RESULTS: AttemptResult[] = ["success", "partial", "no_change", "failed", "ongoing"];

async function clean() {
  const { count } = await prisma.user.deleteMany({ where: { googleSub: GOOGLE_SUB } });
  console.log(`removed demo user(s): ${count}`);
}

async function main() {
  await clean();
  if (process.argv.includes("--clean")) return;

  const user = await prisma.user.create({
    data: { googleSub: GOOGLE_SUB, displayName: "検索デモ" },
  });

  let roads = 0;
  let publishedAttempts = 0;
  let methodHits = 0;

  // 24 本の道: difficulty に ROAD_WORD → 道カードがページ送りになる（20 / ページ）
  for (let r = 1; r <= 24; r++) {
    const methodCount = 3 + (r % 3); // 3〜5
    await prisma.road.create({
      data: {
        userId: user.id,
        title: `検索デモ ${r}`,
        difficulty: `${ROAD_WORD}その${r}：日常の動作がしにくくなって困っている`,
        goal: "自分のペースでできるようになりたい",
        situation: "急いでいるとき。",
        // 公開デモなので道も承認済みにする（未指定だと既定 pending でその道の経験は公開面に出ない）。
        moderationStatus: "approved",
        attempts: {
          create: Array.from({ length: methodCount }, (_, i) => {
            // 一部の方法本文に METHOD_WORD を入れる（方法カード用）。合計 20 件超にして
            // 「ほかにも…」注記（hasMore）が出るようにする。
            const withWord = methodHits < 30 && (i === 0 || (r + i) % 2 === 0);
            if (withWord) methodHits++;
            return {
              method: withWord
                ? `${METHOD_WORD}${methodHits}：道具を替えて手順を分けてみた`
                : `方法${r}-${i + 1}：やり方を少し変えてみた`,
              result: RESULTS[(r + i) % RESULTS.length],
              isPublished: true,
              moderationStatus: "approved" as const,
              triedAt: new Date(2025, (r + i) % 12, ((r + i) % 27) + 1),
              memo: i === 0 ? "最初はうまくいかなかったが、続けたら慣れた。" : null,
            };
          }),
        },
      },
    });
    roads++;
    publishedAttempts += methodCount;
  }

  console.log(
    `done. roads=${roads}, publishedAttempts=${publishedAttempts}, method-word hits=${methodHits}`,
  );
  console.log("試す:");
  console.log(`  /experiences?q=${encodeURIComponent(ROAD_WORD)}   (道カード = ページ送り)`);
  console.log(`  /experiences?q=${encodeURIComponent(METHOD_WORD)}   (方法カード = 20件 + 注記)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
