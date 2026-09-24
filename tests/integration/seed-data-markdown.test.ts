import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// アプリ利用者の認証をモック (公開検索は未ログインで叩く)
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

// 管理者の認証をモック
const adminRef: { id: string } = { id: "" };
vi.mock("@/lib/admin/auth", () => ({
  requireAdminApi: vi.fn(async () => ({ id: adminRef.id, email: "seed-md-admin@example.com" })),
  getAdminSession: vi.fn(async () => ({ id: adminRef.id, email: "seed-md-admin@example.com" })),
}));

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/admin/password";
import { resetBotGuard } from "@/lib/bot-guard";
import { requireAdminApi } from "@/lib/admin/auth";
import { SEED_OWNER_SUB } from "@/lib/admin/seed-data";
import { POST as parseMarkdown } from "@/app/api/admin/seed-data/parse-markdown/route";
import { POST as createSeed } from "@/app/api/admin/seed-data/route";
import { POST as publishSeed } from "@/app/api/admin/seed-data/[roadId]/publish/route";
import { POST as unpublishSeed } from "@/app/api/admin/seed-data/[roadId]/unpublish/route";
import { DELETE as deleteSeed } from "@/app/api/admin/seed-data/[roadId]/route";
import { GET as listExperiences } from "@/app/api/v1/experiences/route";

const MARK = `seedmd-${Date.now()}`;

beforeAll(async () => {
  const admin = await prisma.adminUser.create({
    data: { email: `${MARK}@example.com`, passwordHash: hashPassword("test-password") },
  });
  adminRef.id = admin.id;
});

afterAll(async () => {
  await prisma.road.deleteMany({ where: { difficulty: { startsWith: MARK } } });
  await prisma.adminAuditLog.deleteMany({ where: { adminId: adminRef.id } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: MARK } } });
  await prisma.user.deleteMany({ where: { googleSub: SEED_OWNER_SUB, roads: { none: {} } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  resetBotGuard();
  vi.mocked(requireAdminApi).mockResolvedValue({ id: adminRef.id, email: "seed-md-admin@example.com" } as never);
});

const asAdminReq = (url: string, body?: unknown, method = "POST") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

function markdownWithAttempts(n: number, results: string[]): string {
  const attempts = results
    .map(
      (r, i) => `## 試したこと${i + 1}

### 方法
${MARK} 方法${i + 1}

### 結果
${r}

### 結果の詳細
${MARK} 詳細${i + 1}
`,
    )
    .join("\n");
  return `# ${MARK} 道${n}

## 困っていたこと
${MARK} 困りごと${n}

## 目標
${MARK} 目標${n}

${attempts}
`;
}

async function publicMethods(): Promise<string[]> {
  const res = await listExperiences(
    new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(MARK)}&limit=50`),
    { params: Promise.resolve({}) },
  );
  const json = (await res.json()) as { items: { method: string }[] };
  return json.items.map((i) => i.method);
}

describe("POST /api/admin/seed-data/parse-markdown", () => {
  it("Markdownを解析し、道・複数の試したことを返す（DBには保存しない）", async () => {
    const md = markdownWithAttempts(1, ["success", "partial", "failed"]);
    const res = await parseMarkdown(asAdminReq("http://localhost/api/admin/seed-data/parse-markdown", { markdown: md }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      roads: { difficulty: string; attempts: { method: string; result: string }[] }[];
      errors: string[];
    };
    expect(json.errors).toEqual([]);
    expect(json.roads).toHaveLength(1);
    expect(json.roads[0].attempts.map((a) => a.result)).toEqual(["success", "partial", "failed"]);

    const count = await prisma.road.count({ where: { difficulty: { startsWith: MARK } } });
    expect(count).toBe(0);
  });

  it("不正な結果があるとエラーを返す", async () => {
    const md = markdownWithAttempts(2, ["not-a-result"]);
    const res = await parseMarkdown(asAdminReq("http://localhost/api/admin/seed-data/parse-markdown", { markdown: md }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { errors: string[] };
    expect(json.errors.some((e) => e.includes("結果「not-a-result」は対応していません"))).toBe(true);
  });

  it("道が複数あるMarkdownはエラーを返す（1回の取り込みは道1件まで）", async () => {
    const md = [markdownWithAttempts(3, ["success"]), markdownWithAttempts(4, ["partial"])].join("\n");
    const res = await parseMarkdown(asAdminReq("http://localhost/api/admin/seed-data/parse-markdown", { markdown: md }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { roads: unknown[]; errors: string[] };
    expect(json.roads).toEqual([]);
    expect(json.errors.some((e) => e.includes("道は1件までです"))).toBe(true);

    const count = await prisma.road.count({ where: { difficulty: { startsWith: MARK } } });
    expect(count).toBe(0);
  });
});

describe("POST /api/admin/seed-data (roads: 複数 Attempt の保存)", () => {
  let roadId: string;
  let attemptIds: string[];

  it("1 Road + 複数 Attempt を非公開・pending で、Markdown の順番どおりに保存する", async () => {
    const res = await createSeed(
      asAdminReq("http://localhost/api/admin/seed-data", {
        keyword: MARK,
        roads: [
          {
            difficulty: `${MARK} 困りごと道3`,
            goal: `${MARK} 目標道3`,
            attempts: [
              { method: `${MARK} 方法A`, result: "failed" },
              { method: `${MARK} 方法B`, result: "partial" },
              { method: `${MARK} 方法C`, result: "success" },
            ],
          },
        ],
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    const { items } = (await res.json()) as {
      items: {
        id: string;
        isPublished: boolean;
        publishState: string;
        road: { difficulty: string | null };
        attempts: { id: string; method: string; result: string; isPublished: boolean; moderationStatus: string }[];
      }[];
    };
    expect(items).toHaveLength(1);
    const seed = items[0];
    roadId = seed.id;
    expect(seed.road.difficulty).toBe(`${MARK} 困りごと道3`);
    expect(seed.isPublished).toBe(false);
    expect(seed.publishState).toBe("private");
    expect(seed.attempts).toHaveLength(3);
    // Markdown / 配列の順番が保持されている
    expect(seed.attempts.map((a) => a.method)).toEqual([
      `${MARK} 方法A`,
      `${MARK} 方法B`,
      `${MARK} 方法C`,
    ]);
    expect(seed.attempts.map((a) => a.result)).toEqual(["failed", "partial", "success"]);
    for (const a of seed.attempts) {
      expect(a.isPublished).toBe(false);
      expect(a.moderationStatus).toBe("pending");
    }
    attemptIds = seed.attempts.map((a) => a.id);

    // DB 上でも is_seed_data / data_origin が立っている
    const row = await prisma.road.findUniqueOrThrow({ where: { id: roadId } });
    expect(row.isSeedData).toBe(true);
    expect(row.dataOrigin).toBe("ai_seed");
    const attempts = await prisma.attempt.findMany({ where: { roadId } });
    expect(attempts).toHaveLength(3);
  });

  it("公開すると、その道のすべての Attempt が同時に公開される", async () => {
    const res = await publishSeed(asAdminReq(`http://localhost/api/admin/seed-data/${roadId}/publish`), {
      params: Promise.resolve({ roadId }),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { attempts: { isPublished: boolean; moderationStatus: string }[] };
    expect(dto.attempts).toHaveLength(3);
    for (const a of dto.attempts) {
      expect(a.isPublished).toBe(true);
      expect(a.moderationStatus).toBe("approved");
    }

    // 公開検索にも複数件とも出る
    const methods = await publicMethods();
    expect(methods).toContain(`${MARK} 方法A`);
    expect(methods).toContain(`${MARK} 方法B`);
    expect(methods).toContain(`${MARK} 方法C`);
  });

  it("非公開に戻すと、すべての Attempt が同時に非公開へ戻る", async () => {
    const res = await unpublishSeed(asAdminReq(`http://localhost/api/admin/seed-data/${roadId}/unpublish`), {
      params: Promise.resolve({ roadId }),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { attempts: { isPublished: boolean; moderationStatus: string }[] };
    for (const a of dto.attempts) {
      expect(a.isPublished).toBe(false);
      expect(a.moderationStatus).toBe("pending");
    }
    const methods = await publicMethods();
    expect(methods).not.toContain(`${MARK} 方法A`);
  });

  it("削除すると、道とすべての Attempt が消える", async () => {
    const res = await deleteSeed(asAdminReq(`http://localhost/api/admin/seed-data/${roadId}`, undefined, "DELETE"), {
      params: Promise.resolve({ roadId }),
    });
    expect(res.status).toBe(204);
    expect(await prisma.road.findUnique({ where: { id: roadId } })).toBeNull();
    expect(await prisma.attempt.findMany({ where: { id: { in: attemptIds } } })).toHaveLength(0);
  });

  it("複数 Road（1つは複数 Attempt）を一度に取り込める", async () => {
    const res = await createSeed(
      asAdminReq("http://localhost/api/admin/seed-data", {
        keyword: MARK,
        roads: [
          {
            difficulty: `${MARK} 複数道1`,
            attempts: [{ method: `${MARK} 複数道1方法1`, result: "ongoing" }],
          },
          {
            difficulty: `${MARK} 複数道2`,
            attempts: [
              { method: `${MARK} 複数道2方法1`, result: "no_change" },
              { method: `${MARK} 複数道2方法2`, result: "success" },
            ],
          },
        ],
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    const { items } = (await res.json()) as {
      items: { road: { difficulty: string | null }; attempts: unknown[] }[];
    };
    expect(items).toHaveLength(2);
    const byDifficulty = Object.fromEntries(items.map((it) => [it.road.difficulty, it.attempts.length]));
    expect(byDifficulty[`${MARK} 複数道1`]).toBe(1);
    expect(byDifficulty[`${MARK} 複数道2`]).toBe(2);
  });

  it("既存の AI 生成 (items) と Markdown取り込み (roads) を同じリクエストで混在保存できる", async () => {
    const res = await createSeed(
      asAdminReq("http://localhost/api/admin/seed-data", {
        keyword: MARK,
        items: [
          {
            difficulty: `${MARK} 平坦形式`,
            method: `${MARK} 平坦形式の方法`,
            result: "ongoing",
          },
        ],
        roads: [
          {
            difficulty: `${MARK} 複数形式`,
            attempts: [{ method: `${MARK} 複数形式の方法`, result: "success" }],
          },
        ],
      }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(201);
    const { items } = (await res.json()) as { items: { road: { difficulty: string | null } }[] };
    expect(items.map((it) => it.road.difficulty).sort()).toEqual(
      [`${MARK} 平坦形式`, `${MARK} 複数形式`].sort(),
    );
  });
});
