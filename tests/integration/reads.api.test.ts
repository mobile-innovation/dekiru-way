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
import { POST as readPost } from "@/app/api/v1/attempts/[attemptId]/read/route";
import { GET as getExperience } from "@/app/api/v1/experiences/[id]/route";
import { GET as listExperiences } from "@/app/api/v1/experiences/route";

const MARK = `reads-${Date.now()}`;
let ownerId = "";
let readerId = "";
let publicAttemptId = "";
let privateAttemptId = "";

const asUser = (id: string | null) =>
  vi.mocked(auth).mockResolvedValue((id ? { user: { id } } : null) as never);

const ctx = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });

function readReq(attemptId: string) {
  return new Request(`http://localhost/api/v1/attempts/${attemptId}/read`, { method: "POST" });
}

beforeAll(async () => {
  const [owner, reader] = await Promise.all([
    prisma.user.create({ data: { googleSub: `${MARK}:owner` } }),
    prisma.user.create({ data: { googleSub: `${MARK}:reader` } }),
  ]);
  ownerId = owner.id;
  readerId = reader.id;

  const road = await prisma.road.create({
    data: {
      userId: ownerId,
      title: MARK,
      difficulty: `${MARK} こまりごと`,
      goal: "できるように",
      moderationStatus: "approved",
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
  await prisma.attemptRead.deleteMany({ where: { user: { googleSub: { startsWith: MARK } } } });
});

describe("既読 API", () => {
  it("ログインユーザーは公開経験を既読にできる", async () => {
    asUser(readerId);
    const res = await readPost(readReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ read: true });

    const rows = await prisma.attemptRead.findMany({ where: { attemptId: publicAttemptId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(readerId);
  });

  it("同じ経験を複数回開いても既読レコードは重複しない", async () => {
    asUser(readerId);
    await readPost(readReq(publicAttemptId), ctx(publicAttemptId));
    await readPost(readReq(publicAttemptId), ctx(publicAttemptId));
    const res = await readPost(readReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(200);
    expect(await prisma.attemptRead.count({ where: { attemptId: publicAttemptId } })).toBe(1);
  });

  it("未ログインでは既読登録できない (401)", async () => {
    asUser(null);
    const res = await readPost(readReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(401);
    expect(await prisma.attemptRead.count({ where: { attemptId: publicAttemptId } })).toBe(0);
  });

  it("非公開の経験は既読登録できない (404)", async () => {
    asUser(readerId);
    const res = await readPost(readReq(privateAttemptId), ctx(privateAttemptId));
    expect(res.status).toBe(404);
    expect(await prisma.attemptRead.count({ where: { attemptId: privateAttemptId } })).toBe(0);
  });

  it("存在しない経験は 404", async () => {
    asUser(readerId);
    const missing = "00000000-0000-4000-8000-000000000000";
    const res = await readPost(readReq(missing), ctx(missing));
    expect(res.status).toBe(404);
  });

  it("自分の経験は既読登録しない（レコードを作らない）", async () => {
    asUser(ownerId);
    const res = await readPost(readReq(publicAttemptId), ctx(publicAttemptId));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ read: false });
    expect(await prisma.attemptRead.count({ where: { attemptId: publicAttemptId } })).toBe(0);
  });

  it("user_id はセッションから取る（ボディの user_id は無視）", async () => {
    asUser(readerId);
    const res = await readPost(
      new Request(`http://localhost/api/v1/attempts/${publicAttemptId}/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: ownerId, user_id: ownerId }),
      }),
      ctx(publicAttemptId),
    );
    expect(res.status).toBe(200);
    const rows = await prisma.attemptRead.findMany({ where: { attemptId: publicAttemptId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(readerId); // owner ではなく reader
  });
});

describe("検索・詳細 API が閲覧者視点の is_read を返す", () => {
  async function listIsRead(viewer: string | null): Promise<boolean | undefined> {
    asUser(viewer);
    const res = await listExperiences(
      new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(MARK)}&limit=50`),
      { params: Promise.resolve({}) },
    );
    const json = (await res.json()) as { items: { id: string; isRead: boolean }[] };
    return json.items.find((i) => i.id === publicAttemptId)?.isRead;
  }

  it("既読にする前は false、開いた後は true（ログインユーザー視点）", async () => {
    expect(await listIsRead(readerId)).toBe(false);

    asUser(readerId);
    await readPost(readReq(publicAttemptId), ctx(publicAttemptId));

    expect(await listIsRead(readerId)).toBe(true);
    // 別ユーザーから見ればまだ未読
    expect(await listIsRead(ownerId)).toBe(false);
    // 未ログインは false
    expect(await listIsRead(null)).toBe(false);
  });

  it("経験詳細 API にも isRead が入る", async () => {
    asUser(readerId);
    await readPost(readReq(publicAttemptId), ctx(publicAttemptId));
    const res = await getExperience(
      new Request(`http://localhost/api/v1/experiences/${publicAttemptId}`),
      { params: Promise.resolve({ id: publicAttemptId }) },
    );
    const json = (await res.json()) as { isRead: boolean };
    expect(json.isRead).toBe(true);
  });
});
