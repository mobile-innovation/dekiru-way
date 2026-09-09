import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// アプリ利用者の認証をモック
vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

// 管理者の認証をモック (実 AdminUser 行を beforeAll で作り、その id を返す)
const adminRef: { id: string } = { id: "" };
vi.mock("@/lib/admin/auth", () => ({
  requireAdminApi: vi.fn(async () => ({ id: adminRef.id, email: "mod@example.com" })),
  getAdminSession: vi.fn(async () => ({ id: adminRef.id, email: "mod@example.com" })),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/admin/password";
import { resetBotGuard } from "@/lib/bot-guard";
import { POST as createAttempt } from "@/app/api/v1/roads/[roadId]/attempts/route";
import { PATCH as patchAttempt } from "@/app/api/v1/attempts/[attemptId]/route";
import { POST as moderate } from "@/app/api/admin/moderation/[attemptId]/route";
import { GET as listExperiences } from "@/app/api/v1/experiences/route";

const MARK = `modflow-${Date.now()}`;
let userId = "";
let roadId = "";
let savedKey: string | undefined;

const asUser = (id: string | null) =>
  vi.mocked(auth).mockResolvedValue((id ? { user: { id } } : null) as never);

beforeAll(async () => {
  // AI キーを外して moderation を決定的に (verdict=unknown → pending) にする
  savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const user = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  userId = user.id;
  const road = await prisma.road.create({
    data: {
      userId,
      difficulty: `${MARK} こまりごと`,
      goal: "できるように",
    },
  });
  roadId = road.id;
  const admin = await prisma.adminUser.create({
    data: { email: `${MARK}@example.com`, passwordHash: hashPassword("test-password") },
  });
  adminRef.id = admin.id;
});

afterAll(async () => {
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  await prisma.$disconnect();
});

beforeEach(() => resetBotGuard());

async function publicMethods(): Promise<string[]> {
  const res = await listExperiences(
    new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(MARK)}&limit=50`),
    { params: Promise.resolve({}) },
  );
  const json = (await res.json()) as { items: { method: string }[] };
  return json.items.map((i) => i.method);
}

describe("公開 → AI不明で保留 → 管理者が許可 の一連", () => {
  it("公開して作成した投稿は AI 不明のため pending になり、公開検索に出ない", async () => {
    asUser(userId);
    const res = await createAttempt(
      new Request(`http://localhost/api/v1/roads/${roadId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: `${MARK} 手すりをつけた`, result: "success", isPublished: true }),
      }),
      { params: Promise.resolve({ roadId }) },
    );
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { id: string; moderationStatus: string; publishState: string };
    expect(dto.moderationStatus).toBe("pending");
    expect(dto.publishState).toBe("reviewing");

    expect(await publicMethods()).not.toContain(`${MARK} 手すりをつけた`);

    // 管理者が許可 → 公開検索に出る
    const mod = await moderate(
      new Request(`http://localhost/api/admin/moderation/${dto.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }),
      { params: Promise.resolve({ attemptId: dto.id }) },
    );
    expect(mod.status).toBe(200);
    expect(await publicMethods()).toContain(`${MARK} 手すりをつけた`);

    // 監査ログが残る
    const audit = await prisma.adminAuditLog.findFirst({
      where: { attemptId: dto.id, action: "approve" },
    });
    expect(audit).toBeTruthy();
  });

  it("管理者が却下すると公開検索から外れる", async () => {
    asUser(userId);
    const created = await createAttempt(
      new Request(`http://localhost/api/v1/roads/${roadId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: `${MARK} だめだった方法`, result: "failed", isPublished: true }),
      }),
      { params: Promise.resolve({ roadId }) },
    );
    const dto = (await created.json()) as { id: string };

    await moderate(
      new Request(`http://localhost/api/admin/moderation/${dto.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reject", note: "個人名が含まれる" }),
      }),
      { params: Promise.resolve({ attemptId: dto.id }) },
    );

    expect(await publicMethods()).not.toContain(`${MARK} だめだった方法`);
    const row = await prisma.attempt.findUnique({ where: { id: dto.id } });
    expect(row?.moderationStatus).toBe("rejected");
    expect(row?.moderationNote).toBe("個人名が含まれる");
  });

  it("公開中の投稿の本文を編集すると再審査され pending に戻る", async () => {
    asUser(userId);
    // approved 状態の attempt を用意
    const attempt = await prisma.attempt.create({
      data: {
        roadId,
        method: `${MARK} 最初は承認済み`,
        result: "success",
        isPublished: true,
        moderationStatus: "approved",
      },
    });
    expect(await publicMethods()).toContain(`${MARK} 最初は承認済み`);

    const res = await patchAttempt(
      new Request(`http://localhost/api/v1/attempts/${attempt.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: `${MARK} あとから書き換えた本文` }),
      }),
      { params: Promise.resolve({ attemptId: attempt.id }) },
    );
    const dto = (await res.json()) as { moderationStatus: string };
    expect(dto.moderationStatus).toBe("pending");
    expect(await publicMethods()).not.toContain(`${MARK} あとから書き換えた本文`);
  });
});
