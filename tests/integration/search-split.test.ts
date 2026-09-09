import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { searchRoads, searchMethods } from "@/lib/queries";
import type { ExperienceQuery } from "@/lib/validation";

/**
 * 検索語の当たり場所で結果カードを出し分ける (指示)。
 *   - 語がページ（Road）側の内容（できなくなった/やりたいこと/場面/以前できていた/タグ）に当たる → 道カード
 *   - 語が方法（Attempt の method/memo）の中に当たる → 方法カード
 */

const MARK = `search-split-${Date.now()}`;
const ROAD_WORD = `${MARK}ロードゴト`; // difficulty に入れる、方法には入れない語
const METHOD_WORD = `${MARK}ホウホウダケ`; // method に入れる、Road フィールドには入れない語
const DEEP_WORD = `${MARK}フカイホウホウ`; // 11 件以上の道の 12 件目の method に入れる語
const PAGE_WORD = `${MARK}オオイホウホウ`; // 25 件の method に入れる語（mp ページ送り確認用）
let userId = "";
let publishedAttemptId = "";
let deepAttemptId = "";

const q = (over: Partial<ExperienceQuery>): ExperienceQuery => ({
  q: undefined,
  result: undefined,
  tag: undefined,
  page: 1,
  mp: 1,
  kind: "both",
  limit: 20,
  sort: "recent",
  ...over,
});

beforeAll(async () => {
  const user = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  userId = user.id;
  const road = await prisma.road.create({
    data: {
      userId,
      difficulty: `${ROAD_WORD} で困っている`,
      goal: "自分でできるようになりたい",
      attempts: {
        create: [
          {
            method: `${METHOD_WORD} を使ってみた`,
            result: "partial",
            isPublished: true,
            moderationStatus: "approved",
          },
          { method: `${METHOD_WORD} を非公開で試した`, result: "failed", isPublished: false },
        ],
      },
    },
    include: { attempts: true },
  });
  publishedAttemptId = road.attempts.find((a) => a.isPublished)!.id;

  // ツリーが 2 ページになる道（公開 12 方法）。12 件目の method に DEEP_WORD。
  const deepRoad = await prisma.road.create({
    data: {
      userId,
      difficulty: `${MARK} 長い道`,
      goal: "区切りたい",
      attempts: {
        create: Array.from({ length: 12 }, (_, i) => ({
          method: i === 11 ? `${DEEP_WORD} を試した（12件目）` : `${MARK} 方法 ${i + 1}`,
          result: "ongoing" as const,
          isPublished: true,
          moderationStatus: "approved" as const,
          triedAt: new Date(`2025-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
        })),
      },
    },
    include: { attempts: true },
  });
  deepAttemptId = deepRoad.attempts.find((a) => a.method.includes(DEEP_WORD))!.id;

  // 方法カードのページ送り（?mp=）確認用: 25 件の公開方法に PAGE_WORD
  await prisma.road.create({
    data: {
      userId,
      difficulty: `${MARK} たくさんの方法がある道`,
      goal: "いろいろ試したい",
      attempts: {
        create: Array.from({ length: 25 }, (_, i) => ({
          method: `${PAGE_WORD} その${i + 1}`,
          result: "ongoing" as const,
          isPublished: true,
          moderationStatus: "approved" as const,
        })),
      },
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("searchRoads はページ（Road）側の一致だけ", () => {
  it("困りごとの語 → 道カードが出る", async () => {
    const { items } = await searchRoads(q({ q: ROAD_WORD }));
    expect(items.some((r) => r.difficulty?.includes(ROAD_WORD))).toBe(true);
  });

  it("方法の中だけにある語 → 道カードには出ない", async () => {
    const { items } = await searchRoads(q({ q: METHOD_WORD }));
    expect(items.some((r) => r.attempts.some((a) => a.method.includes(METHOD_WORD)))).toBe(false);
  });
});

describe("searchMethods は方法（Attempt）側の一致だけ", () => {
  it("方法の中の語 → 方法カードが出る（公開のみ・リンク先は attempt.id）", async () => {
    const { items, total } = await searchMethods(q({ q: METHOD_WORD }));
    const mine = items.filter((m) => m.method.includes(METHOD_WORD));
    expect(mine).toHaveLength(1);
    expect(mine[0].attemptId).toBe(publishedAttemptId);
    expect(mine[0].roadDifficulty).toContain(ROAD_WORD);
    expect(total).toBe(1); // 非公開は数えない
  });

  it("非公開 Attempt は方法カードに出ない", async () => {
    const { items } = await searchMethods(q({ q: METHOD_WORD }));
    expect(items.some((m) => m.method.includes("非公開"))).toBe(false);
  });

  it("検索語が無くても公開された試したことを一覧できる（結果でも絞れる）", async () => {
    const all = await searchMethods(q({ q: undefined }));
    expect(all.total).toBeGreaterThan(0);
    expect(all.items.length).toBeGreaterThan(0);

    const partial = await searchMethods(q({ q: undefined, result: "partial" }));
    expect(partial.items.length).toBeGreaterThan(0);
    expect(partial.items.every((m) => m.result === "partial")).toBe(true);
    expect(partial.total).toBeLessThanOrEqual(all.total);
  });

  it("1 ページに収まる道の方法カードは treePage=1", async () => {
    const { items } = await searchMethods(q({ q: METHOD_WORD }));
    expect(items[0].treePage).toBe(1);
  });

  it("ツリーが分割される道は、その方法が出るページ番号を treePage に持つ（12 件目 → 2 ページ目）", async () => {
    const { items } = await searchMethods(q({ q: DEEP_WORD }));
    const card = items.find((m) => m.attemptId === deepAttemptId)!;
    expect(card).toBeDefined();
    expect(card.treePage).toBe(2);
  });

  it("方法カードは道カードと独立に ?mp= でページ送りする", async () => {
    const p1 = await searchMethods(q({ q: PAGE_WORD, limit: 20, mp: 1 }));
    expect(p1.total).toBe(25);
    expect(p1.items).toHaveLength(20);
    expect(p1.hasMore).toBe(true);
    expect(p1.page).toBe(1);

    const p2 = await searchMethods(q({ q: PAGE_WORD, limit: 20, mp: 2 }));
    expect(p2.items).toHaveLength(5);
    expect(p2.hasMore).toBe(false);
    expect(p2.page).toBe(2);

    // 1 ページ目と 2 ページ目で重複しない
    const ids1 = new Set(p1.items.map((m) => m.attemptId));
    expect(p2.items.every((m) => !ids1.has(m.attemptId))).toBe(true);
  });
});
