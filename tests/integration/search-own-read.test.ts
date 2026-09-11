import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { searchRoads, searchMethods } from "@/lib/queries";
import type { ExperienceQuery } from "@/lib/validation";

/**
 * 検索で自分の投稿は未読ではなく既読扱いにする指示。
 * `searchRoads`（道カード）/ `searchMethods`（方法カード）の isRead に、
 * 「投稿者自身が見ている場合は、実際に開いていなくても true」を確認する。
 */

const MARK = `own-read-${Date.now()}`;
let ownerId = "";
let otherId = "";
let roadId = "";
let publicAttemptId = "";

const q = (over: Partial<ExperienceQuery>): ExperienceQuery => ({
  q: MARK,
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
  const [owner, other] = await Promise.all([
    prisma.user.create({ data: { googleSub: `${MARK}:owner` } }),
    prisma.user.create({ data: { googleSub: `${MARK}:other` } }),
  ]);
  ownerId = owner.id;
  otherId = other.id;

  const road = await prisma.road.create({
    data: { userId: ownerId, difficulty: `${MARK} 自分の投稿`, goal: "できるように" },
  });
  roadId = road.id;
  const attempt = await prisma.attempt.create({
    data: {
      roadId,
      method: `${MARK} 自分の試したこと`,
      result: "success",
      isPublished: true,
      moderationStatus: "approved",
    },
  });
  publicAttemptId = attempt.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("searchRoads: 自分の道は開いていなくても isRead=true", () => {
  it("投稿者本人が見ると既読、他人が見ると未読、未ログインも未読", async () => {
    const own = await searchRoads(q({}), ownerId);
    expect(own.items.find((i) => i.entryId === publicAttemptId)?.isRead).toBe(true);

    const other = await searchRoads(q({}), otherId);
    expect(other.items.find((i) => i.entryId === publicAttemptId)?.isRead).toBe(false);

    const anon = await searchRoads(q({}), null);
    expect(anon.items.find((i) => i.entryId === publicAttemptId)?.isRead).toBe(false);
  });

  it("実際に既読レコードは作られない（投稿者は attempt_reads に記録されない）", async () => {
    await searchRoads(q({}), ownerId);
    const count = await prisma.attemptRead.count({
      where: { attemptId: publicAttemptId, userId: ownerId },
    });
    expect(count).toBe(0);
  });
});

describe("searchMethods: 自分の方法は開いていなくても isRead=true", () => {
  it("投稿者本人が見ると既読、他人が見ると未読", async () => {
    const own = await searchMethods(q({ kind: "method" }), ownerId);
    expect(own.items.find((i) => i.attemptId === publicAttemptId)?.isRead).toBe(true);

    const other = await searchMethods(q({ kind: "method" }), otherId);
    expect(other.items.find((i) => i.attemptId === publicAttemptId)?.isRead).toBe(false);
  });
});
