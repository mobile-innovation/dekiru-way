import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { searchRoads, searchMethods } from "@/lib/queries";
import type { ExperienceQuery } from "@/lib/validation";

/**
 * 検索で自分の投稿は、既読ではなく「自分の投稿」だと分かるようにする指示。
 * `searchRoads`（道カード）/ `searchMethods`（方法カード）に、
 * 投稿者自身が見ている場合は `isMine: true` が付くことを確認する
 * （`isRead` は既読/未読の実際の状態のままで、自分の投稿を既読扱いに書き換えたりはしない）。
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

describe("searchRoads: 自分の道には isMine=true が付く（isRead は書き換えない）", () => {
  it("投稿者本人が見ると isMine=true、他人・未ログインは isMine=false", async () => {
    const own = await searchRoads(q({}), ownerId);
    const ownItem = own.items.find((i) => i.entryId === publicAttemptId);
    expect(ownItem?.isMine).toBe(true);
    // 実際には一度も開いていないので isRead 自体は false のまま
    expect(ownItem?.isRead).toBe(false);

    const other = await searchRoads(q({}), otherId);
    const otherItem = other.items.find((i) => i.entryId === publicAttemptId);
    expect(otherItem?.isMine).toBe(false);
    expect(otherItem?.isRead).toBe(false);

    const anon = await searchRoads(q({}), null);
    expect(anon.items.find((i) => i.entryId === publicAttemptId)?.isMine).toBe(false);
  });

  it("既読レコードは作られない（投稿者は attempt_reads に記録されない）", async () => {
    await searchRoads(q({}), ownerId);
    const count = await prisma.attemptRead.count({
      where: { attemptId: publicAttemptId, userId: ownerId },
    });
    expect(count).toBe(0);
  });
});

describe("searchMethods: 自分の方法には isMine=true が付く（isRead は書き換えない）", () => {
  it("投稿者本人が見ると isMine=true、他人が見ると isMine=false", async () => {
    const own = await searchMethods(q({ kind: "method" }), ownerId);
    const ownItem = own.items.find((i) => i.attemptId === publicAttemptId);
    expect(ownItem?.isMine).toBe(true);
    expect(ownItem?.isRead).toBe(false);

    const other = await searchMethods(q({ kind: "method" }), otherId);
    const otherItem = other.items.find((i) => i.attemptId === publicAttemptId);
    expect(otherItem?.isMine).toBe(false);
    expect(otherItem?.isRead).toBe(false);
  });
});
