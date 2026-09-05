import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { resetBotGuard } from "@/lib/bot-guard";
import { GET as listExperiences } from "@/app/api/v1/experiences/route";

/**
 * 実 DB を使う結合テスト。
 * docker compose の DB が起動していることが前提 (npm run db:up)。
 *
 * 確認:
 *   - 公開 Attempt だけが検索結果に出る
 *   - 非公開 Attempt は出ない
 *   - failed も公開されていれば経験として出る (指示書 18)
 */

const MARK = `itest-${Date.now()}`;
let userId = "";

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { googleSub: `${MARK}:owner`, displayName: "結合テスト" },
  });
  userId = user.id;

  await prisma.road.create({
    data: {
      userId,
      title: MARK,
      difficulty: `${MARK} ドアが開けにくい`,
      goal: "自分で開けたい",
      moderationStatus: "approved",
      attempts: {
        create: [
          {
            method: `${MARK} 公開した失敗`,
            result: "failed",
            isPublished: true,
            moderationStatus: "approved",
          },
          {
            method: `${MARK} 公開した成功`,
            result: "success",
            isPublished: true,
            moderationStatus: "approved",
          },
          { method: `${MARK} 非公開のメモ`, result: "partial", isPublished: false },
        ],
      },
    },
  });
});

beforeEach(() => resetBotGuard());

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleSub: { startsWith: MARK } } });
  await prisma.$disconnect();
});

function call(qs: string) {
  return listExperiences(new Request(`http://localhost/api/v1/experiences?${qs}`), {
    params: Promise.resolve({}),
  });
}
async function search(qs: string) {
  const res = await call(qs);
  return res.json() as Promise<{ items: { method: string; result: string }[]; total: number }>;
}

describe("GET /api/v1/experiences", () => {
  it("公開 Attempt のみ返す (非公開は除外)", async () => {
    const data = await search(`q=${encodeURIComponent(MARK)}&limit=50`);
    const methods = data.items.map((i) => i.method);
    expect(methods).toContain(`${MARK} 公開した失敗`);
    expect(methods).toContain(`${MARK} 公開した成功`);
    expect(methods).not.toContain(`${MARK} 非公開のメモ`);
  });

  it("result=failed でも公開されていれば経験として出る", async () => {
    const data = await search(`q=${encodeURIComponent(MARK)}&result=failed&limit=50`);
    expect(data.items.map((i) => i.result)).toEqual(["failed"]);
    expect(data.items[0].method).toBe(`${MARK} 公開した失敗`);
  });

  it("キーワードが road.difficulty にも一致する (指示書 13)", async () => {
    const data = await search(`q=${encodeURIComponent(`${MARK} ドアが開けにくい`)}&limit=50`);
    expect(data.total).toBeGreaterThanOrEqual(2);
  });
});

describe("公開 API の大量取得対策 (追加指示書 v1)", () => {
  it("limit に上限があり limit=10000 は 400", async () => {
    expect((await call("limit=10000")).status).toBe(400);
  });

  it("深いページング (page*limit が窓を超える) は 400", async () => {
    expect((await call("page=30&limit=20")).status).toBe(400); // skip=580 >= 500
    expect((await call("page=200")).status).toBe(400); // zod max=100
  });

  it("レスポンスに内部 ID (roadId / userId / googleSub) を含めない (§6)", async () => {
    const data = await search(`q=${encodeURIComponent(MARK)}&limit=5`);
    const item = (data.items[0] ?? {}) as Record<string, unknown>;
    const road = (item.road ?? {}) as Record<string, unknown>;
    const keys = [...Object.keys(item), ...Object.keys(road)];
    for (const forbidden of ["roadId", "userId", "user_id", "googleSub", "google_sub"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("既知の AI クローラー UA からのリクエストは 403", async () => {
    const res = await listExperiences(
      new Request("http://localhost/api/v1/experiences?limit=2", {
        headers: { "user-agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" },
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(403);
  });
});
