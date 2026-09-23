import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

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
import { notifyAdminOfNewPending } from "@/lib/admin-notify";
import { createQuickSubmission } from "@/lib/quick-submit";

const MARK = `notify-${Date.now()}`;
let userId = "";
let roadId = "";
let savedAiKey: string | undefined;

const asUser = (id: string | null) =>
  vi.mocked(auth).mockResolvedValue((id ? { user: { id } } : null) as never);

function setMailEnv() {
  process.env.MAIL_PROVIDER_API_KEY = "test-key";
  process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.com";
  process.env.MAIL_FROM_ADDRESS = "noreply@example.com";
}
function clearMailEnv() {
  delete process.env.MAIL_PROVIDER_API_KEY;
  delete process.env.ADMIN_NOTIFICATION_EMAIL;
  delete process.env.MAIL_FROM_ADDRESS;
}

beforeAll(async () => {
  // AI キーを外して moderation を決定的に (verdict=unknown → pending) にする
  savedAiKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const user = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  userId = user.id;
  const road = await prisma.road.create({
    data: { userId, difficulty: `${MARK} こまりごと`, goal: "できるように" },
  });
  roadId = road.id;
  const admin = await prisma.adminUser.create({
    data: { email: `${MARK}@example.com`, passwordHash: hashPassword("test-password") },
  });
  adminRef.id = admin.id;
});

afterAll(async () => {
  // Road を先に削除する（Road → Attempt は Cascade）。beforeAll で作った road（difficulty に
  // MARK を含む）に加え、「SNSからの簡易登録」テストが作る road は匿名の共有ユーザー
  // (quick-submit.ts の ANON_SUBMITTER_SUB) に紐づき、そのユーザーは削除対象外なので
  // user 経由のカスケード削除では拾えない。difficulty に MARK を含む road を直接消すことで
  // どちらも確実に片付ける（「経験を探す」改善指示書 v1 §23/§24 で発覚した notify-... 経験の
  // 残留原因）。
  await prisma.road.deleteMany({ where: { difficulty: { contains: MARK } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  if (savedAiKey !== undefined) process.env.ANTHROPIC_API_KEY = savedAiKey;
  await prisma.$disconnect();
});

beforeEach(() => {
  resetBotGuard();
  clearMailEnv();
});
afterEach(() => {
  clearMailEnv();
  vi.unstubAllGlobals();
});

describe("審査待ちになったときの管理者通知", () => {
  it("公開して作成 → AI不明で pending になり、管理者へ通知メールが送られる", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

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
    const dto = (await res.json()) as { id: string; moderationStatus: string };
    expect(dto.moderationStatus).toBe("pending");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body);
    expect(body.subject).toBe("【できる道】新しい登録があります");
    expect(body.text).not.toContain(`${MARK} 手すりをつけた`); // 登録内容そのものは本文に載せない
    expect(body.text).toContain("審査待ち");

    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.pendingNotifiedAt).not.toBeNull();
  });

  it("同じ投稿に対して通知は一度だけ (リトライ等で再度呼んでも二重送信しない)", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const attempt = await prisma.attempt.create({
      data: {
        roadId,
        method: `${MARK} 二重送信テスト`,
        result: "success",
        isPublished: true,
        moderationStatus: "pending",
      },
    });

    await notifyAdminOfNewPending(attempt.id, attempt.createdAt);
    await notifyAdminOfNewPending(attempt.id, attempt.createdAt);
    await notifyAdminOfNewPending(attempt.id, attempt.createdAt);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("承認されて pending を抜けると通知フラグがリセットされ、再び pending になれば再通知される", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    asUser(userId);
    const created = await createAttempt(
      new Request(`http://localhost/api/v1/roads/${roadId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: `${MARK} 再通知テスト`, result: "success", isPublished: true }),
      }),
      { params: Promise.resolve({ roadId }) },
    );
    const dto = (await created.json()) as { id: string };
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await moderate(
      new Request(`http://localhost/api/admin/moderation/${dto.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }),
      { params: Promise.resolve({ attemptId: dto.id }) },
    );
    const approved = await prisma.attempt.findUniqueOrThrow({ where: { id: dto.id } });
    expect(approved.pendingNotifiedAt).toBeNull();

    // 本文を書き換えて再審査へ (AI不明 → pending)
    await patchAttempt(
      new Request(`http://localhost/api/v1/attempts/${dto.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: `${MARK} 再通知テスト・書き換え後` }),
      }),
      { params: Promise.resolve({ attemptId: dto.id }) },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("SNSからの簡易登録 (/try) は AI 判定に関係なく必ず通知される", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await createQuickSubmission({
      difficulty: `${MARK} 簡易登録の困りごと`,
      method: `${MARK} 簡易登録で試したこと`,
      result: "success",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const attempt = await prisma.attempt.findUniqueOrThrow({ where: { id: result.attemptId } });
    expect(attempt.moderationStatus).toBe("pending");
    expect(attempt.pendingNotifiedAt).not.toBeNull();
  });

  it("メール送信サービスがエラーでも登録データは失われず、失敗として記録されるだけ", async () => {
    setMailEnv();
    const fetchMock = vi.fn().mockRejectedValue(new Error("resend down"));
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    asUser(userId);
    const res = await createAttempt(
      new Request(`http://localhost/api/v1/roads/${roadId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: `${MARK} メール失敗テスト`, result: "success", isPublished: true }),
      }),
      { params: Promise.resolve({ roadId }) },
    );

    // 登録自体は成功する (メール失敗でロールバックしない)
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { id: string; moderationStatus: string };
    expect(dto.moderationStatus).toBe("pending");
    const row = await prisma.attempt.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row).not.toBeNull();

    const logged = logSpy.mock.calls
      .map((args) => {
        try {
          return JSON.parse(args[0] as string);
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.tag === "admin-notify" && entry.registration_id === dto.id);
    expect(logged?.status).toBe("failed");
    expect(logged?.error_message).toContain("resend down");

    logSpy.mockRestore();
  });

  it("メール設定 (env) が無いときは送信せず、ログに記録するだけで登録は成功する", async () => {
    // clearMailEnv は beforeEach 済み
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    asUser(userId);
    const res = await createAttempt(
      new Request(`http://localhost/api/v1/roads/${roadId}/attempts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: `${MARK} 未設定テスト`, result: "success", isPublished: true }),
      }),
      { params: Promise.resolve({ roadId }) },
    );

    expect(res.status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();

    const dto = (await res.json()) as { id: string };
    const logged = logSpy.mock.calls
      .map((args) => {
        try {
          return JSON.parse(args[0] as string);
        } catch {
          return null;
        }
      })
      .find((entry) => entry?.tag === "admin-notify" && entry.registration_id === dto.id);
    expect(logged?.status).toBe("skipped");

    logSpy.mockRestore();
  });
});
