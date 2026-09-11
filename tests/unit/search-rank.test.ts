import { describe, it, expect } from "vitest";
import { scoreText, rankBySearchRelevance, RANK_WEIGHT } from "@/lib/search-rank";

describe("scoreText", () => {
  it("terms が空ならスコア 0", () => {
    expect(scoreText([{ text: "靴下を履く", weight: 3 }], [])).toBe(0);
  });

  it("全フィールドが空でもスコア 0（落ちない）", () => {
    expect(scoreText([{ text: null, weight: 3 }, { text: "", weight: 2 }], ["靴下"])).toBe(0);
  });

  it("部分一致は weight、完全一致は weight の 2 倍を加点する", () => {
    expect(scoreText([{ text: "靴下がうまく履けない", weight: 3 }], ["靴下"])).toBe(3);
    expect(scoreText([{ text: "靴下", weight: 3 }], ["靴下"])).toBe(6);
  });

  it("複数フィールド・複数語で加点が積み上がる", () => {
    const fields = [
      { text: "ボタンがとめにくい", weight: RANK_WEIGHT.road },
      { text: "片手でボタンを留める練習をした", weight: RANK_WEIGHT.method },
    ];
    // "ボタン" が両フィールドに（3 + 2）、"留める" が method のみ（2）
    expect(scoreText(fields, ["ボタン", "留める"])).toBe(RANK_WEIGHT.road + RANK_WEIGHT.method * 2);
  });

  it("大文字小文字を無視する（完全一致も）", () => {
    expect(scoreText([{ text: "ADHD の特性", weight: 2 }], ["adhd"])).toBe(2);
    expect(scoreText([{ text: "ADHD", weight: 2 }], ["adhd"])).toBe(4);
  });

  it("同じ語が 1 フィールド内に複数回あってもそのフィールドの加点は 1 回", () => {
    expect(scoreText([{ text: "ボタン ボタン ボタン", weight: 3 }], ["ボタン"])).toBe(3);
  });

  it("空白だけの語は無視する", () => {
    expect(scoreText([{ text: "ボタンの練習", weight: 3 }], ["   ", "ボタン"])).toBe(3);
  });

  it("weight 0 のフィールドは一致しても加点しない", () => {
    expect(scoreText([{ text: "ボタン", weight: 0 }], ["ボタン"])).toBe(0);
  });

  it("前後の空白を無視して完全一致と判定する", () => {
    expect(scoreText([{ text: "  ボタン  ", weight: 3 }], ["ボタン"])).toBe(6);
  });

  it("RANK_WEIGHT は road=3 / method=2（queries.ts の重み付けの前提）", () => {
    expect(RANK_WEIGHT).toEqual({ road: 3, method: 2 });
  });
});

describe("rankBySearchRelevance", () => {
  const toFields = (x: { d: string; m: string }) => [
    { text: x.d, weight: RANK_WEIGHT.road },
    { text: x.m, weight: RANK_WEIGHT.method },
  ];

  it("スコアが高い順に並べ替える", () => {
    const items = [
      { d: "関係ない困りごと", m: "関係ない方法" },
      { d: "ボタンがとめにくい", m: "ボタンエイドを使った" },
      { d: "服を選ぶのがつらい", m: "ボタンの話が少し出た" },
    ];
    const ranked = rankBySearchRelevance(items, ["ボタン"], toFields);
    expect(ranked[0]).toBe(items[1]); // difficulty+method 両方一致
    expect(ranked[1]).toBe(items[2]); // method のみ一致
    expect(ranked[2]).toBe(items[0]); // 不一致
  });

  it("同点は入力順を保つ（安定ソート）", () => {
    const items = [
      { d: "a ボタン", m: "x" },
      { d: "b ボタン", m: "y" },
      { d: "c ボタン", m: "z" },
    ];
    const ranked = rankBySearchRelevance(items, ["ボタン"], toFields);
    expect(ranked).toEqual(items);
  });

  it("terms が空なら並べ替えず同じ配列を返す", () => {
    const items = [{ d: "1", m: "1" }, { d: "2", m: "2" }];
    expect(rankBySearchRelevance(items, [], toFields)).toBe(items);
  });

  it("items が空なら何もしない", () => {
    expect(rankBySearchRelevance([], ["ボタン"], toFields)).toEqual([]);
  });

  it("入力配列を破壊しない（新しい配列を返す）", () => {
    const items = [
      { d: "関係ない", m: "関係ない" },
      { d: "ボタンがとめにくい", m: "ボタン" },
    ];
    const snapshot = [...items];
    const ranked = rankBySearchRelevance(items, ["ボタン"], toFields);
    expect(items).toEqual(snapshot); // 元は並び替わっていない
    expect(ranked).not.toBe(items);
    expect(ranked[0]).toBe(items[1]);
  });

  it("toFields が空配列を返す項目はスコア 0 として入力順を保つ", () => {
    const items = [{ d: "ボタン", m: "ボタン" }, { d: "ボタン", m: "ボタン" }];
    const ranked = rankBySearchRelevance(items, ["ボタン"], () => []);
    expect(ranked).toEqual(items);
  });

  it("複数語のうちどれか 1 つでも当たれば加点され、多く当たる項目が上に来る", () => {
    const items = [
      { d: "洗濯物をたたむ", m: "くつ下だけ触れた" }, // "くつ下" 1 語
      { d: "くつ下を履く", m: "かかとを入れる練習をした" }, // "くつ下" + "かかと"
    ];
    const ranked = rankBySearchRelevance(items, ["くつ下", "かかと"], toFields);
    expect(ranked[0]).toBe(items[1]);
  });
});
