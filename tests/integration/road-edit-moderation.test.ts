import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * 道の編集と AI 審査の関係 (2026-10-08 H-2 の見直し)。
 *   - 道は自由に編集でき、道の編集では AI 審査しない。承認済みの経験の状態も変えない。
 *   - 試したことの公開・編集時と管理画面の AI 再チェックでは、その時点の道の情報
 *     (進捗・道の次に試すこと・タグを含む) を審査本文に含める。
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
import { PATCH as patchRoad } from "@/app/api/v1/roads/[roadId]/route";
import { POST as createAttempt } from "@/app/api/v1/roads/[roadId]/attempts/route";
import { PATCH as patchAttempt } from "@/app/api/v1/attempts/[attemptId]/route";
import { POST as recheck } from "@/app/api/admin/posts/[attemptId]/recheck/route";

const MARK = `roadedit-${Date.now()}`;
let seq = 0;
let savedKey: string | undefined;

const asUser = (id: string) => vi.mocked(auth).mockResolvedValue({ user: { id } } as never);

/** 本人 + 道 (公開項目・タグあり) + 公開中・承認済みの試したこと 1 件。レート制限を避けるため毎回別ユーザー。 */
async function makeApprovedRoad() {
  const n = ++seq;
  const user = await prisma.user.create({ data: { googleSub: `${MARK}:u${n}` } });
  const road = await prisma.road.create({
    data: {
      userId: user.id,
      difficulty: `${MARK} 困っていること ${n}`,
      goal: "できるように",
      previouslyAble: "前はできた",
      situation: "朝",
      progress: "少しずつ",
      nextAction: "道具を探す",
      memo: "メモ",
      status: "継続中",
      startedAt: new Date("2026-01-01"),
      roadTags: { create: [{ tag: { create: { name: `${MARK}-a${n}` } } }] },
    },
  });
  const attempt = await prisma.attempt.create({
    data: {
      roadId: road.id,
      method: `${MARK} 方法 ${n}`,
      result: "success",
      isPublished: true,
      moderationStatus: ModerationStatus.approved,
    },
  });
  asUser(user.id);
  return { road, attempt };
}

function jsonRequest(method: string, body: Record<string, unknown> = {}) {
  return new Request("http://localhost", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function editRoad(roadId: string, body: Record<string, unknown>) {
  const res = await patchRoad(jsonRequest("PATCH", body), {
    params: Promise.resolve({ roadId }),
  });
  expect(res.status).toBe(200);
}

const lastPrompt = () => String(vi.mocked(callJson).mock.calls.at(-1)?.[0] ?? "");

beforeAll(async () => {
  savedKey = process.env.ANTHROPIC_API_KEY;
  // ダミーキー (callJson はモック済みなので外部には出ない)。AI 審査経路を通すため。
  process.env.ANTHROPIC_API_KEY = "test-dummy-not-a-real-key";
  delete process.env.AI_MODERATION_ENABLED;
  const admin = await prisma.adminUser.create({
    data: { email: `${MARK}@example.com`, passwordHash: hashPassword("test-password") },
  });
  adminRef.id = admin.id;
});

beforeEach(() => {
  vi.mocked(callJson).mockClear();
});

afterAll(async () => {
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  else delete process.env.ANTHROPIC_API_KEY;
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.tag.deleteMany({ where: { name: { startsWith: MARK } } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("PATCH /api/v1/roads/{id}: 道の編集では AI 審査しない", () => {
  it.each([
    ["difficulty", { difficulty: "書き換えた困りごと" }],
    ["goal", { goal: "書き換えた目標" }],
    ["previouslyAble", { previouslyAble: "書き換えた以前" }],
    ["situation", { situation: "書き換えた場面" }],
    ["progress", { progress: "書き換えた進捗" }],
    ["nextAction", { nextAction: "書き換えた次の一手" }],
    ["tags", { tags: [`${MARK}-追加`] }],
    ["memo", { memo: "書き換えたメモ" }],
    ["status", { status: "一区切り" }],
    ["startedAt", { startedAt: "2026-02-02" }],
  ])("%s を変更しても AI を呼ばず、承認済み・公開中の経験の状態は変わらない", async (_f, body) => {
    const { road, attempt } = await makeApprovedRoad();
    await editRoad(road.id, body);

    expect(callJson).not.toHaveBeenCalled();
    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.isPublished).toBe(true);
    expect(after.moderationStatus).toBe(ModerationStatus.approved);
    expect(after.aiCheckedAt).toBeNull();
  });
});

describe("試したことの公開・編集時は、その時点の道の情報を含めて AI 審査する", () => {
  it("公開中の試したことを編集すると、最新の progress / nextAction / タグが審査本文に入る", async () => {
    const { road, attempt } = await makeApprovedRoad();
    await editRoad(road.id, {
      progress: "最新の進捗 090-0000-0000",
      nextAction: "最新の道の次の一手",
      tags: [`${MARK}-最新タグ`],
    });
    expect(callJson).not.toHaveBeenCalled();

    const res = await patchAttempt(jsonRequest("PATCH", { method: "方法を書き換えた" }), {
      params: Promise.resolve({ attemptId: attempt.id }),
    });
    expect(res.status).toBe(200);
    expect(callJson).toHaveBeenCalledTimes(1);
    expect(lastPrompt()).toContain("いまの進捗: 最新の進捗 090-0000-0000");
    expect(lastPrompt()).toContain("道で次に試すこと: 最新の道の次の一手");
    expect(lastPrompt()).toContain(`タグ: ${MARK}-最新タグ`);
  });

  it("試したことを公開で作成すると、その時点の progress / nextAction が審査本文に入る", async () => {
    const { road } = await makeApprovedRoad();
    await editRoad(road.id, { progress: "作成前の進捗", nextAction: "作成前の次の一手" });

    const res = await createAttempt(
      jsonRequest("POST", { method: "新しく試した", result: "success", isPublished: true }),
      { params: Promise.resolve({ roadId: road.id }) },
    );
    expect(res.status).toBe(201);
    expect(callJson).toHaveBeenCalledTimes(1);
    expect(lastPrompt()).toContain("いまの進捗: 作成前の進捗");
    expect(lastPrompt()).toContain("道で次に試すこと: 作成前の次の一手");
  });
});

describe("管理画面の AI 再チェック", () => {
  it("道の progress / nextAction / タグを含めて審査し、状態は変えない (既存仕様)", async () => {
    const { road, attempt } = await makeApprovedRoad();
    await editRoad(road.id, {
      progress: "再チェック用の進捗",
      nextAction: "再チェック用の次の一手",
      tags: [`${MARK}-再チェックタグ`],
    });

    const res = await recheck(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ attemptId: attempt.id }),
    });
    expect(res.status).toBe(200);
    expect(callJson).toHaveBeenCalledTimes(1);
    expect(lastPrompt()).toContain("いまの進捗: 再チェック用の進捗");
    expect(lastPrompt()).toContain("道で次に試すこと: 再チェック用の次の一手");
    expect(lastPrompt()).toContain(`タグ: ${MARK}-再チェックタグ`);

    const after = await prisma.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(after.moderationStatus).toBe(ModerationStatus.approved);
    expect(after.aiCheckedAt).not.toBeNull();
  });
});
