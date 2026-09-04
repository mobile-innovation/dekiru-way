import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

// ローカル AI は補助レイヤー。実モデルに触れずに挙動を差し替える。
vi.mock("@/lib/ai/local", () => ({
  generateRoadTitle: vi.fn(),
}));

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { generateRoadTitle } from "@/lib/ai/local";
import { POST as createRoad } from "@/app/api/v1/roads/route";

const MARK = `road-title-ai-${Date.now()}`;
let userId = "";

const asUser = (id: string) =>
  vi.mocked(auth).mockResolvedValue({ user: { id } } as any);

const ctx = { params: Promise.resolve({ roadId: "" }) };

function post(body: unknown) {
  return createRoad(
    new Request("http://localhost/api/v1/roads", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    ctx,
  );
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { googleSub: `${MARK}:owner` } });
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.mocked(generateRoadTitle).mockReset();
  asUser(userId);
});

describe("Road 作成時のタイトル自動生成", () => {
  it("タイトル未入力 + 生成成功 → 生成された見出しが保存される", async () => {
    vi.mocked(generateRoadTitle).mockResolvedValue("歩行のふらつき");
    const res = await post({ difficulty: `${MARK} 歩けなくなった` });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; title: string | null };
    expect(json.title).toBe("歩行のふらつき");
    expect(vi.mocked(generateRoadTitle)).toHaveBeenCalledWith(`${MARK} 歩けなくなった`);
  });

  it("生成が null（未設定・失敗・タイムアウト）→ title は null のまま。作成は成功", async () => {
    vi.mocked(generateRoadTitle).mockResolvedValue(null);
    const res = await post({ difficulty: `${MARK} 字が書けない` });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { title: string | null };
    expect(json.title).toBeNull();
  });

  it("タイトルを明示入力した場合は生成を呼ばない", async () => {
    const res = await post({ title: `${MARK} 手入力タイトル`, difficulty: "何か" });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { title: string | null };
    expect(json.title).toBe(`${MARK} 手入力タイトル`);
    expect(vi.mocked(generateRoadTitle)).not.toHaveBeenCalled();
  });

  it("difficulty が無ければ生成を呼ばない", async () => {
    const res = await post({ goal: `${MARK} 目標だけ` });
    expect(res.status).toBe(201);
    expect(vi.mocked(generateRoadTitle)).not.toHaveBeenCalled();
  });
});
