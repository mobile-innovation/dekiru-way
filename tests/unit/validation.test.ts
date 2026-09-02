import { describe, it, expect } from "vitest";
import {
  roadCreateSchema,
  attemptCreateSchema,
  experienceQuerySchema,
} from "@/lib/validation";

describe("attemptCreateSchema", () => {
  it("method は必須", () => {
    const r = attemptCreateSchema.safeParse({ method: "  ", result: "success" });
    expect(r.success).toBe(false);
  });

  it("result は 5 分類のみ許可 (指示書 4)", () => {
    for (const result of ["success", "partial", "no_change", "failed", "ongoing"]) {
      expect(attemptCreateSchema.safeParse({ method: "x", result }).success).toBe(true);
    }
    expect(attemptCreateSchema.safeParse({ method: "x", result: "maybe" }).success).toBe(false);
  });

  it("failed も success と同じく通る (指示書 23)", () => {
    const r = attemptCreateSchema.safeParse({ method: "だめだった方法", result: "failed" });
    expect(r.success).toBe(true);
  });

  it("triedAt は YYYY-MM-DD か null", () => {
    expect(attemptCreateSchema.safeParse({ method: "x", result: "success", triedAt: "2025-01-02" }).success).toBe(true);
    expect(attemptCreateSchema.safeParse({ method: "x", result: "success", triedAt: "2025/01/02" }).success).toBe(false);
  });

  it("v6: できた％ は 0〜100 の整数、または null/未指定", () => {
    const base = { method: "x", result: "success" as const };
    expect(attemptCreateSchema.safeParse({ ...base, achievementPercent: 0 }).success).toBe(true);
    expect(attemptCreateSchema.safeParse({ ...base, achievementPercent: 100 }).success).toBe(true);
    expect(attemptCreateSchema.safeParse({ ...base, achievementPercent: 60 }).success).toBe(true);
    expect(attemptCreateSchema.safeParse({ ...base, achievementPercent: 101 }).success).toBe(false);
    expect(attemptCreateSchema.safeParse({ ...base, achievementPercent: -5 }).success).toBe(false);
    expect(attemptCreateSchema.safeParse({ ...base, achievementPercent: null }).success).toBe(true);
    expect(attemptCreateSchema.safeParse({ ...base }).success).toBe(true);
  });

  it("v6: previousAttemptId は UUID か null", () => {
    const base = { method: "x", result: "success" as const };
    expect(
      attemptCreateSchema.safeParse({
        ...base,
        previousAttemptId: "00000000-0000-0000-0000-000000000000",
      }).success,
    ).toBe(true);
    expect(attemptCreateSchema.safeParse({ ...base, previousAttemptId: "nope" }).success).toBe(false);
    expect(attemptCreateSchema.safeParse({ ...base, previousAttemptId: null }).success).toBe(true);
  });
});

describe("roadCreateSchema", () => {
  it("空文字は null に正規化される", () => {
    const r = roadCreateSchema.parse({ difficulty: "  ", goal: "歩きたい" });
    expect(r.difficulty).toBeNull();
    expect(r.goal).toBe("歩きたい");
  });

  it("visibility は private/public のみ", () => {
    expect(roadCreateSchema.safeParse({ visibility: "secret" }).success).toBe(false);
  });

  it("タグは最大 10 個", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(roadCreateSchema.safeParse({ tags }).success).toBe(false);
  });
});

describe("experienceQuerySchema", () => {
  it("既定値: page=1 limit=20 sort=recent", () => {
    const r = experienceQuerySchema.parse({});
    expect(r).toMatchObject({ page: 1, limit: 20, sort: "recent" });
  });
  it("limit は 50 で頭打ち", () => {
    expect(experienceQuerySchema.safeParse({ limit: "999" }).success).toBe(false);
  });
});
