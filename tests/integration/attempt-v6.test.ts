import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { POST as createAttempt } from "@/app/api/v1/roads/[roadId]/attempts/route";
import { PATCH as patchAttempt } from "@/app/api/v1/attempts/[attemptId]/route";

/**
 * v6: できた％ / 気持ち / state_after / next_action / previous_attempt_id (追加指示書 v6)
 */

const MARK = `v6-${Date.now()}`;
let userId = "";
let roadId = "";
let otherRoadId = "";
let attemptA = "";
let attemptB = "";

const asUser = (id: string) => vi.mocked(auth).mockResolvedValue({ user: { id } } as never);

beforeAll(async () => {
  const u = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  userId = u.id;
  asUser(userId);
  const road = await prisma.road.create({ data: { userId, difficulty: MARK, goal: "x" } });
  roadId = road.id;
  const other = await prisma.road.create({ data: { userId, difficulty: `${MARK} other`, goal: "y" } });
  otherRoadId = other.id;
  const a = await prisma.attempt.create({ data: { roadId, method: "A", result: "partial" } });
  attemptA = a.id;
  const b = await prisma.attempt.create({ data: { roadId, method: "B", result: "success" } });
  attemptB = b.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

function post(body: unknown) {
  return createAttempt(
    new Request(`http://localhost/api/v1/roads/${roadId}/attempts`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ roadId }) },
  );
}
function patch(id: string, body: unknown) {
  return patchAttempt(
    new Request(`http://localhost/api/v1/attempts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ attemptId: id }) },
  );
}

describe("Attempt v6 フィールド", () => {
  it("できた％ / 気持ち / その後 / 次に試すこと を保存できる", async () => {
    asUser(userId);
    const res = await post({
      method: "IHに変えた",
      result: "success",
      achievementPercent: 80,
      feeling: "ほっとした",
      stateAfter: "一人でできるようになった",
      nextAction: "音声タイマーを試す",
    });
    expect(res.status).toBe(201);
    const dto = await res.json();
    expect(dto.achievementPercent).toBe(80);
    expect(dto.feeling).toBe("ほっとした");
    expect(dto.stateAfter).toBe("一人でできるようになった");
    expect(dto.nextAction).toBe("音声タイマーを試す");
  });

  it("できた％ は 0〜100。範囲外は 400 (AI 計算ではなく本人入力・§5/§6)", async () => {
    asUser(userId);
    expect((await post({ method: "m", result: "partial", achievementPercent: 150 })).status).toBe(400);
    expect((await post({ method: "m", result: "partial", achievementPercent: -1 })).status).toBe(400);
    expect((await post({ method: "m", result: "partial", achievementPercent: 0 })).status).toBe(201);
  });

  it("result と achievement_percent は別情報（partial でも 90 を保存できる §7）", async () => {
    asUser(userId);
    const res = await post({ method: "m2", result: "partial", achievementPercent: 90 });
    const dto = await res.json();
    expect(dto.result).toBe("partial");
    expect(dto.achievementPercent).toBe(90);
  });

  it("previous_attempt_id は同じ Road のみ（別 Road は 400 §14）", async () => {
    asUser(userId);
    const otherAttempt = await prisma.attempt.create({
      data: { roadId: otherRoadId, method: "別道", result: "partial" },
    });
    const res = await post({ method: "m3", result: "partial", previousAttemptId: otherAttempt.id });
    expect(res.status).toBe(400);
  });

  it("previous_attempt_id に自分自身は指定できない（§14/§29）", async () => {
    asUser(userId);
    expect((await patch(attemptA, { previousAttemptId: attemptA })).status).toBe(400);
  });

  it("previous_attempt_id の循環は 400（§14）", async () => {
    asUser(userId);
    // A -> B にする
    expect((await patch(attemptA, { previousAttemptId: attemptB })).status).toBe(200);
    // B -> A にすると循環
    expect((await patch(attemptB, { previousAttemptId: attemptA })).status).toBe(400);
    // 後始末
    await patch(attemptA, { previousAttemptId: null });
  });

  it("正しい previous_attempt_id は保存できる（同じ Road）", async () => {
    asUser(userId);
    const res = await post({ method: "m4", result: "success", previousAttemptId: attemptA });
    expect(res.status).toBe(201);
    expect((await res.json()).previousAttemptId).toBe(attemptA);
  });
});
