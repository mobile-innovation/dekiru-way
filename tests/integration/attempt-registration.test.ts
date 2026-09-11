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
import { POST as createRoad } from "@/app/api/v1/roads/route";
import { POST as createAttempt } from "@/app/api/v1/roads/[roadId]/attempts/route";
import { PATCH as patchAttempt } from "@/app/api/v1/attempts/[attemptId]/route";
import { GET as listExperiences } from "@/app/api/v1/experiences/route";

/**
 * 登録画面・登録項目 更新指示書:
 *   - Road: previouslyAble / difficulty / goal は必須 (§4/§21/§25)
 *   - Attempt: achievementPercent / feeling / stateAfter / previousAttemptId は
 *     登録項目から外した。書いて送っても保存されない（無視される）ことを確認する
 *     (既存データの表示・DB カラム自体は変更していない)。
 */

const MARK = `reg-${Date.now()}`;
let userId = "";
let roadId = "";

const asUser = (id: string) => vi.mocked(auth).mockResolvedValue({ user: { id } } as never);

const ctx = { params: Promise.resolve({}) };

beforeAll(async () => {
  const u = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  userId = u.id;
  asUser(userId);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

function postRoad(body: unknown) {
  return createRoad(
    new Request("http://localhost/api/v1/roads", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    ctx,
  );
}

function postAttempt(body: unknown) {
  return createAttempt(
    new Request(`http://localhost/api/v1/roads/${roadId}/attempts`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ roadId }) },
  );
}

function patchAttemptReq(id: string, body: unknown) {
  return patchAttempt(
    new Request(`http://localhost/api/v1/attempts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ attemptId: id }) },
  );
}

describe("Road 作成: difficulty / goal は必須。previouslyAble は任意（Road登録・編集画面 必須項目修正指示）", () => {
  it("3 項目とも揃っていれば作成できる", async () => {
    const res = await postRoad({
      previouslyAble: `${MARK} 以前はできていた`,
      difficulty: `${MARK} できなくなった`,
      goal: `${MARK} できるようになりたい`,
    });
    expect(res.status).toBe(201);
    const dto = await res.json();
    roadId = dto.id;
    expect(dto.previouslyAble).toBe(`${MARK} 以前はできていた`);
  });

  it("previouslyAble が無くても作成できる（任意項目）", async () => {
    const res = await postRoad({
      difficulty: `${MARK} previouslyAble省略`,
      goal: `${MARK} できるようになりたい2`,
    });
    expect(res.status).toBe(201);
    const dto = await res.json();
    expect(dto.previouslyAble).toBeNull();
  });

  it("difficulty が無いと 400", async () => {
    const res = await postRoad({ previouslyAble: "x", goal: "y" });
    expect(res.status).toBe(400);
  });

  it("goal が無いと 400", async () => {
    const res = await postRoad({ previouslyAble: "x", difficulty: "y" });
    expect(res.status).toBe(400);
  });
});

describe("Attempt: できた％／気持ち／その後／前に試した方法は登録項目から外れている", () => {
  it("送っても保存されない（201 では返るが値は入らない）", async () => {
    const other = await prisma.attempt.create({
      data: { roadId, method: "別の方法", result: "partial" },
    });
    const res = await postAttempt({
      method: "IHに変えた",
      result: "success",
      achievementPercent: 80,
      feeling: "ほっとした",
      stateAfter: "一人でできるようになった",
      previousAttemptId: other.id,
      nextAction: "音声タイマーを試す",
    });
    expect(res.status).toBe(201);
    const dto = await res.json();
    expect(dto.achievementPercent).toBeNull();
    expect(dto.feeling).toBeNull();
    expect(dto.stateAfter).toBeNull();
    expect(dto.previousAttemptId).toBeNull();
    // 登録項目のままの項目は引き続き保存される
    expect(dto.nextAction).toBe("音声タイマーを試す");
  });

  it("PATCH で送っても値は変わらない（無視される）", async () => {
    const created = await prisma.attempt.create({
      data: { roadId, method: "元の方法", result: "ongoing" },
    });
    const res = await patchAttemptReq(created.id, {
      achievementPercent: 50,
      feeling: "x",
      stateAfter: "y",
      previousAttemptId: created.id,
      memo: "更新後のメモ",
    });
    expect(res.status).toBe(200);
    const dto = await res.json();
    expect(dto.achievementPercent).toBeNull();
    expect(dto.feeling).toBeNull();
    expect(dto.stateAfter).toBeNull();
    expect(dto.previousAttemptId).toBeNull();
    expect(dto.memo).toBe("更新後のメモ");
  });
});

describe("Attempt: isPublished は未指定なら false（公開はオプトイン。公開設定の初期値修正指示）", () => {
  it("isPublished を送らずに作成すると非公開になる", async () => {
    const res = await postAttempt({ method: "未指定で作成", result: "ongoing" });
    expect(res.status).toBe(201);
    const dto = await res.json();
    expect(dto.isPublished).toBe(false);
    expect(dto.moderationStatus).toBe("pending"); // AI 審査自体が走らない（非公開のため）
  });

  it("isPublished: true を明示すれば公開される", async () => {
    const res = await postAttempt({ method: "明示 true", result: "success", isPublished: true });
    expect(res.status).toBe(201);
    const dto = await res.json();
    expect(dto.isPublished).toBe(true);
  });

  it("編集で isPublished を省略しても、既存の公開状態は保持される（勝手に非公開に戻さない）", async () => {
    const created = await prisma.attempt.create({
      data: { roadId, method: "公開済みの方法", result: "success", isPublished: true, moderationStatus: "approved" },
    });
    const res = await patchAttemptReq(created.id, { memo: "非公開設定に触れない更新" });
    expect(res.status).toBe(200);
    const dto = await res.json();
    expect(dto.isPublished).toBe(true);
    expect(dto.memo).toBe("非公開設定に触れない更新");
  });

  it("非公開 Attempt を編集しても、isPublished を省略すれば非公開のまま（勝手に公開されない）", async () => {
    const created = await prisma.attempt.create({
      data: { roadId, method: "非公開の方法", result: "ongoing", isPublished: false },
    });
    const res = await patchAttemptReq(created.id, { memo: "公開設定に触れない更新" });
    expect(res.status).toBe(200);
    const dto = await res.json();
    expect(dto.isPublished).toBe(false);
    expect(dto.memo).toBe("公開設定に触れない更新");
  });
});

describe("検索: previouslyAble の有無・is_published の公開境界（最終動作確認指示書）", () => {
  async function search(q: string) {
    const res = await listExperiences(
      new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(q)}&limit=50`),
      { params: Promise.resolve({}) },
    );
    const json = (await res.json()) as { items: { id: string; method: string }[] };
    return json.items;
  }

  // 公開経験検索に載るには isPublished=true に加えて moderationStatus=approved が要る
  // (PUBLIC_ATTEMPT_WHERE)。ローカルは ANTHROPIC_API_KEY 未設定のため、POST 経由だと
  // AI 審査のフォールバックで pending のまま止まる。ここでは検索の可視性だけを確定的に
  // 検証したいので、既存の `experiences.api.test.ts` と同じく承認済み状態を直接作る。
  it("previouslyAble が未入力の Road でも、difficulty 一致で公開経験検索に出る", async () => {
    const roadRes = await postRoad({
      difficulty: `${MARK} previouslyAble無しで検索`,
      goal: "検索できるようになりたい",
    });
    const road = await roadRes.json();
    expect(road.previouslyAble).toBeNull();
    await prisma.attempt.create({
      data: {
        roadId: road.id,
        method: `${MARK} previouslyAble無しの方法`,
        result: "success",
        isPublished: true,
        moderationStatus: "approved",
      },
    });

    const items = await search(`${MARK} previouslyAble無しで検索`);
    expect(items.some((i) => i.method === `${MARK} previouslyAble無しの方法`)).toBe(true);
  });

  it("previouslyAble が入力されている Road は、previouslyAble の内容でも検索に出る（検索補助）", async () => {
    const roadRes = await postRoad({
      previouslyAble: `${MARK} 以前は一人でシャツのボタンを留められていた`,
      difficulty: `${MARK} シャツのボタンを自分で留めるのが難しい`,
      goal: "自分でシャツを着たい",
    });
    const road = await roadRes.json();
    await prisma.attempt.create({
      data: {
        roadId: road.id,
        method: `${MARK} ボタンエイドを使った`,
        result: "success",
        isPublished: true,
        moderationStatus: "approved",
      },
    });

    // previouslyAble の文言だけで検索しても見つかる
    const items = await search(`${MARK} 以前は一人でシャツのボタンを留められていた`);
    expect(items.some((i) => i.method === `${MARK} ボタンエイドを使った`)).toBe(true);
  });

  it("非公開 Attempt は検索結果に出ず、同じ道の公開 Attempt だけが出る（Road 単位ではなく Attempt 単位で判定）", async () => {
    const roadRes = await postRoad({
      difficulty: `${MARK} 公開境界テストの道`,
      goal: "境界を確認したい",
    });
    const road = await roadRes.json();

    await prisma.attempt.create({
      data: {
        roadId: road.id,
        method: `${MARK} 非公開の方法A`,
        result: "failed",
        isPublished: false,
        moderationStatus: "approved",
      },
    });
    await prisma.attempt.create({
      data: {
        roadId: road.id,
        method: `${MARK} 公開の方法B`,
        result: "success",
        isPublished: true,
        moderationStatus: "approved",
      },
    });

    const items = await search(`${MARK} 公開境界テストの道`);
    const methods = items.map((i) => i.method);
    expect(methods).toContain(`${MARK} 公開の方法B`);
    expect(methods).not.toContain(`${MARK} 非公開の方法A`);
  });
});
