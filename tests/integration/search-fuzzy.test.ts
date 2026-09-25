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
