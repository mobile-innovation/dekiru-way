import { describe, it, expect } from "vitest";
import { enforceRateLimit } from "@/lib/ratelimit";
import { ApiError } from "@/lib/api";

describe("enforceRateLimit", () => {
  it("上限までは通り、超えると rate_limited を投げる", () => {
    const key = `test:${Math.random()}`;
    const opts = { key, limit: 3, windowMs: 10_000 };
    enforceRateLimit(opts);
    enforceRateLimit(opts);
    enforceRateLimit(opts);
    expect(() => enforceRateLimit(opts)).toThrowError(ApiError);
    try {
      enforceRateLimit(opts);
    } catch (e) {
      expect((e as ApiError).code).toBe("rate_limited");
    }
  });

  it("キーが違えば独立してカウントする", () => {
    const a = { key: `a:${Math.random()}`, limit: 1, windowMs: 10_000 };
    const b = { key: `b:${Math.random()}`, limit: 1, windowMs: 10_000 };
    enforceRateLimit(a);
    expect(() => enforceRateLimit(b)).not.toThrow();
  });
});
