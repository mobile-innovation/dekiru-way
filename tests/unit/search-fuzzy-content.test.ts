import { describe, it, expect } from "vitest";
import { contentTokens } from "@/lib/search-fuzzy";

/** 表記ゆれ検索の内容語（語尾だけの一致を除くための手がかり）。DB は使わない。 */
describe("contentTokens", () => {
  it("漢字は 1 文字ずつ、ひらがなの語尾は含めない", () => {
    expect(contentTokens("字が読みづらくなった")).toEqual(["字", "読"]);
    expect(contentTokens("つめが切りにくい")).toEqual(["切"]);
  });

  it("カタカナは 2 文字以上の並びを 1 語として扱い、半角カナは全角に揃える", () => {
    expect(contentTokens("ﾍﾟｯﾄﾎﾞﾄﾙが開けにくい")).toEqual(["開", "ペットボトル"]);
  });

  it("ひらがなだけの検索語は内容語なし（条件を掛けない）", () => {
    expect(contentTokens("くすり")).toEqual([]);
    expect(contentTokens("つめがきりにくい")).toEqual([]);
  });

  it("「出来」「難し」など言い回しに使われる表記は内容語にしない", () => {
    expect(contentTokens("階段の上り下りが出来ない")).toEqual(["階", "段", "上", "下"]);
    expect(contentTokens("難しい")).toEqual([]);
    expect(contentTokens("分かりにくい")).toEqual([]);
  });
});
