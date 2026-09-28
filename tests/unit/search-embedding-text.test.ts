import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildRoadEmbeddingText,
  buildAttemptEmbeddingText,
  normalizeEmbeddingValue,
  type RoadEmbeddingInput,
  type AttemptEmbeddingInput,
} from "@/lib/search-embedding-text";

const FULL_ROAD: RoadEmbeddingInput = {
  difficulty: "ボタンがとめにくい",
  situation: "シャツを着るとき",
  goal: "一人で着替えたい",
  previouslyAble: "朝の着替えは自分でしていた",
  tags: ["着替え", "衣服"],
};

/** 空のラベル行・"null"/"undefined" の文字列化が無いことの共通チェック。 */
function expectClean(text: string) {
  expect(text).not.toMatch(/undefined|null|NaN|\[object/);
  for (const l of text.split("\n")) {
    if (text === "") break;
    expect(l).toMatch(/^[^：]+：\S/); // 「ラベル：値」で値が必ずある
  }
  expect(text).toBe(text.trim());
}

describe("buildRoadEmbeddingText", () => {
  it("1. 全項目がある場合: 項目ごとに「ラベル：値」の行になる", () => {
    const text = buildRoadEmbeddingText(FULL_ROAD);
    expect(text).toBe(
      [
        "できなくなったこと：ボタンがとめにくい",
        "困っている場面：シャツを着るとき",
        "できるようになりたいこと：一人で着替えたい",
        "以前できていたこと：朝の着替えは自分でしていた",
        // タグは並び順を固定（日本語ロケール順）するため入力順とは限らない
        "タグ：衣服、着替え",
      ].join("\n"),
    );
    expectClean(text);
  });

  it("2. situation が空なら「困っている場面」の行ごと出さない", () => {
    for (const situation of ["", "   ", "　", null, undefined]) {
      const text = buildRoadEmbeddingText({ ...FULL_ROAD, situation });
      expect(text).not.toContain("困っている場面");
      expect(text.split("\n")).toHaveLength(4);
      expectClean(text);
    }
  });

  it("3. goal が空なら「できるようになりたいこと」の行ごと出さない", () => {
    const text = buildRoadEmbeddingText({ ...FULL_ROAD, goal: "" });
    expect(text).not.toContain("できるようになりたいこと");
    expectClean(text);
  });

  it("4. previouslyAble が空文字・空白のみ（schema 上は真偽値ではなく自由記述の文字列）なら行を出さない", () => {
    for (const previouslyAble of ["", " \n\t "]) {
      const text = buildRoadEmbeddingText({ ...FULL_ROAD, previouslyAble });
      expect(text).not.toContain("以前できていたこと");
      expectClean(text);
    }
  });

  it("5. previouslyAble が null / undefined なら行を出さない", () => {
    expect(buildRoadEmbeddingText({ ...FULL_ROAD, previouslyAble: null })).not.toContain(
      "以前できていたこと",
    );
    const { previouslyAble: _omit, ...rest } = FULL_ROAD;
    expect(buildRoadEmbeddingText(rest)).not.toContain("以前できていたこと");
  });

  it("6. タグが複数: 正規化・重複除去・並び順固定のうえ「、」区切りで 1 行", () => {
    const text = buildRoadEmbeddingText({
      difficulty: "ボタンがとめにくい",
      tags: ["衣服", " 着替え ", "衣服", "", null, undefined, "手先"],
    });
    const expected = ["衣服", "着替え", "手先"].sort((a, b) => a.localeCompare(b, "ja"));
    expect(text).toBe(`できなくなったこと：ボタンがとめにくい\nタグ：${expected.join("、")}`);
    // 入力の並びが違っても同じ結果（DB の取得順に左右されない）
    expect(
      buildRoadEmbeddingText({ difficulty: "ボタンがとめにくい", tags: ["手先", "着替え", "衣服"] }),
    ).toBe(text);
  });

  it("7. タグが無い（空配列 / null / undefined / 空文字だけ）なら「タグ」の行を出さない", () => {
    for (const tags of [[], null, undefined, ["", "  "]]) {
      const text = buildRoadEmbeddingText({ ...FULL_ROAD, tags });
      expect(text).not.toContain("タグ");
      expectClean(text);
    }
  });

  it("8. 日本語の文章はそのまま保持される（語句の削除・言い換えをしない）", () => {
    const difficulty =
      "朝、シャツの小さいボタンをとめようとしても、指先に力が入らず、10分以上かかってしまう。";
    const text = buildRoadEmbeddingText({ difficulty });
    expect(text).toBe(`できなくなったこと：${difficulty}`);
    // 全角英数・半角カナ・記号も NFKC のような変換はしない
    const mixed = "ＡＢＣ１２３とｶﾀｶﾅ、①「かっこ」？！";
    expect(buildRoadEmbeddingText({ goal: mixed })).toBe(`できるようになりたいこと：${mixed}`);
  });

  it("全項目が空なら空文字（ラベルだけの行を返さない）", () => {
    expect(buildRoadEmbeddingText({})).toBe("");
    expect(
      buildRoadEmbeddingText({
        difficulty: null,
        situation: "",
        goal: "  ",
        previouslyAble: undefined,
        tags: [],
      }),
    ).toBe("");
  });
});

describe("buildAttemptEmbeddingText", () => {
  it("1. method + memo", () => {
    expect(
      buildAttemptEmbeddingText({
        method: "ボタンエイドを使った",
        memo: "最初は慣れなかったが、1週間で使えるようになった",
      }),
    ).toBe(
      "試したこと：ボタンエイドを使った\nメモ・気づき：最初は慣れなかったが、1週間で使えるようになった",
    );
  });

  it("2. memo が空なら method の行だけ", () => {
    for (const memo of ["", "  ", null, undefined]) {
      expect(buildAttemptEmbeddingText({ method: "ボタンエイドを使った", memo })).toBe(
        "試したこと：ボタンエイドを使った",
      );
    }
  });

  it("3. method が空なら memo の行だけ", () => {
    expect(buildAttemptEmbeddingText({ method: "", memo: "少し楽になった" })).toBe(
      "メモ・気づき：少し楽になった",
    );
  });

  it("4. 両方空なら空文字", () => {
    expect(buildAttemptEmbeddingText({ method: "", memo: null })).toBe("");
    expect(buildAttemptEmbeddingText({})).toBe("");
  });

  it("5. 日本語が保持される", () => {
    const method = "マジックテープ式のシャツに替えてみた（家族に相談して）";
    const memo = "うまくいかなかった。生地が合わず、結局もとのシャツに戻した。";
    expect(buildAttemptEmbeddingText({ method, memo })).toBe(
      `試したこと：${method}\nメモ・気づき：${memo}`,
    );
  });
});

describe("共通", () => {
  afterEach(() => vi.restoreAllMocks());

  const roadCases: RoadEmbeddingInput[] = [
    FULL_ROAD,
    {},
    { difficulty: null, situation: undefined, goal: "", previouslyAble: " ", tags: null },
    { difficulty: "ふたが開けにくい", tags: [null, undefined, ""] },
  ];
  const attemptCases: AttemptEmbeddingInput[] = [
    { method: "ゴム手袋を使った", memo: null },
    { method: undefined, memo: undefined },
    { method: null, memo: "" },
  ];

  it("undefined / null が文字列化されず、空のラベル行も残らない", () => {
    for (const c of roadCases) expectClean(buildRoadEmbeddingText(c));
    for (const c of attemptCases) expectClean(buildAttemptEmbeddingText(c));
  });

  it("同じ入力なら同じ結果（入力を書き換えない）", () => {
    const input = structuredClone(FULL_ROAD);
    const a = buildRoadEmbeddingText(input);
    const b = buildRoadEmbeddingText(input);
    expect(a).toBe(b);
    expect(input).toEqual(FULL_ROAD);
    expect(buildAttemptEmbeddingText({ method: "x", memo: "y" })).toBe(
      buildAttemptEmbeddingText({ method: "x", memo: "y" }),
    );
  });

  it("外部 API（fetch）を呼ばない", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    buildRoadEmbeddingText(FULL_ROAD);
    buildAttemptEmbeddingText({ method: "ボタンエイドを使った", memo: "メモ" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("正規化は最小限: 改行・タブ・全角スペースの連続を半角スペース 1 つに、制御文字を除去", () => {
    expect(normalizeEmbeddingValue("  ボタンが\r\n\r\nとめにくい\t　 とき  ")).toBe(
      "ボタンが とめにくい とき",
    );
    expect(normalizeEmbeddingValue("ボタン\u0000が\u0007とめにくい")).toBe("ボタンがとめにくい");
    // 濁点の結合文字 (か + ゛) は NFC で合成済みの「が」に揃える（意味は同じ）
    expect(normalizeEmbeddingValue("\u304b\u3099")).toBe("が");
    expect(normalizeEmbeddingValue(null)).toBe("");
    expect(normalizeEmbeddingValue(undefined)).toBe("");
    expect(normalizeEmbeddingValue(123)).toBe("");
  });
});
