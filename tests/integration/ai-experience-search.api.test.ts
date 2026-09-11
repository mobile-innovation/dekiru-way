import { describe, it, expect, beforeEach } from "vitest";
import { POST as experienceSearch } from "@/app/api/v1/ai/experience-search/route";

/**
 * POST /api/v1/ai/experience-search（検索意図の展開・Phase 1）。
 * ANTHROPIC_API_KEY 未設定＝決定的なローカル展開経路で検証する。
 */

const emptyCtx = { params: Promise.resolve({}) };

let ip = 0;
function req(body: unknown, headers: Record<string, string> = {}) {
  // レート制限バケットはクライアント IP 単位。テストごとに別 IP を使って隔離する。
  return new Request("http://localhost/api/v1/ai/experience-search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/v1/ai/experience-search", () => {
  it("situation から terms / keywords / rephrased / disclaimer を返す", async () => {
    const res = await experienceSearch(req({ situation: "ボタンがとめにくい" }), emptyCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      keywords: string[];
      terms: string[];
      rephrased: string;
      disclaimer: string;
    };
    expect(Array.isArray(body.terms)).toBe(true);
    expect(body.terms[0]).toBe("ボタンがとめにくい");
    expect(body.keywords).toEqual(body.terms.slice(0, 5));
    expect(body.rephrased).toBe("ボタンがとめにくい");
    expect(body.disclaimer).toMatch(/診断/);
  });

  it("空白区切りの situation は複数 terms になる", async () => {
    const res = await experienceSearch(req({ situation: "料理 包丁 やけど" }), emptyCtx);
    const body = (await res.json()) as { terms: string[] };
    expect(body.terms).toEqual(expect.arrayContaining(["料理", "包丁", "やけど"]));
  });

  it("situation が無ければ 400", async () => {
    const res = await experienceSearch(req({}), emptyCtx);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("bad_request");
  });

  it("situation が空文字なら 400", async () => {
    const res = await experienceSearch(req({ situation: "   " }), emptyCtx);
    expect(res.status).toBe(400);
  });

  it("situation が 1000 字を超えると 400", async () => {
    const res = await experienceSearch(req({ situation: "あ".repeat(1001) }), emptyCtx);
    expect(res.status).toBe(400);
  });

  it("壊れた JSON ボディは 400", async () => {
    const res = await experienceSearch(req("{ not json"), emptyCtx);
    expect(res.status).toBe(400);
  });

  it("別オリジンからの POST は 403（同一オリジン強制）", async () => {
    const res = await experienceSearch(
      req({ situation: "ボタン" }, { origin: "http://evil.example" }),
      emptyCtx,
    );
    expect(res.status).toBe(403);
  });

  it("同一 IP から 15 回を超えると 429（ai プリセット）", async () => {
    const fixed = { "x-forwarded-for": "10.9.255.255" };
    const codes: number[] = [];
    for (let i = 0; i < 17; i++) {
      const res = await experienceSearch(req({ situation: `試行 ${i}` }, fixed), emptyCtx);
      codes.push(res.status);
    }
    expect(codes.slice(0, 15)).toEqual(Array(15).fill(200));
    expect(codes[15]).toBe(429);
    expect(codes[16]).toBe(429);
  });
});
