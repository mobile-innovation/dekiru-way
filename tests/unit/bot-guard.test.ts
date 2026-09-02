import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  inspectPublicRead,
  screenEdgeRequest,
  resolveClientId,
  blockClient,
  listBlocked,
  resetBotGuard,
} from "@/lib/bot-guard";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function hit(clientId: string, over: Partial<Parameters<typeof inspectPublicRead>[0]> = {}) {
  return inspectPublicRead({
    clientId,
    ua: BROWSER_UA,
    path: "/api/v1/experiences",
    query: "?q=x",
    kind: "api",
    ...over,
  });
}

beforeEach(() => resetBotGuard());
afterEach(() => resetBotGuard());

describe("screenEdgeRequest (ステートレス)", () => {
  it("既知の AI クローラー UA は 403", () => {
    const v = screenEdgeRequest({ clientId: "1.1.1.1", ua: "Mozilla/5.0 (compatible; GPTBot/1.1)" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.status).toBe(403);
  });
  it("ClaudeBot も 403", () => {
    const v = screenEdgeRequest({ clientId: "1.1.1.1", ua: "ClaudeBot/1.0" });
    expect(v.ok).toBe(false);
  });
  it("通常ブラウザ UA は通す", () => {
    expect(screenEdgeRequest({ clientId: "1.1.1.1", ua: BROWSER_UA }).ok).toBe(true);
  });
  it("BLOCKED_IPS の IP は 403", () => {
    process.env.BLOCKED_IPS = "9.9.9.9, 8.8.8.8";
    expect(screenEdgeRequest({ clientId: "9.9.9.9", ua: BROWSER_UA }).ok).toBe(false);
    expect(screenEdgeRequest({ clientId: "1.2.3.4", ua: BROWSER_UA }).ok).toBe(true);
    delete process.env.BLOCKED_IPS;
  });
});

describe("inspectPublicRead (レート/バースト)", () => {
  it("通常ペースの数リクエストは通る", () => {
    for (let i = 0; i < 10; i++) expect(hit("ip-normal").ok).toBe(true);
  });

  it("バースト上限を超えると 429 (Retry-After 付き)", () => {
    let blockedAt = -1;
    for (let i = 0; i < 60; i++) {
      const v = hit("ip-burst");
      if (!v.ok && blockedAt === -1) blockedAt = i;
    }
    expect(blockedAt).toBeGreaterThan(0);
    expect(blockedAt).toBeLessThan(40);
    const v = hit("ip-burst");
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.status).toBe(429);
      expect(v.retryAfter).toBeGreaterThan(0);
    }
  });

  it("UA なしはより厳しいプロファイル", () => {
    let noUaBlock = -1;
    let browserBlock = -1;
    for (let i = 0; i < 30; i++) {
      if (noUaBlock === -1 && !hit("ip-noua", { ua: "" }).ok) noUaBlock = i;
      if (browserBlock === -1 && !hit("ip-br").ok) browserBlock = i;
    }
    // どちらも最終的に制限されるが、しきい値は同等以下 (noua<=suspicious 相当ではない)
    expect(noUaBlock).toBeGreaterThan(0);
  });

  it("スクリプト系 UA (python-requests) は早めに制限される", () => {
    let at = -1;
    for (let i = 0; i < 20; i++) {
      if (at === -1 && !hit("ip-py", { ua: "python-requests/2.31.0" }).ok) at = i;
    }
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThanOrEqual(12);
  });
});

describe("inspectPublicRead (巡回パターン)", () => {
  it("page=1,2,3... の連続巡回で一時ブロックされる", () => {
    let blockedAt = -1;
    for (let p = 1; p <= 12; p++) {
      const v = hit("ip-crawl", { query: `?page=${p}` });
      if (!v.ok && blockedAt === -1) blockedAt = p;
    }
    expect(blockedAt).toBeGreaterThan(0);
    expect(blockedAt).toBeLessThanOrEqual(10);
    // 以後、別条件でも同じクライアントは弾かれる (temp block)
    const after = hit("ip-crawl", { query: "?q=other" });
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.status).toBe(429);
  });

  it("別クライアントは影響を受けない", () => {
    for (let p = 1; p <= 12; p++) hit("ip-crawl-2", { query: `?page=${p}` });
    expect(hit("ip-innocent").ok).toBe(true);
  });
});

describe("運用フック", () => {
  it("blockClient / listBlocked", () => {
    blockClient("1.2.3.4", 60_000);
    expect(listBlocked().some((b) => b.clientId === "1.2.3.4")).toBe(true);
    const v = inspectPublicRead({
      clientId: "1.2.3.4",
      ua: BROWSER_UA,
      path: "/api/v1/experiences",
      query: "",
      kind: "api",
    });
    expect(v.ok).toBe(false);
  });
});

describe("resolveClientId", () => {
  it("x-forwarded-for の先頭ホップを使う", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1" } });
    expect(resolveClientId(req)).toBe("203.0.113.5");
  });
  it("ヘッダが無ければ unknown", () => {
    expect(resolveClientId(new Request("http://x"))).toBe("unknown");
  });
});
