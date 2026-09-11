import { describe, it, expect, beforeEach } from "vitest";
import { localExpand, normalizeIntent, expandSearchIntent } from "@/lib/ai/search";

// AI 未設定＝決定的なローカル展開経路をテストする。
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("localExpand", () => {
  it("元フレーズを先頭に、空白区切りの語を続ける", () => {
    expect(localExpand("靴下 ボタン")).toEqual({
      terms: ["靴下 ボタン", "靴下", "ボタン"],
      rephrased: "靴下 ボタン",
    });
  });

  it("全角スペースでも区切る", () => {
    expect(localExpand("料理　包丁　まな板").terms).toEqual(["料理　包丁　まな板", "料理", "包丁", "まな板"]);
  });

  it("読点・中黒などの区切り記号でも分割する", () => {
    expect(localExpand("階段、下り・こわい").terms).toEqual(["階段、下り・こわい", "階段", "下り", "こわい"]);
  });

  it("かっこは区切り扱い、1 文字語は捨てる", () => {
    // 「服」は 1 文字なので語にしない
    expect(localExpand("「ボタン」がとめにくい(服)").terms).toEqual([
      "「ボタン」がとめにくい(服)",
      "ボタン",
      "がとめにくい",
    ]);
  });

  it("区切りが無い日本語文はフレーズ 1 語になる", () => {
    expect(localExpand("靴下がうまく履けない").terms).toEqual(["靴下がうまく履けない"]);
  });

  it("重複語をまとめる", () => {
    expect(localExpand("ボタン ボタン とめる").terms).toEqual(["ボタン ボタン とめる", "ボタン", "とめる"]);
  });

  it("30 字を超える区切り無しフレーズは 30 字に丸めて 1 語だけ返す", () => {
    const long = "あ".repeat(35);
    expect(localExpand(long).terms).toEqual([long.slice(0, 30)]);
  });

  it("terms は必ず 1 つ以上返す", () => {
    expect(localExpand("あ").terms.length).toBeGreaterThan(0);
    expect(localExpand("   ").terms.length).toBeGreaterThan(0);
  });

  it("前後の空白は落とす", () => {
    expect(localExpand("  ボタン  ").rephrased).toBe("ボタン");
    expect(localExpand("  ボタン  ").terms[0]).toBe("ボタン");
  });
});

describe("normalizeIntent", () => {
  it("文字列以外・空・長すぎる語・重複を落とし、元フレーズを先頭に入れる", () => {
    const res = normalizeIntent(
      { terms: ["ボタン", "ボタン", 123, "   ", "x".repeat(40)], rephrased: "服のボタンがとめにくい" },
      "ボタンがとめにくい",
    );
    expect(res.terms).toEqual(["ボタンがとめにくい", "ボタン"]);
    expect(res.rephrased).toBe("服のボタンがとめにくい");
  });

  it("大文字小文字違いの重複は 1 つにまとめ、最初の表記を残す", () => {
    const res = normalizeIntent({ terms: ["ADHD", "adhd", "Adhd"] }, "集中がむずかしい");
    expect(res.terms).toEqual(["集中がむずかしい", "ADHD"]);
  });

  it("元フレーズ＋AI語の合計を 8 語で打ち切る", () => {
    const res = normalizeIntent(
      { terms: Array.from({ length: 20 }, (_, i) => `語${i}`) },
      "元フレーズ",
    );
    expect(res.terms).toHaveLength(8);
    expect(res.terms[0]).toBe("元フレーズ");
  });

  it("元フレーズが 30 字超なら terms からは外れ、AI 語だけが残る", () => {
    const longPhrase = "x".repeat(40);
    const res = normalizeIntent({ terms: ["ボタン"] }, longPhrase);
    expect(res.terms).toEqual(["ボタン"]);
  });

  it("terms が配列でない（文字列・null・オブジェクト）でも安全", () => {
    for (const bad of ["ボタン", null, { 0: "ボタン" }, 42] as unknown[]) {
      const res = normalizeIntent({ terms: bad }, "つめ切りがむずかしい");
      expect(res.terms).toEqual(["つめ切りがむずかしい"]);
    }
  });

  it("オブジェクトでない AI 出力でも安全（元フレーズだけになる）", () => {
    for (const bad of ["これは壊れた出力", null, undefined, 42, []] as unknown[]) {
      const res = normalizeIntent(bad, "アイロンがけが難しい");
      expect(res.terms).toEqual(["アイロンがけが難しい"]);
      expect(res.rephrased).toBe("アイロンがけが難しい");
    }
  });

  it("terms が全滅しても localExpand で埋めるので空にならない", () => {
    const res = normalizeIntent({ terms: [1, 2, 3] }, "つめ切り");
    expect(res.terms.length).toBeGreaterThan(0);
  });

  it("rephrased が文字列でない / 空 / 長すぎるときは元フレーズにフォールバック", () => {
    expect(normalizeIntent({ terms: ["x"], rephrased: 123 }, "まぶしさがつらい").rephrased).toBe(
      "まぶしさがつらい",
    );
    expect(normalizeIntent({ terms: ["x"], rephrased: "   " }, "まぶしさがつらい").rephrased).toBe(
      "まぶしさがつらい",
    );
    expect(
      normalizeIntent({ terms: ["x"], rephrased: "あ".repeat(300) }, "まぶしさがつらい").rephrased,
    ).toBe("まぶしさがつらい");
  });

  it("妥当な rephrased はそのまま採用（前後空白のみ除去）", () => {
    expect(
      normalizeIntent({ terms: ["x"], rephrased: "  服のボタンがとめにくい  " }, "ボタン").rephrased,
    ).toBe("服のボタンがとめにくい");
  });
});

describe("expandSearchIntent（AI 未設定）", () => {
  it("source は fallback、terms の先頭は元フレーズ", async () => {
    const intent = await expandSearchIntent("ボタンがとめにくい");
    expect(intent.source).toBe("fallback");
    expect(intent.terms[0]).toBe("ボタンがとめにくい");
    expect(intent.disclaimer).toMatch(/診断/);
  });

  it("空白区切りは複数 terms になる（従来キーワード検索の複数語に相当）", async () => {
    const intent = await expandSearchIntent("料理 包丁 こわい");
    expect(intent.terms).toEqual(["料理 包丁 こわい", "料理", "包丁", "こわい"]);
  });

  it("2 文字未満は terms を広げない", async () => {
    expect((await expandSearchIntent("")).terms).toEqual([]);
    expect((await expandSearchIntent("   ")).terms).toEqual([]);
    expect((await expandSearchIntent("  a ")).terms).toEqual(["a"]);
  });

  it("null / undefined を渡しても落ちない", async () => {
    expect((await expandSearchIntent(undefined as unknown as string)).terms).toEqual([]);
    expect((await expandSearchIntent(null as unknown as string)).source).toBe("fallback");
  });
});
