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
        body: JSON.stringify({ difficulty: `same-origin ${Date.now()}` }),
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

describe("Road の「できなくなったこと」は一度設定すると変更不可", () => {
  const patch = (roadId: string, body: unknown) =>
    patchRoad(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
      ctxFor(roadId),
    );

  it("設定済みの difficulty を別の値に変えようとすると 409 で、値は変わらない", async () => {
    asUser(ownerId);
    const res = await patch(ownerRoadId, { difficulty: "ちがう困りごと" });
    expect(res.status).toBe(409);
    const road = await prisma.road.findUnique({ where: { id: ownerRoadId } });
    expect(road?.difficulty).toBe("x");
  });

  it("同じ値の再送信・省略は許可され、他の項目は更新できる", async () => {
    asUser(ownerId);
    const res = await patch(ownerRoadId, { difficulty: "x", memo: "追記" });
    expect(res.status).toBe(200);
    const road = await prisma.road.findUnique({ where: { id: ownerRoadId } });
    expect(road?.memo).toBe("追記");
  });

  it("まだ空の項目は初回だけ設定できる（その後は変更不可）", async () => {
    asUser(ownerId);
    const blank = await prisma.road.create({ data: { userId: ownerId, goal: "g" } });

    const first = await patch(blank.id, { difficulty: "はじめての困りごと" });
    expect(first.status).toBe(200);
    let road = await prisma.road.findUnique({ where: { id: blank.id } });
    expect(road?.difficulty).toBe("はじめての困りごと");

    const second = await patch(blank.id, { difficulty: "書き換え" });
    expect(second.status).toBe(409);
    road = await prisma.road.findUnique({ where: { id: blank.id } });
    expect(road?.difficulty).toBe("はじめての困りごと");
  });

  it("同時に別の値で初回設定しようとすると、片方だけ成功し値が混ざらない (競合)", async () => {
    asUser(ownerId);
    const blank = await prisma.road.create({ data: { userId: ownerId, goal: "g" } });

    const [a, b] = await Promise.all([
      patch(blank.id, { difficulty: "Aが送った値" }),
      patch(blank.id, { difficulty: "Bが送った値" }),
    ]);
    const statuses = [a.status, b.status].sort();
    // どちらか一方だけ成功し、もう一方は競合として拒否される (両方 200 は不可)
    expect(statuses).toEqual([200, 409]);

    const road = await prisma.road.findUnique({ where: { id: blank.id } });
    expect(["Aが送った値", "Bが送った値"]).toContain(road?.difficulty);

    // 成功した方のレスポンスにも、実際にDBへ書き込まれた値と同じ値が返っている
    const winner = a.status === 200 ? a : b;
    const winnerBody = (await winner.json()) as { difficulty: string | null };
    expect(winnerBody.difficulty).toBe(road?.difficulty);
  });
});
