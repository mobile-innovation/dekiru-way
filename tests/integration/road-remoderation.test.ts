import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";

/**
 * H-2: 承認後に道の公開項目を変更したら、その道の公開中・承認済みの経験を再審査する。
 * 実 DB (ローカル) を使う。AI は `@/lib/ai/client#callJson` をモックし、外部には出ない。
 * 管理者通知も (メールを送らないよう) モックする。
 */

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

// 次の AI 審査が返す verdict。テストごとに切り替える。
const aiVerdict: { value: "ok" | "ng" | "unknown" } = { value: "ok" };
vi.mock("@/lib/ai/client", () => ({
  callJson: vi.fn(async () => ({
    verdict: aiVerdict.value,
    reason: "テスト用の判定",
    categories: aiVerdict.value === "ng" ? ["spam"] : [],
  })),
  DISCLAIMER: "テスト用の注意書き",
}));

vi.mock("@/lib/admin-notify", () => ({
  notifyAdminOfNewPending: vi.fn(async () => undefined),
}));

import { ModerationStatus } from "@prisma/client";
import { auth } from "@/auth";
import { callJson } from "@/lib/ai/client";
import { notifyAdminOfNewPending } from "@/lib/admin-notify";
import { prisma } from "@/lib/db";
import { PATCH as patchRoad } from "@/app/api/v1/roads/[roadId]/route";

const MARK = `remod-${Date.now()}`;
let seq = 0;
let savedKey: string | undefined;
let savedModeration: string | undefined;

const asUser = (id: string) => vi.mocked(auth).mockResolvedValue({ user: { id } } as never);
const ctxFor = (roadId: string) => ({ params: Promise.resolve({ roadId }) });

type AttemptSpec = { isPublished: boolean; moderationStatus: ModerationStatus };

/** 本人 + 道 (公開項目・タグあり) + 指定状態の試したことを作る。レート制限を避けるため毎回別ユーザー。 */
async function makeRoad(attempts: AttemptSpec[]) {
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
      roadTags: {
        create: [
          { tag: { create: { name: `${MARK}-a${n}` } } },
          { tag: { create: { name: `${MARK}-b${n}` } } },
        ],
      },
    },
  });
  const created = [];
  for (const [i, a] of attempts.entries()) {
    created.push(
      await prisma.attempt.create({
        data: { roadId: road.id, method: `${MARK} 方法 ${n}-${i}`, result: "success", ...a },
      }),
    );
  }
  asUser(user.id);
  return { road, attempts: created, tagNames: [`${MARK}-a${n}`, `${MARK}-b${n}`] };
}

async function patch(roadId: string, body: Record<string, unknown>) {
  const res = await patchRoad(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctxFor(roadId),
  );
  expect(res.status).toBe(200);
  return res;
}

const reload = (id: string) => prisma.attempt.findUniqueOrThrow({ where: { id } });

const APPROVED_PUBLIC: AttemptSpec = {
  isPublished: true,
  moderationStatus: ModerationStatus.approved,
};

beforeAll(() => {
  savedKey = process.env.ANTHROPIC_API_KEY;
  savedModeration = process.env.AI_MODERATION_ENABLED;
  // ダミーキー (callJson はモック済みなので外部には出ない)。AI 審査経路を通すため。
  process.env.ANTHROPIC_API_KEY = "test-dummy-not-a-real-key";
});

beforeEach(() => {
  aiVerdict.value = "ok";
  delete process.env.AI_MODERATION_ENABLED;
  vi.mocked(callJson).mockClear();
  vi.mocked(notifyAdminOfNewPending).mockClear();
});

afterEach(() => {
  delete process.env.AI_MODERATION_ENABLED;
});

afterAll(async () => {
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  else delete process.env.ANTHROPIC_API_KEY;
  if (savedModeration !== undefined) process.env.AI_MODERATION_ENABLED = savedModeration;
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.tag.deleteMany({ where: { name: { startsWith: MARK } } });
  await prisma.$disconnect();
});

describe("PATCH /api/v1/roads/{id}: 公開項目の変更で承認済み経験を再審査する (H-2)", () => {
  it.each([
    ["difficulty", { difficulty: "書き換えた困りごと" }],
    ["goal", { goal: "書き換えた目標" }],
    ["previouslyAble", { previouslyAble: "書き換えた以前" }],
    ["situation", { situation: "書き換えた場面" }],
    ["progress", { progress: "書き換えた進捗" }],
    ["nextAction", { nextAction: "書き換えた次の一手" }],
  ])("%s の変更で、公開中・承認済みの経験が再審査される", async (_field, body) => {
    const { road, attempts } = await makeRoad([APPROVED_PUBLIC]);
    await patch(road.id, body);

    expect(callJson).toHaveBeenCalledTimes(1);
    expect((await reload(attempts[0].id)).aiCheckedAt).not.toBeNull();
  });

  it("再審査の本文には変更後の道の内容が入る", async () => {
    const { road } = await makeRoad([APPROVED_PUBLIC]);
    await patch(road.id, { progress: "変更後の進捗 090-0000-0000" });
    expect(String(vi.mocked(callJson).mock.calls[0][0])).toContain(
      "いまの進捗: 変更後の進捗 090-0000-0000",
    );
  });

  it("tags の変更で再審査される", async () => {
    const { road, attempts, tagNames } = await makeRoad([APPROVED_PUBLIC]);
    await patch(road.id, { tags: [tagNames[0], `${MARK}-追加`] });

    expect(callJson).toHaveBeenCalledTimes(1);
    expect((await reload(attempts[0].id)).aiCheckedAt).not.toBeNull();
  });

  it("保留中 (pending) の経験は再審査されない", async () => {
    const { road, attempts } = await makeRoad([
      APPROVED_PUBLIC,
      { isPublished: true, moderationStatus: ModerationStatus.pending },
    ]);
    await patch(road.id, { difficulty: "書き換えた困りごと" });

    expect(callJson).toHaveBeenCalledTimes(1); // 承認済みの 1 件だけ
    const pending = await reload(attempts[1].id);
    expect(pending.aiCheckedAt).toBeNull();
    expect(pending.moderationStatus).toBe(ModerationStatus.pending);
  });

  it("却下済み (rejected) の経験は再審査されない", async () => {
    const { road, attempts } = await makeRoad([
      APPROVED_PUBLIC,
      { isPublished: true, moderationStatus: ModerationStatus.rejected },
    ]);
    await patch(road.id, { difficulty: "書き換えた困りごと" });

    expect(callJson).toHaveBeenCalledTimes(1);
    const rejected = await reload(attempts[1].id);
    expect(rejected.aiCheckedAt).toBeNull();
    expect(rejected.moderationStatus).toBe(ModerationStatus.rejected);
  });

  it("非公開の経験は (承認済みでも) 再審査されない", async () => {
    const { road, attempts } = await makeRoad([
      { isPublished: false, moderationStatus: ModerationStatus.approved },
    ]);
    await patch(road.id, { difficulty: "書き換えた困りごと" });

    expect(callJson).not.toHaveBeenCalled();
    expect((await reload(attempts[0].id)).aiCheckedAt).toBeNull();
  });

  it("公開項目を同じ値で送っただけ (タグの順番違い・前後の空白を含む) では再審査されない", async () => {
    const { road, tagNames } = await makeRoad([APPROVED_PUBLIC]);
    await patch(road.id, {
      difficulty: `  ${road.difficulty}  `,
      goal: road.goal,
      previouslyAble: road.previouslyAble,
      situation: road.situation,
      progress: road.progress,
      nextAction: road.nextAction,
      tags: [tagNames[1], ` ${tagNames[0]} `],
    });
    expect(callJson).not.toHaveBeenCalled();
  });

  it.each([
    ["memo", { memo: "書き換えたメモ" }],
    ["status", { status: "一区切り" }],
    ["startedAt", { startedAt: "2026-02-02" }],
  ])("%s だけの変更では再審査されない", async (_field, body) => {
    const { road, attempts } = await makeRoad([APPROVED_PUBLIC]);
    await patch(road.id, body);

    expect(callJson).not.toHaveBeenCalled();
    const a = await reload(attempts[0].id);
    expect(a.aiCheckedAt).toBeNull();
    expect(a.moderationStatus).toBe(ModerationStatus.approved);
  });

  it("AI 審査 OK なら公開状態 (公開中・承認済み) が維持される", async () => {
    aiVerdict.value = "ok";
    const { road, attempts } = await makeRoad([APPROVED_PUBLIC]);
    await patch(road.id, { difficulty: "書き換えた困りごと" });

    const a = await reload(attempts[0].id);
    expect(a.isPublished).toBe(true);
    expect(a.moderationStatus).toBe(ModerationStatus.approved);
    expect(a.aiVerdict).toBe("ok");
    expect(notifyAdminOfNewPending).not.toHaveBeenCalled();
  });

  it.each(["ng", "unknown"] as const)(
    "AI 審査 %s なら既存の再審査ルールどおり pending に戻り、運営へ通知される",
    async (verdict) => {
      aiVerdict.value = verdict;
      const { road, attempts } = await makeRoad([APPROVED_PUBLIC]);
      const res = await patch(road.id, { progress: "宣伝 https://example.com" });

      const a = await reload(attempts[0].id);
      expect(a.isPublished).toBe(true); // 公開申請は残したまま、公開面からは外れる
      expect(a.moderationStatus).toBe(ModerationStatus.pending);
      expect(a.aiVerdict).toBe(verdict);
      expect(notifyAdminOfNewPending).toHaveBeenCalledWith(attempts[0].id, a.createdAt);

      // レスポンスの道にも再審査後の状態が反映されている
      const json = (await res.json()) as {
        attempts: { id: string; moderationStatus: string; publishState: string }[];
      };
      const dto = json.attempts.find((x) => x.id === attempts[0].id);
      expect(dto?.moderationStatus).toBe("pending");
      expect(dto?.publishState).toBe("reviewing");
    },
  );

  it("AI_MODERATION_ENABLED=false なら既存の挙動どおり AI を呼ばず approved のまま", async () => {
    process.env.AI_MODERATION_ENABLED = "false";
    const { road, attempts } = await makeRoad([APPROVED_PUBLIC]);
    await patch(road.id, { difficulty: "書き換えた困りごと" });

    expect(callJson).not.toHaveBeenCalled();
    const a = await reload(attempts[0].id);
    expect(a.isPublished).toBe(true);
    expect(a.moderationStatus).toBe(ModerationStatus.approved);
  });

  it("複数の承認済み経験があればすべて再審査される", async () => {
    const { road, attempts } = await makeRoad([APPROVED_PUBLIC, APPROVED_PUBLIC]);
    await patch(road.id, { goal: "書き換えた目標" });

    expect(callJson).toHaveBeenCalledTimes(2);
    for (const a of attempts) expect((await reload(a.id)).aiCheckedAt).not.toBeNull();
  });
});
