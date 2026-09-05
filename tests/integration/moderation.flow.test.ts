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
import { POST as createRoad } from "@/app/api/v1/roads/route";
import { PATCH as patchRoad } from "@/app/api/v1/roads/[roadId]/route";
import { POST as moderate } from "@/app/api/admin/moderation/[attemptId]/route";
import { POST as moderateRoad } from "@/app/api/admin/roads/[roadId]/moderate/route";
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
  // 投稿チェックの検証用の道は承認済みにしておく (道チェックは別 describe で検証)
  const road = await prisma.road.create({
    data: {
      userId,
      title: MARK,
      difficulty: `${MARK} こまりごと`,
      goal: "できるように",
      moderationStatus: "approved",
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

describe("道の登録も公開チェックされる", () => {
  it("登録した道は AI 不明で pending。その道の承認済み投稿も公開検索に出ない", async () => {
    asUser(userId);
    const word = `${MARK}ミチトウロク`;
    const res = await createRoad(
      new Request("http://localhost/api/v1/roads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ difficulty: `${word} で困っている`, goal: "できるように" }),
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    const road = (await res.json()) as { id: string; moderationStatus: string };
    expect(road.moderationStatus).toBe("pending");

    // その道に承認済みの公開投稿を直接用意しても、道が pending なので公開面に出ない
    await prisma.attempt.create({
      data: {
        roadId: road.id,
        method: `${word} を試した`,
        result: "success",
        isPublished: true,
        moderationStatus: "approved",
      },
    });
    const hidden = await listExperiences(
      new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(word)}&limit=50`),
      { params: Promise.resolve({}) },
    );
    expect(((await hidden.json()) as { items: unknown[] }).items).toHaveLength(0);

    // 管理者が道を許可 → 経験が公開面に出る
    const mod = await moderateRoad(
      new Request(`http://localhost/api/admin/roads/${road.id}/moderate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }),
      { params: Promise.resolve({ roadId: road.id }) },
    );
    expect(mod.status).toBe(200);
    const shown = await listExperiences(
      new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(word)}&limit=50`),
      { params: Promise.resolve({}) },
    );
    expect(((await shown.json()) as { items: { method: string }[] }).items.map((i) => i.method)).toContain(
      `${word} を試した`,
    );

    const audit = await prisma.adminAuditLog.findFirst({
      where: { roadId: road.id, action: "approve" },
    });
    expect(audit).toBeTruthy();
  });

  it("承認済みの道の本文を編集すると再審査され pending に戻る", async () => {
    asUser(userId);
    const word = `${MARK}ミチヘンシュウ`;
    const road = await prisma.road.create({
      data: {
        userId,
        difficulty: `${word} で困っている`,
        goal: "g",
        moderationStatus: "approved",
      },
    });

    const res = await patchRoad(
      new Request(`http://localhost/api/v1/roads/${road.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ situation: `${word} あとから追記した場面` }),
      }),
      { params: Promise.resolve({ roadId: road.id }) },
    );
    const dto = (await res.json()) as { moderationStatus: string };
    expect(dto.moderationStatus).toBe("pending");
  });

  it("承認済みの道で本文はそのままタグだけ変えても再審査され pending に戻る", async () => {
    asUser(userId);
    const word = `${MARK}ミチタグ`;
    const road = await prisma.road.create({
      data: {
        userId,
        difficulty: `${word} で困っている`,
        goal: "g",
        moderationStatus: "approved",
      },
    });

    const res = await patchRoad(
      new Request(`http://localhost/api/v1/roads/${road.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: [`${word}タグ`] }),
      }),
      { params: Promise.resolve({ roadId: road.id }) },
    );
    const dto = (await res.json()) as { moderationStatus: string };
    expect(dto.moderationStatus).toBe("pending");
  });

  it("タグを元の内容と同じ集合に送り直しても再審査は走らない (無駄なAI呼び出しをしない)", async () => {
    asUser(userId);
    const word = `${MARK}ミチタグドウイツ`;
    // タグ名は FIELD_MAX.tagName (30文字) 制限があるため、MARK を含めない短い名前にする。
    const tagName = `tg${Date.now()}`;
    const road = await prisma.road.create({
      data: {
        userId,
        difficulty: `${word} で困っている`,
        goal: "g",
        moderationStatus: "approved",
        roadTags: {
          create: {
            tag: { connectOrCreate: { where: { name: tagName }, create: { name: tagName } } },
          },
        },
      },
    });

    const res = await patchRoad(
      new Request(`http://localhost/api/v1/roads/${road.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: [tagName] }),
      }),
      { params: Promise.resolve({ roadId: road.id }) },
    );
    const dto = (await res.json()) as { moderationStatus: string };
    // 内容は変わっていないので approved のまま (pending に落ちない)
    expect(dto.moderationStatus).toBe("approved");
  });
});
