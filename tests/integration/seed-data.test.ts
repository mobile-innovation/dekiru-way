import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// アプリ利用者の認証をモック (公開検索は未ログインで叩く)
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
  AUTH_COOKIE_NAME: "authjs.session-token",
}));

// 管理者の認証をモック (実 AdminUser 行を beforeAll で作り、その id を返す)
const adminRef: { id: string } = { id: "" };
vi.mock("@/lib/admin/auth", () => ({
  requireAdminApi: vi.fn(async () => ({ id: adminRef.id, email: "seed-admin@example.com" })),
  getAdminSession: vi.fn(async () => ({ id: adminRef.id, email: "seed-admin@example.com" })),
}));

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { hashPassword } from "@/lib/admin/password";
import { resetBotGuard } from "@/lib/bot-guard";
import { requireAdminApi } from "@/lib/admin/auth";
import { SEED_OWNER_SUB } from "@/lib/admin/seed-data";
import { isConcreteDifficulty } from "@/lib/ai/seed-data";
import { POST as generate } from "@/app/api/admin/seed-data/generate/route";
import { POST as createSeed, GET as listSeed } from "@/app/api/admin/seed-data/route";
import { PATCH as patchSeed, DELETE as deleteSeed } from "@/app/api/admin/seed-data/[roadId]/route";
import { POST as publishSeed } from "@/app/api/admin/seed-data/[roadId]/publish/route";
import { POST as unpublishSeed } from "@/app/api/admin/seed-data/[roadId]/unpublish/route";
import { GET as listExperiences } from "@/app/api/v1/experiences/route";

const MARK = `seedflow-${Date.now()}`;
let savedKey: string | undefined;

beforeAll(async () => {
  // AI キーを外して generateSeedDrafts をスタブ経路 (決定的) にする。
  savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const admin = await prisma.adminUser.create({
    data: { email: `${MARK}@example.com`, passwordHash: hashPassword("test-password") },
  });
  adminRef.id = admin.id;
});

afterAll(async () => {
  // この試験で作った Road (仮データ + 実データ) を掃除。Attempt は cascade。
  await prisma.road.deleteMany({
    where: {
      OR: [
        { difficulty: { startsWith: MARK } },
        { seedKeyword: { contains: MARK } },
        { situation: { contains: MARK } },
      ],
    },
  });
  await prisma.adminAuditLog.deleteMany({ where: { adminId: adminRef.id } });
  await prisma.adminUser.deleteMany({ where: { email: { startsWith: MARK } } });
  // 仮データ受け皿ユーザーは、Road を持たなくなったときだけ消す。
  await prisma.user.deleteMany({ where: { googleSub: SEED_OWNER_SUB, roads: { none: {} } } });
  if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  await prisma.$disconnect();
});

beforeEach(() => {
  resetBotGuard();
  vi.mocked(requireAdminApi).mockResolvedValue({ id: adminRef.id, email: "seed-admin@example.com" } as never);
});

const asAdminReq = (url: string, body?: unknown, method = "POST") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function publicMethods(): Promise<string[]> {
  const res = await listExperiences(
    new Request(`http://localhost/api/v1/experiences?q=${encodeURIComponent(MARK)}&limit=50`),
    { params: Promise.resolve({}) },
  );
  const json = (await res.json()) as { items: { method: string }[] };
  return json.items.map((i) => i.method);
}

describe("仮データ: 生成 → 非公開で保存 → 1件ずつ公開/非公開/削除", () => {
  const created: { id: string; method: string }[] = [];

  it("テーマから 10 件生成でき、困りごとが具体化され、全件同一にならず、結果は 5 分類のみ", async () => {
    const res = await generate(
      asAdminReq("http://localhost/api/admin/seed-data/generate", { keyword: MARK, count: 10 }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      drafts: { method: string; result: string; difficulty: string | null }[];
    };
    expect(json.drafts).toHaveLength(10);

    for (const d of json.drafts) {
      // 入力キーワードがそのまま difficulty にならない
      expect(d.difficulty).not.toBe(MARK);
      // 「サンプル1」のような連番タイトルにならない
      expect(d.difficulty ?? "").not.toMatch(/(サンプル|テスト|例)\s*[0-9０-９]+/);
      // 具体的な行動・作業が「難しい／できない」形になっている
      expect(isConcreteDifficulty(d.difficulty, MARK)).toBe(true);
      // 結果は必ず 5 分類
      expect(["success", "partial", "no_change", "failed", "ongoing"]).toContain(d.result);
    }

    // 10 件が十分に異なる（困りごと・方法とも）
    expect(new Set(json.drafts.map((d) => d.difficulty)).size).toBe(10);
    expect(new Set(json.drafts.map((d) => d.method)).size).toBe(10);
  });

  it("保存すると全件が非公開 (isPublished=false / pending)、is_seed_data と ai_seed が立つ", async () => {
    const gen = await generate(
      asAdminReq("http://localhost/api/admin/seed-data/generate", { keyword: MARK, count: 10 }),
      { params: Promise.resolve({}) },
    );
    const { drafts } = (await gen.json()) as { drafts: unknown[] };

    const res = await createSeed(asAdminReq("http://localhost/api/admin/seed-data", { items: drafts }), {
      params: Promise.resolve({}),
    });
    expect(res.status).toBe(201);
    const { items } = (await res.json()) as {
      items: { id: string; isPublished: boolean; publishState: string; aiGenerated: boolean; attempts: { method: string }[] }[];
    };
    expect(items).toHaveLength(10);
    for (const it of items) {
      expect(it.isPublished).toBe(false);
      expect(it.publishState).toBe("private");
      expect(it.aiGenerated).toBe(true);
      expect(it.attempts).toHaveLength(1);
      created.push({ id: it.id, method: it.attempts[0].method });
    }

    // DB 上でも仮データフラグが立っている
    const rows = await prisma.road.findMany({
      where: { id: { in: created.map((c) => c.id) } },
      include: { attempts: true },
    });
    expect(rows).toHaveLength(10);
    for (const r of rows) {
      expect(r.isSeedData).toBe(true);
      expect(r.dataOrigin).toBe("ai_seed");
      expect(r.attempts).toHaveLength(1);
      expect(r.attempts[0].isPublished).toBe(false);
      expect(r.attempts[0].moderationStatus).toBe("pending");
    }
  });

  it("保存しただけでは一般の経験検索に出ない", async () => {
    const methods = await publicMethods();
    for (const c of created) expect(methods).not.toContain(c.method);
  });

  it("1 件だけ公開すると、その 1 件だけが検索に出る", async () => {
    const target = created[0];
    const res = await publishSeed(asAdminReq(`http://localhost/api/admin/seed-data/${target.id}/publish`), {
      params: Promise.resolve({ roadId: target.id }),
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { publishState: string; isPublished: boolean };
    expect(dto.isPublished).toBe(true);
    expect(dto.publishState).toBe("published");

    const methods = await publicMethods();
    expect(methods).toContain(target.method);
    // 他はまだ出ない
    for (const c of created.slice(1)) expect(methods).not.toContain(c.method);

    // 監査ログが残る
    const audit = await prisma.adminAuditLog.findFirst({
      where: { adminId: adminRef.id, action: "seed_publish" },
    });
    expect(audit).toBeTruthy();
  });

  it("一覧の表示切り替え（非公開／公開）でしぼり込める", async () => {
    // created[0] は直前のテストで公開済み、その他は非公開。
    const pub = (await (
      await listSeed(new Request("http://localhost/api/admin/seed-data?state=published"), {
        params: Promise.resolve({}),
      })
    ).json()) as { items: { id: string }[]; counts: { published: number; private: number } };
    expect(pub.items.some((i) => i.id === created[0].id)).toBe(true);
    expect(pub.items.some((i) => i.id === created[1].id)).toBe(false);
    expect(pub.counts.published).toBeGreaterThanOrEqual(1);

    const priv = (await (
      await listSeed(new Request("http://localhost/api/admin/seed-data"), {
        params: Promise.resolve({}),
      })
    ).json()) as { items: { id: string }[]; counts: { private: number } };
    // 公開済みは非公開の一覧には出ない（フィルタで完全に除外）。
    expect(priv.items.some((i) => i.id === created[0].id)).toBe(false);
    expect(priv.counts.private).toBeGreaterThanOrEqual(1);
  });

  it("公開済みの仮データを 1 件ずつ非公開に戻せる", async () => {
    const target = created[0];
    const res = await unpublishSeed(
      asAdminReq(`http://localhost/api/admin/seed-data/${target.id}/unpublish`),
      { params: Promise.resolve({ roadId: target.id }) },
    );
    expect(res.status).toBe(200);
    const methods = await publicMethods();
    expect(methods).not.toContain(target.method);
  });

  it("編集すると内容が変わる (PATCH)", async () => {
    const target = created[1];
    const res = await patchSeed(
      asAdminReq(
        `http://localhost/api/admin/seed-data/${target.id}`,
        { method: `${MARK} 手で少しずつ寄せる`, result: "partial" },
        "PATCH",
      ),
      { params: Promise.resolve({ roadId: target.id }) },
    );
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { attempts: { method: string; result: string }[] };
    expect(dto.attempts[0].method).toBe(`${MARK} 手で少しずつ寄せる`);
    expect(dto.attempts[0].result).toBe("partial");
    created[1].method = `${MARK} 手で少しずつ寄せる`;
  });

  it("1 件だけ削除でき、関連 Attempt も消える", async () => {
    const target = created[2];
    const res = await deleteSeed(
      asAdminReq(`http://localhost/api/admin/seed-data/${target.id}`, undefined, "DELETE"),
      { params: Promise.resolve({ roadId: target.id }) },
    );
    expect(res.status).toBe(204);
    expect(await prisma.road.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.attempt.count({ where: { roadId: target.id } })).toBe(0);
  });
});

describe("仮データ操作は実ユーザーデータを触れない", () => {
  let realRoadId = "";

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { googleSub: `${MARK}:real-owner` } });
    const road = await prisma.road.create({
      data: { userId: user.id, difficulty: `${MARK} 実ユーザーの困りごと` },
    });
    await prisma.attempt.create({
      data: { roadId: road.id, method: `${MARK} 実ユーザーの方法`, result: "success", isPublished: true, moderationStatus: "approved" },
    });
    realRoadId = road.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { googleSub: `${MARK}:real-owner` } });
  });

  it("実ユーザーの Road に対する PATCH は 404、行は残る", async () => {
    const res = await patchSeed(
      asAdminReq(`http://localhost/api/admin/seed-data/${realRoadId}`, { method: "書き換え" }, "PATCH"),
      { params: Promise.resolve({ roadId: realRoadId }) },
    );
    expect(res.status).toBe(404);
    expect(await prisma.road.findUnique({ where: { id: realRoadId } })).not.toBeNull();
  });

  it("実ユーザーの Road に対する publish は 404、公開状態は変わらない", async () => {
    const res = await publishSeed(
      asAdminReq(`http://localhost/api/admin/seed-data/${realRoadId}/publish`),
      { params: Promise.resolve({ roadId: realRoadId }) },
    );
    expect(res.status).toBe(404);
  });

  it("実ユーザーの Road に対する DELETE は 404、行は残る", async () => {
    const res = await deleteSeed(
      asAdminReq(`http://localhost/api/admin/seed-data/${realRoadId}`, undefined, "DELETE"),
      { params: Promise.resolve({ roadId: realRoadId }) },
    );
    expect(res.status).toBe(404);
    expect(await prisma.road.findUnique({ where: { id: realRoadId } })).not.toBeNull();
  });
});

describe("同じテーマを繰り返し生成しても内容が変わる（重複回避）", () => {
  const KW = `${MARK}-repeat 料理を作る`; // MARK でこの試験のデータだけを掃除できるように

  it("1回目を保存 → 2回目の生成は1回目と実質的に重複しない", async () => {
    // 1回目
    const g1 = await generate(
      asAdminReq("http://localhost/api/admin/seed-data/generate", { keyword: KW, count: 10 }),
      { params: Promise.resolve({}) },
    );
    const { drafts: d1 } = (await g1.json()) as { drafts: { difficulty: string | null; method: string }[] };
    expect(d1).toHaveLength(10);

    // 保存（keyword を添えて）
    const save = await createSeed(
      asAdminReq("http://localhost/api/admin/seed-data", { keyword: KW, items: d1 }),
      { params: Promise.resolve({}) },
    );
    expect(save.status).toBe(201);

    // 2回目 — ルートが過去データを読み、重複しない切り口を返す
    const g2 = await generate(
      asAdminReq("http://localhost/api/admin/seed-data/generate", { keyword: KW, count: 10 }),
      { params: Promise.resolve({}) },
    );
    const body2 = (await g2.json()) as {
      drafts: { difficulty: string | null; method: string }[];
      priorCount: number;
    };
    expect(body2.priorCount).toBeGreaterThanOrEqual(10);
    expect(body2.drafts).toHaveLength(10);

    const set1 = new Set(d1.map((d) => d.difficulty));
    for (const d of body2.drafts) {
      expect(set1.has(d.difficulty)).toBe(false);
    }
    // 2回目どうしにも実質的な重複がない
    expect(new Set(body2.drafts.map((d) => d.difficulty)).size).toBe(10);
  });

  it("保存せず exclude を渡して連続再生成しても、毎回ちがう困りごとになる", async () => {
    const kw = `${MARK}-again デスクワーク`;
    const seen = new Set<string>();
    let exclude: { difficulty: string | null; method: string; result?: string }[] = [];

    for (let round = 1; round <= 3; round++) {
      const res = await generate(
        asAdminReq("http://localhost/api/admin/seed-data/generate", { keyword: kw, count: 10, exclude }),
        { params: Promise.resolve({}) },
      );
      expect(res.status).toBe(200);
      const { drafts } = (await res.json()) as {
        drafts: { difficulty: string | null; method: string; result: string }[];
      };
      expect(drafts).toHaveLength(10);
      // これまでの回に出た困りごとが再登場しない（再検索のたびに変わる）
      for (const d of drafts) {
        expect(seen.has(d.difficulty ?? "")).toBe(false);
        seen.add(d.difficulty ?? "");
      }
      // クライアントと同じく、出した分を除外リストへ積む
      exclude = [
        ...exclude,
        ...drafts.map((d) => ({ difficulty: d.difficulty, method: d.method, result: d.result })),
      ];
    }
    expect(seen.size).toBe(30); // 3 回 × 10 件、すべて別
  });
});

describe("スペース区切りのキーワード = 複数テーマ横断", () => {
  it("1 バッチで全テーマを取り上げ、10 件とも具体的な困りごとになる", async () => {
    const keyword = `${MARK}a ${MARK}b`;
    const res = await generate(
      asAdminReq("http://localhost/api/admin/seed-data/generate", { keyword, count: 10 }),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const { drafts } = (await res.json()) as {
      drafts: { difficulty: string | null; method: string; situation: string | null }[];
    };
    expect(drafts).toHaveLength(10);
    for (const d of drafts) {
      expect(isConcreteDifficulty(d.difficulty, keyword)).toBe(true);
      expect(d.difficulty).not.toBe(keyword);
    }
    // 両テーマが situation に現れる（スタブ経路: テーマを件ごとに割り当て）
    const sit = drafts.map((d) => d.situation ?? "");
    expect(sit.some((s) => s.includes(`${MARK}a`))).toBe(true);
    expect(sit.some((s) => s.includes(`${MARK}b`))).toBe(true);
  });
});

describe("権限: 管理者以外は仮データ API を呼べない", () => {
  it("requireAdminApi が 401 を投げると生成も一覧も 401", async () => {
    vi.mocked(requireAdminApi).mockRejectedValue(new ApiError("unauthorized", "管理者ログインが必要です"));

    const gen = await generate(
      asAdminReq("http://localhost/api/admin/seed-data/generate", { keyword: MARK, count: 5 }),
      { params: Promise.resolve({}) },
    );
    expect(gen.status).toBe(401);

    const list = await listSeed(new Request("http://localhost/api/admin/seed-data"), {
      params: Promise.resolve({}),
    });
    expect(list.status).toBe(401);
  });
});
