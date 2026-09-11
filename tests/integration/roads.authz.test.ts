import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// @/auth の auth() をモックする (セッションを差し替える)
vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PATCH as patchRoad, DELETE as deleteRoad, GET as getRoad } from "@/app/api/v1/roads/[roadId]/route";
import { POST as createRoad } from "@/app/api/v1/roads/route";

const MARK = `authz-${Date.now()}`;
let ownerId = "";
let strangerId = "";
let ownerRoadId = "";

const asUser = (id: string | null) =>
  vi.mocked(auth).mockResolvedValue((id ? { user: { id } } : null) as any);

beforeAll(async () => {
  const owner = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  const stranger = await prisma.user.create({ data: { googleSub: `${MARK}:stranger` } });
  ownerId = owner.id;
  strangerId = stranger.id;
  const road = await prisma.road.create({
    data: { userId: ownerId, difficulty: "x", goal: "y" },
  });
  ownerRoadId = road.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

const ctx = { params: Promise.resolve({ roadId: "" }) };
const ctxFor = (roadId: string) => ({ params: Promise.resolve({ roadId }) });

describe("書き込みは同一オリジンからのみ (CSRF 対策)", () => {
  it("別サイトからの Road 作成は 403 (Sec-Fetch-Site: cross-site)", async () => {
    asUser(ownerId);
    const res = await createRoad(
      new Request("http://localhost/api/v1/roads", {
        method: "POST",
        body: JSON.stringify({ difficulty: "csrf" }),
        headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      }),
      ctx,
    );
    expect(res.status).toBe(403);
    expect(await prisma.road.findFirst({ where: { difficulty: "csrf" } })).toBeNull();
  });

  it("別オリジンの Origin ヘッダ付き書き込みは 403", async () => {
    asUser(ownerId);
    const res = await createRoad(
      new Request("http://localhost/api/v1/roads", {
        method: "POST",
        body: JSON.stringify({ difficulty: "csrf2" }),
        headers: { "content-type": "application/json", origin: "https://evil.example" },
      }),
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("Sec-Fetch-Site: same-origin の書き込みは通常どおり処理される", async () => {
    asUser(ownerId);
    const res = await createRoad(
      new Request("http://localhost/api/v1/roads", {
        method: "POST",
        body: JSON.stringify({
          previouslyAble: "以前はできていた",
          difficulty: `same-origin ${Date.now()}`,
          goal: "できるようになりたい",
        }),
        headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      }),
      ctx,
    );
    expect(res.status).toBe(201);
  });
});

describe("Road の所有者チェック (指示書 10)", () => {
  it("未ログインは Road 作成で 401", async () => {
    asUser(null);
    const res = await createRoad(
      new Request("http://localhost/api/v1/roads", {
        method: "POST",
        body: JSON.stringify({ difficulty: "a" }),
        headers: { "content-type": "application/json" },
      }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("未ログインは他人の Road を取得できない (401)", async () => {
    asUser(null);
    const res = await getRoad(new Request("http://localhost"), ctxFor(ownerRoadId));
    expect(res.status).toBe(401);
  });

  it("他人は Road を取得できない (403)", async () => {
    asUser(strangerId);
    const res = await getRoad(new Request("http://localhost"), ctxFor(ownerRoadId));
    expect(res.status).toBe(403);
  });

  it("他人は Road を更新できない (403)", async () => {
    asUser(strangerId);
    const res = await patchRoad(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ goal: "のっとり" }),
        headers: { "content-type": "application/json" },
      }),
      ctxFor(ownerRoadId),
    );
    expect(res.status).toBe(403);
    const still = await prisma.road.findUnique({ where: { id: ownerRoadId } });
    expect(still?.goal).toBe("y");
  });

  it("他人は Road を削除できない (403)", async () => {
    asUser(strangerId);
    const res = await deleteRoad(new Request("http://localhost", { method: "DELETE" }), ctxFor(ownerRoadId));
    expect(res.status).toBe(403);
    expect(await prisma.road.findUnique({ where: { id: ownerRoadId } })).not.toBeNull();
  });

  it("所有者は Road を更新できる", async () => {
    asUser(ownerId);
    const res = await patchRoad(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({ progress: "進んだ" }),
        headers: { "content-type": "application/json" },
      }),
      ctxFor(ownerRoadId),
    );
    expect(res.status).toBe(200);
    const road = await prisma.road.findUnique({ where: { id: ownerRoadId } });
    expect(road?.progress).toBe("進んだ");
  });

  it("存在しない Road は 404", async () => {
    asUser(ownerId);
    const res = await getRoad(
      new Request("http://localhost"),
      ctxFor("00000000-0000-0000-0000-000000000000"),
    );
    expect(res.status).toBe(404);
  });

  it("セッションのユーザーが DB に無いときは、FK 違反の 500 ではなく 401", async () => {
    // 例: 別環境で発行された Cookie、開発 DB の再シード後の古いセッション
    asUser("11111111-1111-1111-1111-111111111111");
    const res = await createRoad(
      new Request("http://localhost/api/v1/roads", {
        method: "POST",
        body: JSON.stringify({ difficulty: "セッション切れテスト" }),
        headers: { "content-type": "application/json" },
      }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(
      await prisma.road.findFirst({ where: { difficulty: "セッション切れテスト" } }),
    ).toBeNull();
  });
});

describe("Road の「できなくなったこと」は通常の必須項目として編集できる（道を編集画面の編集可否修正指示）", () => {
  const patch = (roadId: string, body: unknown) =>
    patchRoad(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      ctxFor(roadId),
    );

  it("設定済みの difficulty を別の値に変更でき、DB へも反映される（以前の『一度設定すると変更不可』は廃止）", async () => {
    asUser(ownerId);
    const res = await patch(ownerRoadId, { difficulty: "ちがう困りごと" });
    expect(res.status).toBe(200);
    const road = await prisma.road.findUnique({ where: { id: ownerRoadId } });
    expect(road?.difficulty).toBe("ちがう困りごと");
    // 後続テストに影響しないよう元に戻す
    await patch(ownerRoadId, { difficulty: "x" });
  });

  it("difficulty を空文字にして保存しようとすると 400（必須のまま）", async () => {
    asUser(ownerId);
    const res = await patch(ownerRoadId, { difficulty: "" });
    expect(res.status).toBe(400);
    const road = await prisma.road.findUnique({ where: { id: ownerRoadId } });
    expect(road?.difficulty).toBe("x"); // 値は変わらない
  });

  it("difficulty を省略した更新は、他の項目だけを更新できる（値は変わらない）", async () => {
    asUser(ownerId);
    const res = await patch(ownerRoadId, { memo: "追記" });
    expect(res.status).toBe(200);
    const road = await prisma.road.findUnique({ where: { id: ownerRoadId } });
    expect(road?.memo).toBe("追記");
    expect(road?.difficulty).toBe("x");
  });

  it("初回登録時に difficulty が無かった Road でも、あとから設定・再変更できる", async () => {
    asUser(ownerId);
    const blank = await prisma.road.create({ data: { userId: ownerId, goal: "g" } });

    const first = await patch(blank.id, { difficulty: "はじめての困りごと" });
    expect(first.status).toBe(200);
    let road = await prisma.road.findUnique({ where: { id: blank.id } });
    expect(road?.difficulty).toBe("はじめての困りごと");

    const second = await patch(blank.id, { difficulty: "書き換え" });
    expect(second.status).toBe(200);
    road = await prisma.road.findUnique({ where: { id: blank.id } });
    expect(road?.difficulty).toBe("書き換え");
  });
});
