import { describe, it, expect } from "vitest";
import { adContextFromText } from "@/lib/ads";

describe("adContextFromText（広告カテゴリ推定）", () => {
  it("既知の動作キーワードを非個人的なカテゴリに変換する", () => {
    expect(adContextFromText("靴下を履くのが難しい")).toEqual({
      category: "clothing",
      subCategory: "dressing_support",
    });
    expect(adContextFromText("片手で料理したい")).toEqual({
      category: "cooking",
      subCategory: "kitchen_support",
    });
    expect(adContextFromText("文字を書くのが難しくなった")).toEqual({
      category: "writing",
      subCategory: "writing_support",
    });
    expect(adContextFromText("駅の階段がこわい")?.category).toBe("mobility");
  });

  it("該当キーワードが無ければ null（生テキストは返さない）", () => {
    expect(adContextFromText("なにか漠然とした困りごと")).toBeNull();
    expect(adContextFromText("")).toBeNull();
    expect(adContextFromText(null)).toBeNull();
    expect(adContextFromText(undefined)).toBeNull();
  });

  it("戻り値はカテゴリ ID のみで、入力文字列を一切含まない", () => {
    const secret = "麻痺で靴下がはけない 山田太郎 東京都";
    const ctx = adContextFromText(secret);
    // 「靴下」で clothing にマッチするが、氏名・住所・病名は出力に含まれない
    expect(ctx).toEqual({ category: "clothing", subCategory: "dressing_support" });
    expect(JSON.stringify(ctx)).not.toMatch(/麻痺|山田|東京/);
  });

  it("病名・健康状態だけの文字列はカテゴリにしない", () => {
    expect(adContextFromText("関節リウマチ")).toBeNull();
    expect(adContextFromText("脳梗塞の後遺症")).toBeNull();
  });
});
