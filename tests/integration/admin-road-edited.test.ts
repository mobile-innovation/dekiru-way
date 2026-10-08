import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

/**
 * 管理画面「承認後に道が編集された経験」(2026-10-08 H-2 の見直し・案1)。
 * 道は AI 審査しないので、運営が見つけて AI 再チェックできるようにする。DB 変更なしの近似
 * (`roads.updated_at` と経験の最終確認時刻の比較、承認に伴う道の更新は猶予 5 秒で除外) を確かめる。
 * 実 DB (ローカル) を使う。AI は `@/lib/ai/client#callJson` をモックし、外部には出ない。
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

const adminRef: { id: string } = { id: "" };
vi.mock("@/lib/admin/auth", () => ({
  requireAdminApi: vi.fn(async () => ({ id: adminRef.id, email: "mod@example.com" })),
  getAdminSession: vi.fn(async () => ({ id: adminRef.id, email: "mod@example.com" })),
}));

vi.mock("@/lib/ai/client", () => ({
  callJson: vi.fn(async () => ({ verdict: "ok", reason: "テスト用の判定", categories: [] })),
  DISCLAIMER: "テスト用の注意書き",
}));

vi.mock("@/lib/admin-notify", () => ({
  notifyAdminOfNewPending: vi.fn(async () => undefined),
}));

import { ModerationStatus } from "@prisma/client";
import { auth } from "@/auth";
import { callJson } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/admin/password";
import {
  dashboardStats,
  postDetail,
  postList,
  roadEditedAfterReview,
  ROAD_EDITED_FILTER,
} from "@/lib/admin/queries";
import { PATCH as patchRoad } from "@/app/api/v1/roads/[roadId]/route";
import { POST as recheck } from "@/app/api/admin/posts/[attemptId]/recheck/route";

const MARK = `roadedited-${Date.now()}`;
let seq = 0;
let savedKey: string | undefined;

const BASE = new Date("2026-06-01T00:00:00Z");
const at = (sec: number) => new Date(BASE.getTime() + sec * 1000);

type AttemptSpec = {
  isPublished?: boolean;
  moderationStatus?: ModerationStatus;
  aiCheckedAt?: Date | null;
  moderatedAt?: Date | null;
  updatedAt?: Date;
};

/** 道 (updated_at を明示) と経験を作る。経験は既定で公開中・承認済み・AI 確認 = BASE。 */
async function makeRoad(
  roadUpdatedAt: Date,
  attempts: AttemptSpec[],
  opts: { seed?: boolean } = {},
) {
  const n = ++seq;
  const user = await prisma.user.create({ data: { googleSub: `${MARK}:u${n}` } });
  const road = await prisma.road.create({
    data: {
      userId: user.id,
      difficulty: `${MARK} 困っていること ${n}`,
      goal: "できるように",
      isSeedData: opts.seed ?? false,
      createdAt: at(-3600),
      updatedAt: roadUpdatedAt,
    },
  });
  const ids: string[] = [];
  for (const [i, a] of attempts.entries()) {
    const created = await prisma.attempt.create({
      data: {
        roadId: road.id,
        method: `${MARK} 方法 ${n}-${i}`,
        result: "success",
        isPublished: a.isPublished ?? true,
        moderationStatus: a.moderationStatus ?? ModerationStatus.approved,
        aiCheckedAt: a.aiCheckedAt === undefined ? at(0) : a.aiCheckedAt,
        moderatedAt: a.moderatedAt ?? null,
        createdAt: at(-3600),
        updatedAt: a.updatedAt ?? at(0),
      },
    });
    ids.push(created.id);
  }
  // 経験の作成で道の updated_at が動かないよう、最後に明示値へ戻す。
  await prisma.road.update({ where: { id: road.id }, data: { updatedAt: roadUpdatedAt } });
  return { user, road, ids };
}

const flaggedIds = async () => new Set((await roadEditedAfterReview()).map((r) => r.attemptId));

beforeAll(async () => {
  savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-dummy-not-a-real-key";
  delete process.env.AI_MODERATION_ENABLED;
  const admin = await prisma.adminUser.create({
    data: { email: `${MARK}@example.com`, passwordHash: hashPassword("test-password") },
  });
  adminRef.id = admin.id;
});

afterAll(async () => {
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  else delete process.env.ANTHROPIC_API_KEY;
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("roadEditedAfterReview: 承認後に道が編集された経験", () => {
  it("承認 (AI 確認) より後に道が更新された公開中・承認済みの経験を出す", async () => {
    const { ids } = await makeRoad(at(60), [{}]);
    expect(await flaggedIds()).toContain(ids[0]);
  });

  it("承認から 5 秒以内の道の更新 (承認に伴う bump) は編集とみなさない", async () => {
    const { ids } = await makeRoad(at(3), [{}]);
    expect(await flaggedIds()).not.toContain(ids[0]);
  });

  it("同じ道の別の経験の承認に伴う更新は、古い経験についても編集とみなさない", async () => {
    // A は BASE に確認、B は +100 秒に承認 → 道の updated_at = +101 秒 (B の bump)
    const { ids } = await makeRoad(at(101), [{}, { aiCheckedAt: at(100), updatedAt: at(100) }]);
    const flagged = await flaggedIds();
    expect(flagged).not.toContain(ids[0]);
    expect(flagged).not.toContain(ids[1]);
  });

  it("運営判断 (moderatedAt) が道の更新より新しければ出さない", async () => {
    const { ids } = await makeRoad(at(60), [{ moderatedAt: at(120), updatedAt: at(120) }]);
    expect(await flaggedIds()).not.toContain(ids[0]);
  });

  it("AI 無効時の承認 (aiCheckedAt / moderatedAt なし) は経験の updated_at を確認時刻として使う", async () => {
    const edited = await makeRoad(at(60), [{ aiCheckedAt: null, updatedAt: at(0) }]);
    const notEdited = await makeRoad(at(2), [{ aiCheckedAt: null, updatedAt: at(0) }]);
    const flagged = await flaggedIds();
    expect(flagged).toContain(edited.ids[0]);
    expect(flagged).not.toContain(notEdited.ids[0]);
  });

  it("保留中・却下済み・非公開の経験は出さない", async () => {
    const { ids } = await makeRoad(at(60), [
      { moderationStatus: ModerationStatus.pending },
      { moderationStatus: ModerationStatus.rejected },
      { isPublished: false },
    ]);
    const flagged = await flaggedIds();
    for (const id of ids) expect(flagged).not.toContain(id);
  });

  it("仮データの道は対象外", async () => {
    const { ids } = await makeRoad(at(60), [{}], { seed: true });
    expect(await flaggedIds()).not.toContain(ids[0]);
  });

  it("実際の道の PATCH (AI 審査なし) の後に一覧へ出て、AI 再チェックで外れる", async () => {
    const { user, road, ids } = await makeRoad(at(0), [{}]);
    expect(await flaggedIds()).not.toContain(ids[0]);

    vi.mocked(auth).mockResolvedValue({ user: { id: user.id } } as never);
    vi.mocked(callJson).mockClear();
    const res = await patchRoad(
      new Request("http://localhost", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ progress: "承認後に書き換えた進捗" }),
      }),
      { params: Promise.resolve({ roadId: road.id }) },
    );
    expect(res.status).toBe(200);
    expect(callJson).not.toHaveBeenCalled(); // 道の編集では AI を呼ばない
    expect(await flaggedIds()).toContain(ids[0]);

    // 一覧の絞り込み・詳細・ダッシュボード件数にも反映される
    const list = await postList({ status: ROAD_EDITED_FILTER });
    expect(list.items.map((i) => i.id)).toContain(ids[0]);
    const detail = await postDetail(ids[0]);
    expect(detail?.roadEdited?.attemptId).toBe(ids[0]);
    const stats = await dashboardStats();
    expect(stats.roadEditedAfterApproval).toBe((await roadEditedAfterReview()).length);

    // 運営が AI 再チェック → 最終確認時刻が進んで一覧から外れる (状態は変えない)
    const rc = await recheck(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ attemptId: ids[0] }),
    });
    expect(rc.status).toBe(200);
    expect(await flaggedIds()).not.toContain(ids[0]);
    expect((await postDetail(ids[0]))?.roadEdited).toBeNull();
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: ids[0] } });
    expect(after.moderationStatus).toBe(ModerationStatus.approved);
  });

  it("「承認後に道が編集された」以外の一覧の絞り込みは従来どおり", async () => {
    const { ids } = await makeRoad(at(60), [{}]);
    const approved = await postList({ status: "approved", q: MARK });
    expect(approved.items.map((i) => i.id)).toContain(ids[0]);
    const edited = await postList({ status: ROAD_EDITED_FILTER, q: MARK });
    expect(edited.items.every((i) => i.moderationStatus === ModerationStatus.approved)).toBe(true);
  });
});
