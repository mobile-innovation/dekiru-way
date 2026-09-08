import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signOut: vi.fn(async () => undefined),
  signIn: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { resetBotGuard } from "@/lib/bot-guard";
import { ANON_SUBMITTER_SUB } from "@/lib/quick-submit";
import { GET as getMe, DELETE as deleteMe } from "@/app/api/v1/me/route";
import { GET as listExperiences } from "@/app/api/v1/experiences/route";

const MARK = `acct-${Date.now()}`;

const asUser = (id: string | null) =>
  vi.mocked(auth).mockResolvedValue((id ? { user: { id } } : null) as never);

const emptyCtx = { params: Promise.resolve({}) };

async function makeUserWithData(suffix: string) {
  const user = await prisma.user.create({ data: { googleSub: `${MARK}:${suffix}` } });
  const road = await prisma.road.create({
    data: {
      userId: user.id,
      title: `${MARK}-${suffix}`,
      difficulty: `${MARK} ${suffix} こまりごと`,
      goal: "できるように",
      moderationStatus: "approved",
      roadTags: { create: { tag: { create: { name: `${MARK}-tag-${suffix}` } } } },
    },
    include: { roadTags: true },
  });
  const attempt = await prisma.attempt.create({
    data: {
      roadId: road.id,
      method: `${MARK} ${suffix} 公開した方法`,
      result: "success",
      isPublished: true,
      moderationStatus: "approved",
    },
  });
  return { user, road, attempt };
}

beforeEach(() => {
  resetBotGuard();
  vi.mocked(signOut).mockClear();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.tag.deleteMany({ where: { name: { startsWith: `${MARK}-tag` } } });
  await prisma.$disconnect();
});

describe("DELETE /api/v1/me（アカウント削除）", () => {
  it("未ログインでは削除できない (401)", async () => {
    asUser(null);
    const res = await deleteMe(new Request("http://localhost/api/v1/me", { method: "DELETE" }), emptyCtx);
    expect(res.status).toBe(401);
  });

  it("匿名簡易登録の受け皿ユーザーは削除できない (403)", async () => {
    const anon = await prisma.user.upsert({
      where: { googleSub: ANON_SUBMITTER_SUB },
      update: {},
      create: { googleSub: ANON_SUBMITTER_SUB, displayName: "匿名（SNS簡易登録）" },
    });
    asUser(anon.id);
    const res = await deleteMe(new Request("http://localhost/api/v1/me", { method: "DELETE" }), emptyCtx);
    expect(res.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { id: anon.id } })).not.toBeNull();
  });

  it("本人のデータ一式が消え、他ユーザーには影響しない。セッションも破棄される", async () => {
    const a = await makeUserWithData("a");
    const b = await makeUserWithData("b");

    // A が B の経験にいいね / B が A の経験にいいね / A に通知 / A が B の経験を既読
    await prisma.attemptLike.create({ data: { attemptId: b.attempt.id, userId: a.user.id } });
    await prisma.attemptLike.create({ data: { attemptId: a.attempt.id, userId: b.user.id } });
    await prisma.attemptRead.create({ data: { attemptId: b.attempt.id, userId: a.user.id } });
    await prisma.notification.create({
      data: { userId: a.user.id, type: "attempt_liked", attemptId: a.attempt.id },
    });

    asUser(a.user.id);
    const res = await deleteMe(new Request("http://localhost/api/v1/me", { method: "DELETE" }), emptyCtx);
    expect(res.status).toBe(204);
    expect(signOut).toHaveBeenCalledTimes(1);

    // A 本人と、A に紐づくデータが消えている
    expect(await prisma.user.findUnique({ where: { id: a.user.id } })).toBeNull();
    expect(await prisma.road.count({ where: { userId: a.user.id } })).toBe(0);
    expect(await prisma.attempt.count({ where: { id: a.attempt.id } })).toBe(0);
    expect(await prisma.roadTag.count({ where: { roadId: a.road.id } })).toBe(0);
    // A が付けたいいね・既読、A が受け取った通知、A の経験に付いた他人のいいねも消えている
    expect(await prisma.attemptLike.count({ where: { userId: a.user.id } })).toBe(0);
    expect(await prisma.attemptLike.count({ where: { attemptId: a.attempt.id } })).toBe(0);
    expect(await prisma.attemptRead.count({ where: { userId: a.user.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: a.user.id } })).toBe(0);

    // B 側は無傷
    expect(await prisma.user.findUnique({ where: { id: b.user.id } })).not.toBeNull();
    expect(await prisma.attempt.count({ where: { id: b.attempt.id } })).toBe(1);
    expect(await prisma.attemptLike.count({ where: { userId: b.user.id } })).toBe(0); // B のいいねは A の経験に付いていたので消える
    // タグ自体（共有マスタ）は残す
    expect(await prisma.tag.count({ where: { name: `${MARK}-tag-a` } })).toBe(1);
  });

  it("削除した本人の公開経験は検索結果に残らない", async () => {
    const a = await makeUserWithData("search");
    asUser(a.user.id);

    const before = (await (
      await listExperiences(
        new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(MARK + " search")}&limit=50`),
        emptyCtx,
      )
    ).json()) as { items: { id: string }[] };
    expect(before.items.some((i) => i.id === a.attempt.id)).toBe(true);

    await deleteMe(new Request("http://localhost/api/v1/me", { method: "DELETE" }), emptyCtx);

    asUser(null);
    const after = (await (
      await listExperiences(
        new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(MARK + " search")}&limit=50`),
        emptyCtx,
      )
    ).json()) as { items: { id: string }[] };
    expect(after.items.some((i) => i.id === a.attempt.id)).toBe(false);
  });

  it("GET /api/v1/me は従来どおり本人情報を返す", async () => {
    const a = await makeUserWithData("me");
    asUser(a.user.id);
    const res = await getMe(new Request("http://localhost/api/v1/me"), emptyCtx);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string };
    expect(json.id).toBe(a.user.id);
  });
});
