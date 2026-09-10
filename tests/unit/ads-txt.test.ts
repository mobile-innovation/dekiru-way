import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/ads.txt/route";

/**
 * `/ads.txt` — AdSense のパブリッシャ ID 設定時だけ配信、未設定なら 404。
 * この挙動は環境変数だけで決まるので、tests/setup.ts が読み込む .env の値に
 * 左右されないよう、各テストの前後で明示的にクリアする。
 */

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
});

describe("GET /ads.txt", () => {
  it("ADSENSE_CLIENT 未設定なら 404", async () => {
    const res = GET();
    expect(res.status).toBe(404);
  });

  it("ADSENSE_CLIENT 設定時は ca- を外した pub-ID で ads.txt を返す", async () => {
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT = "ca-pub-1234567890123456";
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const body = await res.text();
    expect(body.trim()).toBe("google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0");
  });
});
