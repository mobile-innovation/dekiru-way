import { describe, it, expect, beforeEach } from "vitest";
import { assistExperienceSearch } from "@/lib/ai/client";

/**
 * assistExperienceSearch は expandSearchIntent に委譲する薄いラッパ。
 * AI 未設定でも決定的に動き、terms は空にならない。keywords は terms の先頭 5 件（後方互換）。
 */
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("assistExperienceSearch", () => {
  it("terms の先頭は元フレーズ、keywords はその先頭 5 件", async () => {
    const res = await assistExperienceSearch("料理 包丁 まな板 火 やけど こわい 手元");
    expect(res.terms[0]).toBe("料理 包丁 まな板 火 やけど こわい 手元");
    expect(res.keywords).toEqual(res.terms.slice(0, 5));
    expect(res.keywords.length).toBeLessThanOrEqual(5);
    expect(res.rephrased).toBe("料理 包丁 まな板 火 やけど こわい 手元");
    expect(res.disclaimer).toMatch(/診断/);
  });

  it("短い入力でも keywords / terms が対応する", async () => {
    const res = await assistExperienceSearch("ボタンがとめにくい");
    expect(res.terms).toContain("ボタンがとめにくい");
    expect(res.keywords).toEqual(res.terms.slice(0, 5));
  });

  it("空文字なら terms も keywords も空", async () => {
    const res = await assistExperienceSearch("");
    expect(res.terms).toEqual([]);
    expect(res.keywords).toEqual([]);
    expect(res.disclaimer).toMatch(/診断/);
  });
});
