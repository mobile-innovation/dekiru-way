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
import { resetBotGuard } from "@/lib/bot-guard";
import { LIKE_NOTIFICATION_TYPE } from "@/lib/likes";
import { POST as likePost, DELETE as likeDelete } from "@/app/api/v1/attempts/[attemptId]/like/route";
import { POST as markRead } from "@/app/api/v1/notifications/read/route";
import { GET as getExperience } from "@/app/api/v1/experiences/[id]/route";

const MARK = `likes-${Date.now()}`;
let ownerId = "";
let likerId = "";
let otherId = "";
let publicAttemptId = "";
let privateAttemptId = "";

const asUser = (id: string | null) =>
  vi.mocked(auth).mockResolvedValue((id ? { user: { id } } : null) as never);

const ctx = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });

function likeReq(attemptId: string) {
  return new Request(`http://localhost/api/v1/attempts/${attemptId}/like`, { method: "POST" });
}
function unlikeReq(attemptId: string) {
  return new Request(`http://localhost/api/v1/attempts/${attemptId}/like`, { method: "DELETE" });
}

beforeAll(async () => {
  const [owner, liker, other] = await Promise.all([
    prisma.user.create({ data: { googleSub: `${MARK}:owner` } }),
    prisma.user.create({ data: { googleSub: `${MARK}:liker` } }),
    prisma.user.create({ data: { googleSub: `${MARK}:other` } }),
  ]);
  ownerId = owner.id;
  likerId = liker.id;
  otherId = other.id;

  const road = await prisma.road.create({
    data: {
      userId: ownerId,
      difficulty: `${MARK} こまりごと`,
      goal: "できるように",
    },
  });
  const pub = await prisma.attempt.create({
    data: {
      roadId: road.id,
      method: `${MARK} 公開した方法`,
      result: "success",
      isPublished: true,
      moderationStatus: "approved",
    },
  });
  const priv = await prisma.attempt.create({
    data: {
      roadId: road.id,
      method: `${MARK} 非公開の方法`,
      result: "failed",
      isPublished: false,
      moderationStatus: "pending",
    },
  });
  publicAttemptId = pub.id;
  privateAttemptId = priv.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  resetBotGuard();
  // 各テストを独立させる: いいね・通知をリセット
  await prisma.attemptLike.deleteMany({ where: { attempt: { method: { startsWith: MARK } } } });
  await prisma.notification.deleteMany({ where: { user: { googleSub: { startsWith: MARK } } } });
});

describe("いいね API", () => {
  it("他人の公開経験にいいねでき、投稿者に通知が 1 件作られる", async () => {
    asUser(likerId);
    const res = await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ liked: true });

    const likes = await prisma.attemptLike.findMany({ where: { attemptId: publicAttemptId } });
    expect(likes).toHaveLength(1);
    expect(likes[0].userId).toBe(likerId);

    const notes = await prisma.notification.findMany({ where: { userId: ownerId } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      type: LIKE_NOTIFICATION_TYPE,
      attemptId: publicAttemptId,
      isRead: false,
    });
    // いいねした本人には通知を作らない
    expect(await prisma.notification.count({ where: { userId: likerId } })).toBe(0);
  });

  it("二重にいいねしても 200 で、行も通知も増えない", async () => {
    asUser(likerId);
    await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    const res = await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(200);
    expect(await prisma.attemptLike.count({ where: { attemptId: publicAttemptId } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ownerId } })).toBe(1);
  });

  it("自分の経験にはいいねできない (403)", async () => {
    asUser(ownerId);
    const res = await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe("自分の経験にはいいねできません");
    expect(await prisma.attemptLike.count({ where: { attemptId: publicAttemptId } })).toBe(0);
  });

  it("未ログインではいいねできない (401)", async () => {
    asUser(null);
    const res = await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(401);
    expect(await prisma.attemptLike.count({ where: { attemptId: publicAttemptId } })).toBe(0);
  });

  it("非公開の経験にはいいねできない (404)", async () => {
    asUser(likerId);
    const res = await likePost(likeReq(privateAttemptId), ctx(privateAttemptId));
    expect(res.status).toBe(404);
  });

  it("存在しない経験へのいいねは 404", async () => {
    asUser(likerId);
    const missing = "00000000-0000-4000-8000-000000000000";
    const res = await likePost(likeReq(missing), ctx(missing));
    expect(res.status).toBe(404);
  });

  it("いいねを取り消せる。通知は消さない", async () => {
    asUser(likerId);
    await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));

    const res = await likeDelete(unlikeReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(204);
    expect(await prisma.attemptLike.count({ where: { attemptId: publicAttemptId } })).toBe(0);
    // 通知は「その時点で評価された出来事」として残す
    expect(await prisma.notification.count({ where: { userId: ownerId } })).toBe(1);
  });

  it("取り消しは自分のいいねだけ。他人のいいねは消えない", async () => {
    asUser(likerId);
    await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    asUser(otherId);
    await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));

    // liker が取り消しても other のいいねは残る
    asUser(likerId);
    await likeDelete(unlikeReq(publicAttemptId), ctx(publicAttemptId));
    const remaining = await prisma.attemptLike.findMany({ where: { attemptId: publicAttemptId } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(otherId);
  });

  it("付いていないいいねの取り消しも 204 (冪等)", async () => {
    asUser(likerId);
    const res = await likeDelete(unlikeReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(204);
  });
});

describe("経験詳細 API のいいね状態", () => {
  async function fetchExp(viewer: string | null) {
    asUser(viewer);
    const res = await getExperience(
      new Request(`http://localhost/api/v1/experiences/${publicAttemptId}`),
      idCtx(publicAttemptId),
    );
    return (await res.json()) as { like: { isMine: boolean; canLike: boolean; likedByMe: boolean } };
  }

  it("いいね済みの他人 → canLike:true / likedByMe:true / isMine:false", async () => {
    asUser(likerId);
    await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    expect((await fetchExp(likerId)).like).toEqual({
      isMine: false,
      canLike: true,
      likedByMe: true,
    });
  });

  it("投稿者本人 → isMine:true / canLike:false", async () => {
    expect((await fetchExp(ownerId)).like).toEqual({
      isMine: true,
      canLike: false,
      likedByMe: false,
    });
  });

  it("未ログイン → すべて false", async () => {
    expect((await fetchExp(null)).like).toEqual({
      isMine: false,
      canLike: false,
      likedByMe: false,
    });
  });

  it("いいね数はレスポンスに含めない", async () => {
    asUser(likerId);
    await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    const res = await getExperience(
      new Request(`http://localhost/api/v1/experiences/${publicAttemptId}`),
      idCtx(publicAttemptId),
    );
    const text = await res.text();
    expect(text).not.toMatch(/likeCount|likesCount|"count"/);
  });
});

describe("通知の既読化", () => {
  it("POST /api/v1/notifications/read で未読が消える", async () => {
    asUser(likerId);
    await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));
    expect(
      await prisma.notification.count({ where: { userId: ownerId, isRead: false } }),
    ).toBe(1);

    asUser(ownerId);
    const res = await markRead(new Request("http://localhost/api/v1/notifications/read", { method: "POST" }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(204);
    expect(
      await prisma.notification.count({ where: { userId: ownerId, isRead: false } }),
    ).toBe(0);
  });

  it("他人の通知は既読化しない", async () => {
    asUser(likerId);
    await likePost(likeReq(publicAttemptId), ctx(publicAttemptId));

    // liker が自分の既読化を呼んでも owner の通知は未読のまま
    asUser(likerId);
    await markRead(new Request("http://localhost/api/v1/notifications/read", { method: "POST" }), {
      params: Promise.resolve({}),
    });
    expect(
      await prisma.notification.count({ where: { userId: ownerId, isRead: false } }),
    ).toBe(1);
  });
});
