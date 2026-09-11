import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * expandSearchIntent の「AI が有効」分岐。`@/lib/ai/client` の callJson を差し替えて、
 * AI 応答の正規化・source 判定・失敗時フォールバックを確かめる。
 */

const callJson = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/client", () => ({
  callJson,
  DISCLAIMER: "これは経験を整理するための参考情報です。診断や治療の答えではありません。",
}));

import { expandSearchIntent } from "@/lib/ai/search";

// AI 応答の想定値。各テストで書き換える。callJson は実物と同じく {...fallback, ...parsed} を返す。
let aiResponse: Record<string, unknown>;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key"; // env.ai.configured を true に
  aiResponse = {};
  callJson.mockReset();
  callJson.mockImplementation(async (_prompt: string, fallback: unknown) => ({
    ...(fallback as object),
    ...aiResponse,
  }));
});

describe("expandSearchIntent（AI 有効）", () => {
  it("正常な AI 応答なら source=ai、元フレーズを先頭に、AI 語を続ける", async () => {
    aiResponse = { terms: ["服のボタン", "留め具", "着替え"], rephrased: "服のボタンがとめにくい" };
    const intent = await expandSearchIntent("ボタンがとめにくい");

    expect(intent.source).toBe("ai");
    expect(intent.terms[0]).toBe("ボタンがとめにくい");
    expect(intent.terms).toContain("留め具");
    expect(intent.rephrased).toBe("服のボタンがとめにくい");
    expect(intent.disclaimer).toMatch(/診断/);
  });

  it("callJson には (プロンプト, フォールバック, 専用システムプロンプト) が渡る", async () => {
    aiResponse = { terms: ["階段"], rephrased: "階段の上り下りがこわい" };
    await expandSearchIntent("階段がこわい");

    expect(callJson).toHaveBeenCalledTimes(1);
    const [prompt, fallback, system] = callJson.mock.calls[0];
    expect(prompt).toContain("階段がこわい");
    expect(fallback).toMatchObject({ terms: expect.any(Array), rephrased: "階段がこわい" });
    expect(typeof system).toBe("string");
    expect(system).toMatch(/検索語|検索補助/);
  });

  it("AI が壊れた terms（非文字列・空白・長すぎ）を返しても正規化される", async () => {
    aiResponse = { terms: ["ボタン", 42, null, "   ", "x".repeat(50)], rephrased: 123 };
    const intent = await expandSearchIntent("ボタンがとめにくい");

    expect(intent.terms).toEqual(["ボタンがとめにくい", "ボタン"]);
    expect(intent.rephrased).toBe("ボタンがとめにくい"); // 数値 rephrased は捨てて元フレーズ
    expect(intent.source).toBe("ai");
  });

  it("AI 語が多すぎても元フレーズ込みで 8 語に丸める", async () => {
    aiResponse = { terms: Array.from({ length: 30 }, (_, i) => `関連語${i}`) };
    const intent = await expandSearchIntent("まぶしさがつらい");

    expect(intent.terms).toHaveLength(8);
    expect(intent.terms[0]).toBe("まぶしさがつらい");
  });

  it("AI が使える語を返さないときはローカル展開で terms を埋める（空にしない）", async () => {
    aiResponse = { terms: [], rephrased: "" };
    const intent = await expandSearchIntent("つめ切りがむずかしい");

    expect(intent.terms.length).toBeGreaterThan(0);
    expect(intent.terms[0]).toBe("つめ切りがむずかしい");
  });

  it("callJson がフォールバック値をそのまま返した（AI 失敗の合図）なら source=fallback", async () => {
    callJson.mockImplementation(async (_p: string, fallback: unknown) => fallback);
    const intent = await expandSearchIntent("ボタンがとめにくい");

    expect(intent.source).toBe("fallback");
    expect(intent.terms[0]).toBe("ボタンがとめにくい");
  });

  it("2 文字未満なら AI を呼ばない", async () => {
    const intent = await expandSearchIntent("あ");
    expect(callJson).not.toHaveBeenCalled();
    expect(intent.source).toBe("fallback");
  });

  it("ANTHROPIC_API_KEY 未設定なら AI を呼ばず fallback", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const intent = await expandSearchIntent("ボタンがとめにくい");
    expect(callJson).not.toHaveBeenCalled();
    expect(intent.source).toBe("fallback");
  });
});
