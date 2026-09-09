import { describe, it, expect } from "vitest";
import { assertSameOrigin, ApiError } from "@/lib/api";

/**
 * 書き込み API は同一オリジンからのみ (CSRF 対策の二重防御)。
 * .env で SITE_URL=http://localhost:3000 が読まれている前提。
 */

function req(
  method: string,
  headers: Record<string, string> = {},
  url = "http://localhost:3000/api/v1/roads",
) {
  return new Request(url, { method, headers });
}

const forbidden = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return e instanceof ApiError && e.code === "forbidden";
  }
  return false;
};

describe("assertSameOrigin", () => {
  it("GET / HEAD / OPTIONS は常に通す (Sec-Fetch-Site がクロスでも)", () => {
    for (const m of ["GET", "HEAD", "OPTIONS"]) {
      expect(() => assertSameOrigin(req(m, { "sec-fetch-site": "cross-site" }))).not.toThrow();
    }
  });

  it("Sec-Fetch-Site: same-origin / same-site の書き込みは通す", () => {
    expect(() => assertSameOrigin(req("POST", { "sec-fetch-site": "same-origin" }))).not.toThrow();
    expect(() => assertSameOrigin(req("DELETE", { "sec-fetch-site": "same-site" }))).not.toThrow();
  });

  it("Sec-Fetch-Site: cross-site の書き込みは 403", () => {
    expect(forbidden(() => assertSameOrigin(req("POST", { "sec-fetch-site": "cross-site" })))).toBe(true);
    expect(forbidden(() => assertSameOrigin(req("PATCH", { "sec-fetch-site": "none" })))).toBe(true);
  });

  it("Sec-Fetch-Site が無く Origin が自オリジンなら通す", () => {
    expect(() =>
      assertSameOrigin(req("POST", { origin: "http://localhost:3000" })),
    ).not.toThrow();
  });

  it("Sec-Fetch-Site が無く Origin がリクエスト自身のホストなら通す (プロキシ/複数ドメイン)", () => {
    expect(() =>
      assertSameOrigin(
        req("POST", { origin: "https://app.example.com", host: "app.example.com" }, "https://app.example.com/api/v1/roads"),
      ),
    ).not.toThrow();
  });

  it("Sec-Fetch-Site が無く Origin が別オリジンなら 403", () => {
    expect(forbidden(() => assertSameOrigin(req("POST", { origin: "https://evil.example" })))).toBe(true);
  });

  it("Sec-Fetch-Site も Origin も無い (非ブラウザ / テスト / サーバ間) は通す", () => {
    expect(() => assertSameOrigin(req("POST"))).not.toThrow();
    expect(() => assertSameOrigin(req("DELETE"))).not.toThrow();
  });
});
