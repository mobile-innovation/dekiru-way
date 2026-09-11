import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { GET as listMyReads } from "@/app/api/v1/me/reads/route";
import { POST as mergeReads } from "@/app/api/v1/me/reads/merge/route";
import { readAttemptIdSet } from "@/lib/reads";

/**
 * 既読引き継ぎ (既読引き継ぎ指示書)。
 *   GET  /api/v1/me/reads       — ログアウト時にブラウザへ書き出すための一覧
 *   POST /api/v1/me/reads/merge — 再ログイン時にブラウザ側の既読をアカウントへ統合
 */

const MARK = `reads-carryover-${Date.now()}`;
let ownerId = "";
let readerId = "";
let otherId = "";
let publicAttemptId1 = "";
let publicAttemptId2 = "";
let ownAttemptId = "";

const asUser = (id: string | null) =>
  vi.mocked(auth).mockResolvedValue((id ? { user: { id } } : null) as never);

const emptyCtx = { params: Promise.resolve({}) };

function mergeReq(body: unknown) {
  return new Request("http://localhost/api/v1/me/reads/merge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const [owner, reader, other] = await Promise.all([
    prisma.user.create({ data: { googleSub: `${MARK}:owner` } }),
    prisma.user.create({ data: { googleSub: `${MARK}:reader` } }),
    prisma.user.create({ data: { googleSub: `${MARK}:other` } }),
  ]);
  ownerId = owner.id;
  readerId = reader.id;
  otherId = other.id;

  const road = await prisma.road.create({
    data: {
      userId: ownerId,
      difficulty: `${MARK} で困っている`,
      goal: "できるように",
      attempts: {
        create: [
          { method: `${MARK} 方法1`, result: "success", isPublished: true, moderationStatus: "approved" },
          { method: `${MARK} 方法2`, result: "partial", isPublished: true, moderationStatus: "approved" },
        ],
      },
    },
    include: { attempts: true },
  });
  publicAttemptId1 = road.attempts[0].id;
  publicAttemptId2 = road.attempts[1].id;

  // reader 自身が所有する道の Attempt（既読統合の対象外になることを確認するため）
  const ownRoad = await prisma.road.create({
    data: {
      userId: readerId,
      difficulty: `${MARK} 自分の道`,
      attempts: { create: [{ method: `${MARK} 自分の方法`, result: "ongoing", isPublished: true, moderationStatus: "approved" }] },
    },
    include: { attempts: true },
  });
  ownAttemptId = ownRoad.attempts[0].id;

  // reader は既に 1 件だけ DB 側で既読
  await prisma.attemptRead.create({ data: { userId: readerId, attemptId: publicAttemptId1 } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.mocked(auth).mockReset();
});

describe("GET /api/v1/me/reads", () => {
  it("未ログインは 401", async () => {
    asUser(null);
    const res = await listMyReads(new Request("http://localhost/api/v1/me/reads"), emptyCtx);
    expect(res.status).toBe(401);
  });

  it("本人の既読 id だけを返す（他人の既読は含まれない）", async () => {
    asUser(readerId);
    const res = await listMyReads(new Request("http://localhost/api/v1/me/reads"), emptyCtx);
    expect(res.status).toBe(200);
    const { attemptIds } = (await res.json()) as { attemptIds: string[] };
    expect(attemptIds).toContain(publicAttemptId1);
    expect(attemptIds).not.toContain(publicAttemptId2); // reader はまだ読んでいない

    // 他ユーザー（other）は何も既読にしていない
    asUser(otherId);
    const res2 = await listMyReads(new Request("http://localhost/api/v1/me/reads"), emptyCtx);
    const { attemptIds: otherIds } = (await res2.json()) as { attemptIds: string[] };
    expect(otherIds).toEqual([]);
  });
});

describe("POST /api/v1/me/reads/merge", () => {
  it("未ログインは 401", async () => {
    asUser(null);
    const res = await mergeReads(mergeReq({ attemptIds: [publicAttemptId2] }), emptyCtx);
    expect(res.status).toBe(401);
  });

  it("attemptIds が無い・空配列・uuid でない・500件超は 400", async () => {
    asUser(readerId);
    expect((await mergeReads(mergeReq({}), emptyCtx)).status).toBe(400);
    expect((await mergeReads(mergeReq({ attemptIds: [] }), emptyCtx)).status).toBe(400);
    expect((await mergeReads(mergeReq({ attemptIds: ["not-a-uuid"] }), emptyCtx)).status).toBe(400);
    const tooMany = Array.from({ length: 501 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    expect((await mergeReads(mergeReq({ attemptIds: tooMany }), emptyCtx)).status).toBe(400);
  });

  it("存在しない id は無視し、FK 違反にならない", async () => {
    asUser(readerId);
    const fake = "00000000-0000-0000-0000-000000000000";
    const res = await mergeReads(mergeReq({ attemptIds: [fake] }), emptyCtx);
    expect(res.status).toBe(200);
    const { merged } = (await res.json()) as { merged: number };
    expect(merged).toBe(0);
  });

  it("自分の Attempt は統合しない（既読管理の対象外）", async () => {
    asUser(readerId);
    const res = await mergeReads(mergeReq({ attemptIds: [ownAttemptId] }), emptyCtx);
    expect(res.status).toBe(200);
    const { merged } = (await res.json()) as { merged: number };
    expect(merged).toBe(0);
    const set = await readAttemptIdSet(readerId, [ownAttemptId]);
    expect(set.has(ownAttemptId)).toBe(false);
  });

  it("新しい id を統合し、既存の既読と重複させない（集合として統合）", async () => {
    asUser(readerId);
    // publicAttemptId1 は既に既読、publicAttemptId2 が新規
    const res = await mergeReads(
      mergeReq({ attemptIds: [publicAttemptId1, publicAttemptId2] }),
      emptyCtx,
    );
    expect(res.status).toBe(200);
    const { merged } = (await res.json()) as { merged: number };
    expect(merged).toBe(1); // 新規は 1 件だけ

    const set = await readAttemptIdSet(readerId, [publicAttemptId1, publicAttemptId2]);
    expect(set.has(publicAttemptId1)).toBe(true);
    expect(set.has(publicAttemptId2)).toBe(true);

    // 同じ id でもう一度統合しても増えない（重複登録しない）
    const res2 = await mergeReads(
      mergeReq({ attemptIds: [publicAttemptId1, publicAttemptId2] }),
      emptyCtx,
    );
    const { merged: merged2 } = (await res2.json()) as { merged: number };
    expect(merged2).toBe(0);
  });
});
