import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { searchRoads, searchMethods } from "@/lib/queries";
import type { ExperienceQuery } from "@/lib/validation";

/**
 * 検索AI Phase 1: `searchRoads` / `searchMethods` に `{ terms, rank }` を渡したときの挙動。
 *   - AI が展開した別語（生フレーズを含まない語）でも該当行が出る（ハイブリッド絞り込み）
 *   - 非公開 Attempt は terms 経路でも一切出ない（公開ゲートは不変）
 *   - 取得後のページ内で関連度順に並べ替わる（DB の並び順は変えない）
 */

const MARK = `search-ai-${Date.now()}`;
const SYN = `${MARK}タチアガル`; // 生フレーズには無いが difficulty にある「別の言い方」
const RAW = `${MARK}セイフレーズ`; // どこにも入れない生フレーズ
const HIDDEN = `${MARK}ヒソカ`; // 非公開 Attempt だけが持つ語
const EXACT = `${MARK}ボタン`; // ランキング用: difficulty が完全一致する道
const MTERM = `${MARK}クツシタ`; // 方法カードのランキング用: method 本文に必ず入れる語
let userId = "";

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

  // (1) difficulty に「別の言い方」を持つ公開道
  await prisma.road.create({
    data: {
      userId,
      difficulty: `${SYN} のがつらい`,
      goal: "自分でできるようになりたい",
      attempts: {
        create: [
          { method: `${MARK} 手すりを使った`, result: "partial", isPublished: true, moderationStatus: "approved" },
        ],
      },
    },
  });

  // (2) 非公開 Attempt だけの道（terms 経路でも出てはいけない）
  await prisma.road.create({
    data: {
      userId,
      difficulty: `${HIDDEN} で困っている`,
      goal: "こっそり",
      attempts: {
        create: [{ method: `${HIDDEN}ホウホウ を試した`, result: "failed", isPublished: false }],
      },
    },
  });

  // (3) ランキング用 2 道。作成順に updatedAt が新しくなるので、
  //     「部分一致(あとで作成=DB上位)」より「完全一致(先に作成=DB下位)」が上に来ることを確かめる。
  await prisma.road.create({
    data: {
      userId,
      difficulty: EXACT, // 完全一致
      goal: "とめられるようになりたい",
      attempts: {
        create: [{ method: `${MARK} 片手で練習した`, result: "ongoing", isPublished: true, moderationStatus: "approved" }],
      },
    },
  });
  await new Promise((r) => setTimeout(r, 15)); // updatedAt を確実に後にする
  await prisma.road.create({
    data: {
      userId,
      difficulty: `${EXACT}がとめにくい`, // 部分一致
      goal: "らくにしたい",
      attempts: {
        create: [{ method: `${MARK} 大きめのボタンに替えた`, result: "partial", isPublished: true, moderationStatus: "approved" }],
      },
    },
  });

  // (4) 方法カードのランキング用。どちらも method 本文に MTERM を含むが、
  //     道の困りごとにも MTERM を含む方（HIGH）が上に来るはず。HIGH を先に作る（= DB では後ろ）。
  await prisma.road.create({
    data: {
      userId,
      difficulty: `${MTERM} を履くのがむずかしい`,
      goal: "自分で履きたい",
      attempts: {
        create: [{ method: `${MTERM} の輪を広げてから足を入れた`, result: "partial", isPublished: true, moderationStatus: "approved" }],
      },
    },
  });
  await new Promise((r) => setTimeout(r, 15));
  await prisma.road.create({
    data: {
      userId,
      difficulty: `${MARK} 身支度に時間がかかる`, // MTERM は困りごとに無い
      goal: "はやくしたい",
      attempts: {
        create: [{ method: `${MTERM} だけは家族に手伝ってもらった`, result: "ongoing", isPublished: true, moderationStatus: "approved" }],
      },
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("terms によるハイブリッド絞り込み", () => {
  it("生フレーズが本文に無くても、展開語が difficulty に当たれば道が出る", async () => {
    const { items } = await searchRoads(q({ q: RAW }), null, { terms: [RAW, SYN], rank: true });
    expect(items.some((r) => r.difficulty?.includes(SYN))).toBe(true);
  });

  it("展開語が method に当たれば方法カードが出る", async () => {
    const { items } = await searchMethods(q({ q: RAW }), null, {
      terms: [RAW, `${MARK} 手すり`],
      rank: true,
    });
    expect(items.some((m) => m.method.includes("手すり"))).toBe(true);
  });

  it("語ごとに違う道が当たっても、1 回の検索で両方返る（OR の和集合）", async () => {
    const { items } = await searchRoads(q({ q: RAW }), null, {
      terms: [SYN, EXACT], // SYN は (1) の道、EXACT は (3) の道
      rank: true,
    });
    expect(items.some((r) => r.difficulty?.includes(SYN))).toBe(true);
    expect(items.some((r) => r.difficulty === EXACT)).toBe(true);
  });

  it("rank を渡さなくても terms による絞り込み拡大は効く", async () => {
    const { items } = await searchRoads(q({ q: RAW }), null, { terms: [RAW, SYN] });
    expect(items.some((r) => r.difficulty?.includes(SYN))).toBe(true);
  });

  it("terms が空配列でも（rank:true でも）落ちず、q.q 検索として動く", async () => {
    const { items } = await searchRoads(q({ q: SYN }), null, { terms: [], rank: true });
    expect(items.some((r) => r.difficulty?.includes(SYN))).toBe(true);
  });
});

describe("公開ゲートは terms 経路でも不変", () => {
  it("非公開 Attempt だけの道は searchRoads に出ない", async () => {
    const { items } = await searchRoads(q({ q: HIDDEN }), null, { terms: [HIDDEN], rank: true });
    expect(items.some((r) => r.difficulty?.includes(HIDDEN))).toBe(false);
  });

  it("非公開 Attempt は searchMethods に出ない", async () => {
    const { items, total } = await searchMethods(q({ q: HIDDEN }), null, {
      terms: [HIDDEN, `${HIDDEN}ホウホウ`],
      rank: true,
    });
    expect(items.some((m) => m.method.includes(HIDDEN))).toBe(false);
    expect(total).toBe(0);
  });
});

describe("ページ内の関連度並べ替え", () => {
  it("difficulty 完全一致の道が、部分一致の道より上に来る", async () => {
    const ranked = await searchRoads(q({ q: EXACT }), null, { terms: [EXACT], rank: true });
    const mine = ranked.items.filter((r) => r.difficulty?.startsWith(EXACT));
    expect(mine.length).toBe(2);
    expect(mine[0].difficulty).toBe(EXACT);

    // rank を渡さなければ DB 並び順（updatedAt desc）のまま = 部分一致（あとで作成）が先頭
    const plain = await searchRoads(q({ q: EXACT }));
    const minePlain = plain.items.filter((r) => r.difficulty?.startsWith(EXACT));
    expect(minePlain[0].difficulty).toBe(`${EXACT}がとめにくい`);
  });

  it("方法カードは、道の困りごとにも語がある方が method だけ一致より上に来る", async () => {
    const ranked = await searchMethods(q({ q: MTERM }), null, { terms: [MTERM], rank: true });
    const mine = ranked.items.filter((m) => m.method.includes(MTERM));
    expect(mine.length).toBe(2);
    expect(mine[0].roadDifficulty).toContain(MTERM); // 困りごと＋方法の両方一致が先頭

    // rank 無しなら DB 並び（createdAt desc）＝あとで作った LOW 側が先頭
    const plain = await searchMethods(q({ q: MTERM }));
    const minePlain = plain.items.filter((m) => m.method.includes(MTERM));
    expect(minePlain[0].roadDifficulty).not.toContain(MTERM);
  });
});
