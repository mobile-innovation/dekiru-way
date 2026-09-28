import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { fuzzySearchRoadIds, fuzzySearchAttemptIds } from "@/lib/search-fuzzy";
import { searchRoads, searchMethods } from "@/lib/queries";
import type { ExperienceQuery } from "@/lib/validation";

/**
 * 表記ゆれに強い検索 (pg_trgm)。通常のキーワード検索 (ILIKE) が 0 件のときだけ使う
 * 最後の手段。「つめが切りにくい」で検索しても、保存されている文言が
 * 「つめを切ろうとしても、うまく切りにくく、…」のように語順・言い回しが違うと
 * ILIKE では見つからない、という実際の報告から追加した機能。
 *
 * 注意: クリーンアップは MARK 文字列の前方一致ではなく、作成した id を直接指定して削除する
 * （difficulty 等の本文に MARK を混ぜると、trigram 類似度がその共通文字列で底上げされ、
 * 「無関係なデータはヒットしない」という検証が意味をなさなくなるため）。
 */

const MARK = `fuzzy-${Date.now()}`;
let ownerId = "";
let roadId = "";
let attemptId = "";
let unrelatedRoadId = "";
const extraRoadIds: string[] = [];

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
  const owner = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  ownerId = owner.id;

  // 開発DBに既にある他のテストデータ (「つめ」関連など) と偶然一致しないよう、
  // このテストだけの話題（ふた）を使う。
  const road = await prisma.road.create({
    data: {
      userId: ownerId,
      difficulty: "ふたを開けようとしても、うまく開けにくく、時間がかかる。",
      situation: "ふたを開けようとしても、うまく開けにくく、時間がかかる。",
      goal: "できる範囲で自分でふたを開けたい。",
    },
  });
  roadId = road.id;
  const attempt = await prisma.attempt.create({
    data: {
      roadId,
      method: "ゴム手袋をつけてふたを開けるようにした",
      result: "partial",
      isPublished: true,
      moderationStatus: "approved",
    },
  });
  attemptId = attempt.id;

  // 全く関係ない道（ヒットしないことの確認用）
  const unrelated = await prisma.road.create({
    data: { userId: ownerId, difficulty: "自転車の鍵を回すのが難しい" },
  });
  unrelatedRoadId = unrelated.id;
  await prisma.attempt.create({
    data: {
      roadId: unrelatedRoadId,
      method: "鍵を大きいものに交換した",
      result: "success",
      isPublished: true,
      moderationStatus: "approved",
    },
  });
});

afterAll(async () => {
  await prisma.road.deleteMany({ where: { id: { in: [roadId, unrelatedRoadId, ...extraRoadIds] } } });
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("fuzzySearchRoadIds / fuzzySearchAttemptIds", () => {
  it("語順・言い回しが違っても、trigram類似度で見つかる（「つめが切りにくい」報告と同種のケース）", async () => {
    const ids = await fuzzySearchRoadIds("ふたが開けにくい", 20);
    expect(ids).toContain(roadId);
    expect(ids).not.toContain(unrelatedRoadId);
  });

  it("完全一致に近いほど、類似度が高い順に先頭へ来る", async () => {
    const ids = await fuzzySearchRoadIds(
      "ふたを開けようとしても、うまく開けにくく、時間がかかる。",
      20,
    );
    expect(ids[0]).toBe(roadId);
  });

  it("非公開/未承認の Attempt しか無い道は対象外", async () => {
    const road = await prisma.road.create({
      data: { userId: ownerId, difficulty: "非公開の道 ふたが開けにくい" },
    });
    extraRoadIds.push(road.id);
    await prisma.attempt.create({
      data: { roadId: road.id, method: "試したこと", result: "ongoing" }, // 既定 isPublished=false
    });
    const ids = await fuzzySearchRoadIds("ふたが開けにくい", 20);
    expect(ids).not.toContain(road.id);
  });

  it("Attempt の method/memo でも見つかる", async () => {
    const ids = await fuzzySearchAttemptIds("ゴム手袋でふたを開ける", 20);
    expect(ids).toContain(attemptId);
  });

  it("空文字・空白のみは空配列を返す（DB を叩かない）", async () => {
    expect(await fuzzySearchRoadIds("", 10)).toEqual([]);
    expect(await fuzzySearchRoadIds("   ", 10)).toEqual([]);
  });

  it("関連の無い語では見つからない（しきい値未満は返さない）", async () => {
    const ids = await fuzzySearchRoadIds("全く関係ない宇宙旅行の話", 20);
    expect(ids).not.toContain(roadId);
    expect(ids).not.toContain(unrelatedRoadId);
  });
});

describe("searchRoads / searchMethods: opts.ids で id 一覧に絞り込める", () => {
  it("searchRoads({ ids }) は id 一覧の道だけを返す（ILIKE 条件は使わない）", async () => {
    const res = await searchRoads(q({ q: "この語では通常検索はヒットしない" }), null, {
      ids: [roadId],
    });
    expect(res.items.map((i) => i.entryId)).toEqual([attemptId]);
  });

  it("searchMethods({ ids }) は id 一覧の Attempt だけを返す", async () => {
    const res = await searchMethods(q({ q: "この語では通常検索はヒットしない" }), null, {
      ids: [attemptId],
    });
    expect(res.items.map((i) => i.attemptId)).toEqual([attemptId]);
  });
});

/**
 * 第0.5段階の修正（fuzzy 経路）:
 *   1. 類似度順が searchRoads / searchMethods の最終結果に残る（sort=recent 既定時）
 *   2. 候補を到達可能ページぶん取り、2 ページ目以降も出る
 *   3. result / tag / read を候補抽出の段階で掛ける（上位 N 件で切ってから落とさない）
 *   4. 公開ゲート (pending / rejected / 非公開は出ない) は生 SQL 側でも Prisma 側でも保たれる
 * 開発 DB に他のデータがあっても崩れないよう、判定は「このテストで作った id」に絞って行う。
 */
describe("fuzzy 経路: 類似度順・ページング・絞り込み・公開ゲート", () => {
  const M2 = `${MARK}-v2`;
  const TAG_A = `${M2}-taga`;
  const TAG_B = `${M2}-tagb`;
  const QT = "雨の日に傘をたたむのが、うまくいかず時間がかかる。";
  const MQ = "雨の日に傘をたたむ練習を、ゆっくり続けた。";
  const LIMIT = 500;
  const ids = { r0: "", r1: "", r2: "", a0: "", a1: "", a2: "" };
  const hiddenRoadIds: string[] = [];
  const hiddenAttemptIds: string[] = [];
  const allRoadIds: string[] = [];
  const roadOfAttempt = new Map<string, string>();
  let viewerId = "";

  const mineRoads = (xs: string[]) => xs.filter((x) => allRoadIds.includes(x));
  const entryRoads = (items: { entryId: string }[]) =>
    mineRoads(items.map((i) => roadOfAttempt.get(i.entryId) ?? ""));
  const mineAttempts = (xs: string[]) => xs.filter((x) => roadOfAttempt.has(x));

  async function makeRoad(
    difficulty: string,
    tag: string | null,
    updatedAt: Date,
    attempt: {
      method: string;
      result: "success" | "partial";
      isPublished?: boolean;
      moderationStatus?: "pending" | "approved" | "rejected";
    },
  ) {
    const road = await prisma.road.create({
      data: {
        userId: ownerId,
        difficulty,
        ...(tag
          ? {
              roadTags: {
                create: {
                  tag: { connectOrCreate: { where: { name: tag }, create: { name: tag } } },
                },
              },
            }
          : {}),
      },
    });
    allRoadIds.push(road.id);
    const a = await prisma.attempt.create({
      data: {
        roadId: road.id,
        method: attempt.method,
        result: attempt.result,
        isPublished: attempt.isPublished ?? true,
        moderationStatus: attempt.moderationStatus ?? "approved",
      },
    });
    roadOfAttempt.set(a.id, road.id);
    await prisma.road.update({ where: { id: road.id }, data: { updatedAt } });
    return { roadId: road.id, attemptId: a.id };
  }

  beforeAll(async () => {
    const now = Date.now();
    // 類似度順 (r0 > r1 > r2) と updatedAt 順 (r2 > r1 > r0) を逆にしておく。
    const r0 = await makeRoad(QT, TAG_A, new Date(now - 30_000), {
      method: MQ,
      result: "partial",
    });
    const r1 = await makeRoad("雨の日に傘をたたむのが、うまくいかない。", TAG_B, new Date(now - 20_000), {
      method: "雨の日に傘をたたむ練習を続けた。",
      result: "success",
    });
    const r2 = await makeRoad("雨の日に傘をたたむのが、少しむずかしい日がある。", TAG_A, new Date(now - 10_000), {
      method: "傘をたたむ練習を少しだけした。",
      result: "partial",
    });
    Object.assign(ids, {
      r0: r0.roadId,
      r1: r1.roadId,
      r2: r2.roadId,
      a0: r0.attemptId,
      a1: r1.attemptId,
      a2: r2.attemptId,
    });

    // 公開ゲート外: 本文は検索語と完全一致させ、出てしまえば必ず上位に来る状態にする。
    for (const gate of [
      { moderationStatus: "pending" as const },
      { moderationStatus: "rejected" as const },
      { isPublished: false },
    ]) {
      const h = await makeRoad(QT, TAG_A, new Date(now), { method: MQ, result: "success", ...gate });
      hiddenRoadIds.push(h.roadId);
      hiddenAttemptIds.push(h.attemptId);
    }
    // 公開の道 r0 にぶら下がる、非公開の Attempt（方法カードに出てはいけない）。
    const extra = await prisma.attempt.create({
      data: { roadId: ids.r0, method: MQ, result: "success", moderationStatus: "pending", isPublished: true },
    });
    roadOfAttempt.set(extra.id, ids.r0);
    hiddenAttemptIds.push(extra.id);

    const viewer = await prisma.user.create({ data: { googleSub: `${M2}:viewer` } });
    viewerId = viewer.id;
    await prisma.attemptRead.create({ data: { userId: viewerId, attemptId: ids.a0 } });
  });

  afterAll(async () => {
    await prisma.road.deleteMany({ where: { id: { in: allRoadIds } } });
    await prisma.tag.deleteMany({ where: { name: { in: [TAG_A, TAG_B] } } });
    await prisma.user.deleteMany({ where: { googleSub: { startsWith: M2 } } });
  });

  it("1. 道: fuzzy の類似度順が searchRoads の最終結果に残る（updatedAt 順に戻らない）", async () => {
    const fz = await fuzzySearchRoadIds(QT, LIMIT);
    expect(mineRoads(fz)).toEqual([ids.r0, ids.r1, ids.r2]);
    const res = await searchRoads(q({ q: QT, kind: "road", limit: 50 }), null, { ids: fz });
    expect(entryRoads(res.items)).toEqual([ids.r0, ids.r1, ids.r2]);
  });

  it("1. 方法: fuzzy の類似度順が searchMethods の最終結果に残る", async () => {
    const fz = await fuzzySearchAttemptIds(MQ, LIMIT);
    const expected = mineAttempts(fz);
    expect(expected[0]).toBe(ids.a0);
    const res = await searchMethods(q({ q: MQ, kind: "method", limit: 50 }), null, { ids: fz });
    expect(mineAttempts(res.items.map((i) => i.attemptId))).toEqual(expected);
  });

  it("2. 2 ページ目でも候補が取れる（道 page / 方法 mp）", async () => {
    const base = q({ q: QT, tag: TAG_A, limit: 1 });
    const rIds = await fuzzySearchRoadIds(QT, LIMIT, { tag: TAG_A });
    const p1 = await searchRoads(base, null, { ids: rIds });
    const p2 = await searchRoads({ ...base, page: 2 }, null, { ids: rIds });
    expect(p1.total).toBe(2);
    expect(p1.hasMore).toBe(true);
    expect(entryRoads(p1.items)).toEqual([ids.r0]);
    expect(entryRoads(p2.items)).toEqual([ids.r2]);
    expect(p2.hasMore).toBe(false);

    const aIds = await fuzzySearchAttemptIds(MQ, LIMIT, { tag: TAG_A });
    const m1 = await searchMethods(base, null, { ids: aIds });
    const m2 = await searchMethods({ ...base, mp: 2 }, null, { ids: aIds });
    expect(m1.total).toBe(2);
    expect(m1.hasMore).toBe(true);
    expect(m1.items.map((i) => i.attemptId)).toEqual([ids.a0]);
    expect(m2.items.map((i) => i.attemptId)).toEqual([ids.a2]);
  });

  it("3. tag 条件を候補抽出で掛ける（大文字小文字を区別しない = 通常検索と同じ）", async () => {
    const fz = await fuzzySearchRoadIds(QT, LIMIT, { tag: TAG_A.toUpperCase() });
    expect(mineRoads(fz)).toEqual([ids.r0, ids.r2]);
    expect(await fuzzySearchRoadIds(QT, LIMIT, { tag: `${M2}-存在しないタグ` })).toEqual([]);
    const res = await searchRoads(q({ q: QT, tag: TAG_A }), null, { ids: fz });
    expect(entryRoads(res.items)).toEqual([ids.r0, ids.r2]);
  });

  it("4. result 条件を候補抽出で掛ける（上位 1 件に絞っても該当が漏れない）", async () => {
    // 修正前は類似度上位 1 件 (r0=partial) を取ってから success で絞るため 0 件になっていた。
    const top1 = await fuzzySearchRoadIds(QT, 1, { result: "success", tag: TAG_B });
    expect(top1).toEqual([ids.r1]);
    const fz = await fuzzySearchRoadIds(QT, LIMIT, { result: "success" });
    expect(mineRoads(fz)).toEqual([ids.r1]);
    const res = await searchRoads(q({ q: QT, result: "success" }), null, { ids: fz });
    expect(entryRoads(res.items)).toEqual([ids.r1]);

    const aIds = await fuzzySearchAttemptIds(MQ, LIMIT, { result: "success" });
    expect(mineAttempts(aIds)).toEqual([ids.a1]);
  });

  it("5. read 条件を候補抽出で掛ける（既読 / 未読、ログイン中のみ）", async () => {
    const read = await fuzzySearchRoadIds(QT, LIMIT, { read: "read", viewerUserId: viewerId });
    expect(mineRoads(read)).toEqual([ids.r0]);
    const unread = await fuzzySearchRoadIds(QT, LIMIT, { read: "unread", viewerUserId: viewerId });
    expect(mineRoads(unread)).toEqual([ids.r1, ids.r2]);
    const res = await searchRoads(q({ q: QT, read: "unread" }), viewerId, { ids: unread });
    expect(entryRoads(res.items)).toEqual([ids.r1, ids.r2]);

    const aRead = await fuzzySearchAttemptIds(MQ, LIMIT, { read: "read", viewerUserId: viewerId });
    expect(mineAttempts(aRead)).toEqual([ids.a0]);
    // 未ログインなら read は無視（通常検索と同じ）
    const anon = await fuzzySearchRoadIds(QT, LIMIT, { read: "read", viewerUserId: null });
    expect(mineRoads(anon)).toEqual([ids.r0, ids.r1, ids.r2]);
  });

  it("6-8. pending / rejected / 非公開 は候補にも最終結果にも出ない", async () => {
    const rIds = await fuzzySearchRoadIds(QT, LIMIT);
    const aIds = await fuzzySearchAttemptIds(MQ, LIMIT);
    for (const h of hiddenRoadIds) expect(rIds).not.toContain(h);
    for (const h of hiddenAttemptIds) expect(aIds).not.toContain(h);

    // ids に紛れ込んでも Prisma 側の公開ゲートで落ちる（最終判定は Prisma の where）。
    const roads = await searchRoads(q({ q: QT, limit: 50 }), null, {
      ids: [...hiddenRoadIds, ids.r0],
    });
    expect(entryRoads(roads.items)).toEqual([ids.r0]);
    const methods = await searchMethods(q({ q: MQ, limit: 50 }), null, {
      ids: [...hiddenAttemptIds, ids.a0],
    });
    expect(methods.items.map((i) => i.attemptId)).toEqual([ids.a0]);
  });

  it("sort を明示 (helpful) したときは、fuzzy 候補の中をその並びで出す", async () => {
    const fz = await fuzzySearchRoadIds(QT, LIMIT);
    const res = await searchRoads(q({ q: QT, sort: "helpful", limit: 50 }), null, { ids: fz });
    // success の r1 が先頭。partial どうしは DB の updatedAt desc（r2 → r0）。
    expect(entryRoads(res.items)).toEqual([ids.r1, ids.r2, ids.r0]);
  });

  it("通常検索（ids なし）は従来どおり updatedAt desc", async () => {
    const res = await searchRoads(q({ q: "雨の日に傘をたたむのが", tag: TAG_A, limit: 50 }));
    expect(entryRoads(res.items)).toEqual([ids.r2, ids.r0]);
  });
});
