import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

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

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/admin/password";
import { resetBotGuard } from "@/lib/bot-guard";
import { moderationQueue } from "@/lib/admin/queries";
import { POST as moderate } from "@/app/api/admin/moderation/[attemptId]/route";

/**
 * 経験の「保留」(moderation_held)。
 * - 確認待ちキューの既定表示から外れ、「保留している」一覧でだけ見える。
 * - moderationStatus は動かさない。approve/reject で保留フラグは外れる。
 * - キューの並びは updatedAt の新しい順。
 */

const MARK = `hold-${Date.now()}`;
let userId = "";
let roadId = "";

const asUser = (id: string | null) =>
  vi.mocked(auth).mockResolvedValue((id ? { user: { id } } : null) as never);

const ctx = (attemptId: string) => ({ params: Promise.resolve({ attemptId }) });
const post = (attemptId: string, body: unknown) =>
  moderate(
    new Request(`http://localhost/api/admin/moderation/${attemptId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx(attemptId),
  );

async function pendingAttempt(method: string) {
  return prisma.attempt.create({
    data: { roadId, method, result: "success", isPublished: true, moderationStatus: "pending" },
  });
}
const inQueue = async (opts: Parameters<typeof moderationQueue>[0], method: string) =>
  (await moderationQueue(opts)).items.some((i) => i.method === method);

beforeAll(async () => {
  const user = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  userId = user.id;
  const road = await prisma.road.create({
    data: { userId, difficulty: `${MARK} こまりごと`, goal: "g" },
  });
  roadId = road.id;
  const admin = await prisma.adminUser.create({
    data: { email: `${MARK}@example.com`, passwordHash: hashPassword("pw-123456") },
  });
  adminRef.id = admin.id;
});

afterAll(async () => {
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  resetBotGuard();
  asUser(userId);
});

describe("経験の保留 (hold / unhold)", () => {
  it("保留にすると既定キューから外れ、保留一覧に出る。moderationStatus は pending のまま", async () => {
    const a = await pendingAttempt(`${MARK} 保留する経験`);
    expect(await inQueue({}, `${MARK} 保留する経験`)).toBe(true);

    const res = await post(a.id, { action: "hold" });
    expect(res.status).toBe(200);

    expect(await inQueue({}, `${MARK} 保留する経験`)).toBe(false);
    expect(await inQueue({ held: true }, `${MARK} 保留する経験`)).toBe(true);
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.moderationHeld).toBe(true);
    expect(row.moderationStatus).toBe("pending");
  });

  it("保留を解除すると既定キューに戻る", async () => {
    const a = await pendingAttempt(`${MARK} 解除する経験`);
    await post(a.id, { action: "hold" });
    await post(a.id, { action: "unhold" });

    expect(await inQueue({}, `${MARK} 解除する経験`)).toBe(true);
    expect(await inQueue({ held: true }, `${MARK} 解除する経験`)).toBe(false);
  });

  it("保留中に公開すると approved になり、保留フラグも外れる", async () => {
    const a = await pendingAttempt(`${MARK} 保留から公開`);
    await post(a.id, { action: "hold" });
    const res = await post(a.id, { action: "approve" });
    expect(res.status).toBe(200);

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.moderationStatus).toBe("approved");
    expect(row.moderationHeld).toBe(false);
  });

  it("確認待ちキューは updatedAt の新しい順", async () => {
    const older = await pendingAttempt(`${MARK} 古い方 ${Date.now()}`);
    await new Promise((r) => setTimeout(r, 10));
    const newer = await pendingAttempt(`${MARK} 新しい方 ${Date.now()}`);

    const methods = (await moderationQueue({})).items
      .filter((i) => i.method.startsWith(`${MARK} 古い方`) || i.method.startsWith(`${MARK} 新しい方`))
      .map((i) => i.method);
    expect(methods[0]).toContain("新しい方");
    expect(methods.indexOf(newer.method)).toBeLessThan(methods.indexOf(older.method));
  });
});
