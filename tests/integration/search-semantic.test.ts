import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { loadPublicCorpus, publicCorpusSignature } from "@/lib/search-semantic";

/**
 * 意味検索の対象データ（モデルは使わない）。
 *   - 公開検索と同じ基準（公開・承認済みの試したこと / それを持つ道）だけが対象
 *   - 仮データ（isSeedData）も公開検索と同じく含める
 *   - 文章は Stage 1 の組み立て関数の形（ラベル：値）
 *   - 公開状態が変わると signature が変わる（索引の作り直しの合図）
 */

const MARK = `semcorpus-${Date.now()}`;
const ids = { user: "", road: "", seedRoad: "", hiddenRoad: "", pub: "", unpub: "", pending: "" };

beforeAll(async () => {
  const user = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  ids.user = user.id;
  const road = await prisma.road.create({
    data: {
      userId: user.id,
      difficulty: `${MARK} ボタンがとめにくい`,
      situation: "朝の着替え",
      roadTags: { create: { tag: { connectOrCreate: { where: { name: `${MARK}-tag` }, create: { name: `${MARK}-tag` } } } } },
    },
  });
  ids.road = road.id;
  const pub = await prisma.attempt.create({
    data: { roadId: road.id, method: `${MARK} ボタンエイドを使った`, result: "success", isPublished: true, moderationStatus: "approved" },
  });
  const unpub = await prisma.attempt.create({
    data: { roadId: road.id, method: `${MARK} 非公開の方法`, result: "ongoing" },
  });
  const pending = await prisma.attempt.create({
    data: { roadId: road.id, method: `${MARK} 審査待ちの方法`, result: "ongoing", isPublished: true, moderationStatus: "pending" },
  });
  Object.assign(ids, { pub: pub.id, unpub: unpub.id, pending: pending.id });

  const seed = await prisma.road.create({
    data: { userId: user.id, difficulty: `${MARK} 仮データの道`, isSeedData: true, dataOrigin: "ai_seed" },
  });
  ids.seedRoad = seed.id;
  await prisma.attempt.create({
    data: { roadId: seed.id, method: `${MARK} 仮データの方法`, result: "partial", isPublished: true, moderationStatus: "approved" },
  });

  const hidden = await prisma.road.create({ data: { userId: user.id, difficulty: `${MARK} 公開経験の無い道` } });
  ids.hiddenRoad = hidden.id;
  await prisma.attempt.create({ data: { roadId: hidden.id, method: `${MARK} 非公開`, result: "ongoing" } });
});

afterAll(async () => {
  await prisma.road.deleteMany({ where: { id: { in: [ids.road, ids.seedRoad, ids.hiddenRoad] } } });
  await prisma.tag.deleteMany({ where: { name: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { id: ids.user } });
  await prisma.$disconnect();
});

describe("loadPublicCorpus", () => {
  it("公開・承認済みだけが対象。仮データも含み、文章は「ラベル：値」形式", async () => {
    const c = await loadPublicCorpus();
    const road = c.roads.find((r) => r.id === ids.road);
    expect(road?.text).toBe(
      `できなくなったこと：${MARK} ボタンがとめにくい\n困っている場面：朝の着替え\nタグ：${MARK}-tag`,
    );
    expect(c.roads.map((r) => r.id)).toContain(ids.seedRoad);
    expect(c.roads.map((r) => r.id)).not.toContain(ids.hiddenRoad);

    const attemptIds = c.attempts.map((a) => a.id);
    expect(attemptIds).toContain(ids.pub);
    expect(attemptIds).not.toContain(ids.unpub);
    expect(attemptIds).not.toContain(ids.pending);
    expect(c.attempts.find((a) => a.id === ids.pub)?.text).toBe(`試したこと：${MARK} ボタンエイドを使った`);
  });
});

describe("publicCorpusSignature", () => {
  it("公開状態が変わると値が変わり、変わらなければ同じ", async () => {
    const s1 = await publicCorpusSignature();
    expect(await publicCorpusSignature()).toBe(s1);
    await prisma.attempt.update({ where: { id: ids.pending }, data: { moderationStatus: "approved" } });
    const s2 = await publicCorpusSignature();
    expect(s2).not.toBe(s1);
    await prisma.attempt.update({ where: { id: ids.pending }, data: { moderationStatus: "pending" } });
  });
});
