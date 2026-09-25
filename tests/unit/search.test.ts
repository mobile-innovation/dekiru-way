import { describe, it, expect } from "vitest";
import {
  buildExperienceWhere,
  buildExperienceOrderBy,
  buildRoadLevelSearchWhere,
  buildMethodSearchWhere,
  readFilterWhere,
} from "@/lib/search";

describe("buildExperienceWhere", () => {
  it("公開かつ Attempt が承認済みに限定する（道自体の承認は問わない）", () => {
    const where = buildExperienceWhere({});
    expect(where.AND).toContainEqual({
      isPublished: true,
      moderationStatus: "approved",
    });
  });

  it("result 指定を AND 条件に足す", () => {
    const where = buildExperienceWhere({ result: "failed" });
    expect(where.AND).toContainEqual({ result: "failed" });
  });

  it("キーワードは指定カラム横断の OR になる (指示書 13)", () => {
    const where = buildExperienceWhere({ q: "ボタン" });
    const orClause = (where.AND as any[]).find((c) => c.OR);
    const keys = orClause.OR.flatMap((o: any) =>
      o.road?.is ? Object.keys(o.road.is) : Object.keys(o),
    );
    expect(keys).toEqual(
      expect.arrayContaining(["method", "memo", "difficulty", "situation", "goal", "previouslyAble"]),
    );
  });

  it("タグ指定は road 経由で解決する", () => {
    const where = buildExperienceWhere({ tag: "手先" });
    const tagClause = (where.AND as any[]).find((c) => c.road?.roadTags);
    expect(tagClause).toBeTruthy();
  });

  it("opts.terms を渡すと語ごとに同じ対象カラムの OR が増える（検索AI Phase 1）", () => {
    const where = buildExperienceWhere({}, undefined, { terms: ["ボタン", "留め具"] });
    const orClause = (where.AND as any[]).find((c) => c.OR);
    // 1 語あたり 7 節（method/memo/difficulty/situation/goal/previouslyAble/tag）× 2 語
    expect(orClause.OR).toHaveLength(14);
    const contains = orClause.OR.filter((o: any) => o.method).map((o: any) => o.method.contains);
    expect(contains).toEqual(["ボタン", "留め具"]);
  });

  it("opts 無し（第 3 引数なし）は従来の単一語 where と変わらない", () => {
    const a = buildExperienceWhere({ q: "ボタン" });
    const b = buildExperienceWhere({ q: "ボタン" }, undefined);
    expect(a).toEqual(b);
    const or = (a.AND as any[]).find((c) => c.OR);
    expect(or.OR).toHaveLength(7);
  });
});

describe("readFilterWhere（既読 / 未読の絞り込み）", () => {
  it("read も viewer も無ければ null（絞り込まない）", () => {
    expect(readFilterWhere(undefined, "u1")).toBeNull();
    expect(readFilterWhere("read", null)).toBeNull();
    expect(readFilterWhere("read", undefined)).toBeNull();
  });
  it("read=read は viewer の read が存在する条件", () => {
    expect(readFilterWhere("read", "u1")).toEqual({ reads: { some: { userId: "u1" } } });
  });
  it("read=unread は viewer の read が存在しない条件", () => {
    expect(readFilterWhere("unread", "u1")).toEqual({
      NOT: { reads: { some: { userId: "u1" } } },
    });
  });
  it("buildExperienceWhere に viewer 付きで反映される", () => {
    const where = buildExperienceWhere({ read: "unread" }, "u1");
    expect(where.AND).toContainEqual({ NOT: { reads: { some: { userId: "u1" } } } });
    // 未ログインなら反映しない
    const anon = buildExperienceWhere({ read: "unread" });
    expect((anon.AND as any[]).some((c) => c.NOT || c.reads)).toBe(false);
  });
});

describe("buildRoadLevelSearchWhere", () => {
  it("「承認済みの公開経験を 1 つ以上持つ道」に限定し、道自体の承認状態は条件にしない", () => {
    const where = buildRoadLevelSearchWhere({});
    const clause = (where.AND as any[]).find((c) => c.attempts?.some);
    expect(clause.attempts.some).toMatchObject({ isPublished: true, moderationStatus: "approved" });
    expect((where.AND as any[]).some((c) => "moderationStatus" in c)).toBe(false);
  });
});

describe("buildRoadLevelSearchWhere（道の既読 / 未読）", () => {
  it("read=read は「読んだ公開経験を持つ道」", () => {
    const where = buildRoadLevelSearchWhere({ read: "read" }, "u1");
    const clause = (where.AND as any[]).find((c) => c.attempts?.some?.reads);
    expect(clause.attempts.some.reads).toEqual({ some: { userId: "u1" } });
  });
  it("read=unread は「読んだ公開経験を 1 つも持たない道」", () => {
    const where = buildRoadLevelSearchWhere({ read: "unread" }, "u1");
    const clause = (where.AND as any[]).find((c) => c.attempts?.none?.reads);
    expect(clause.attempts.none.reads).toEqual({ some: { userId: "u1" } });
  });
  it("未ログインなら既読の絞り込みは付かない", () => {
    const where = buildRoadLevelSearchWhere({ read: "unread" });
    expect((where.AND as any[]).some((c) => c.attempts?.none || c.attempts?.some?.reads)).toBe(false);
  });
});

describe("検索AI Phase 1: opts.terms（複数語ハイブリッド絞り込み）", () => {
  it("buildRoadLevelSearchWhere は語ごとに road 側 5 カラムの OR を増やす", () => {
    const where = buildRoadLevelSearchWhere({}, undefined, { terms: ["ボタン", "留め具"] });
    const or = (where.AND as any[]).find((c) => c.OR);
    // difficulty / situation / goal / previouslyAble / tag = 5 節 × 2 語
    expect(or.OR).toHaveLength(10);
    const diffContains = or.OR.filter((o: any) => o.difficulty).map((o: any) => o.difficulty.contains);
    expect(diffContains).toEqual(["ボタン", "留め具"]);
    // method は road 検索の対象外（従来どおり）
    expect(or.OR.some((o: any) => "method" in o)).toBe(false);
  });

  it("buildMethodSearchWhere は語ごとに method / memo の OR を増やす", () => {
    const where = buildMethodSearchWhere({}, undefined, { terms: ["ボタン", "留め具"] });
    const or = (where.AND as any[]).find((c) => c.OR);
    expect(or.OR).toHaveLength(4);
    expect(or.OR.map((o: any) => (o.method ? "method" : "memo"))).toEqual([
      "method",
      "memo",
      "method",
      "memo",
    ]);
  });

  it("opts.terms は q.q より優先される", () => {
    const where = buildExperienceWhere({ q: "無視される" }, undefined, { terms: ["採用される"] });
    const or = (where.AND as any[]).find((c) => c.OR);
    expect(or.OR.some((o: any) => o.method?.contains === "採用される")).toBe(true);
    expect(or.OR.some((o: any) => o.method?.contains === "無視される")).toBe(false);
  });

  it("opts.terms の各語は前後空白を除去して使う", () => {
    const where = buildMethodSearchWhere({}, undefined, { terms: ["  ボタン  "] });
    const or = (where.AND as any[]).find((c) => c.OR);
    expect(or.OR[0].method.contains).toBe("ボタン");
  });

  it("空白だけ / 空文字の terms は無視して q.q にフォールバックする", () => {
    const where = buildExperienceWhere({ q: "ボタン" }, undefined, { terms: ["  ", ""] });
    const or = (where.AND as any[]).find((c) => c.OR);
    expect(or.OR).toHaveLength(7); // 単一語 = 従来どおり
    expect(or.OR[0].method.contains).toBe("ボタン");
  });

  it("terms も q.q も無ければキーワード OR 句を足さない", () => {
    const where = buildExperienceWhere({}, undefined, { terms: [] });
    expect((where.AND as any[]).some((c) => c.OR)).toBe(false);
  });

  it("terms と tag / result は AND で併存する", () => {
    const where = buildExperienceWhere({ tag: "手先", result: "partial" }, undefined, {
      terms: ["ボタン", "留め具"],
    });
    expect(where.AND).toContainEqual({ result: "partial" });
    expect((where.AND as any[]).some((c) => c.road?.roadTags)).toBe(true);
    expect((where.AND as any[]).some((c) => c.OR?.length === 14)).toBe(true);
  });
});

describe("resolveTerms: 空白区切りの複数語は単語ごとにも OR で照合する（「つめ　切り」で0件だった報告の修正）", () => {
  it("空白（半角）を含む q.q は、フレーズ全体 + 各単語の OR になる", () => {
    const where = buildExperienceWhere({ q: "つめ 切り" });
    const or = (where.AND as any[]).find((c) => c.OR);
    const methodContains = or.OR.filter((o: any) => o.method).map((o: any) => o.method.contains);
    expect(methodContains).toEqual(["つめ 切り", "つめ", "切り"]);
  });

  it("全角スペースでも同様に単語ごとに割る", () => {
    const where = buildExperienceWhere({ q: "つめ　切り" });
    const or = (where.AND as any[]).find((c) => c.OR);
    const methodContains = or.OR.filter((o: any) => o.method).map((o: any) => o.method.contains);
    expect(methodContains).toEqual(["つめ　切り", "つめ", "切り"]);
  });

  it("空白を含まない 1 語だけの q.q は従来と完全に同じ（単一語のまま）", () => {
    const withSpace = buildExperienceWhere({ q: "ボタン" });
    const or = (withSpace.AND as any[]).find((c) => c.OR);
    expect(or.OR).toHaveLength(7); // 1 語ぶんのみ（従来どおり）
    expect(or.OR[0].method.contains).toBe("ボタン");
  });

  it("buildRoadLevelSearchWhere / buildMethodSearchWhere にも同様に反映される", () => {
    const road = buildRoadLevelSearchWhere({ q: "つめ 切り" });
    const roadOr = (road.AND as any[]).find((c) => c.OR);
    expect(roadOr.OR.filter((o: any) => o.difficulty).map((o: any) => o.difficulty.contains)).toEqual([
      "つめ 切り",
      "つめ",
      "切り",
    ]);

    const method = buildMethodSearchWhere({ q: "つめ 切り" });
    const methodOr = (method.AND as any[]).find((c) => c.OR);
    expect(methodOr.OR.filter((o: any) => o.method).map((o: any) => o.method.contains)).toEqual([
      "つめ 切り",
      "つめ",
      "切り",
    ]);
  });

  it("opts.ids を渡すと terms/q.q による OR は使わず、id 一覧だけで絞り込む（表記ゆれ検索用）", () => {
    const where = buildExperienceWhere({ q: "無視される" }, undefined, { ids: ["a1", "a2"] });
    expect(where.AND).toContainEqual({ id: { in: ["a1", "a2"] } });
    expect((where.AND as any[]).some((c) => c.OR)).toBe(false);
  });
});

describe("buildExperienceOrderBy", () => {
  it("recent は createdAt 降順", () => {
    expect(buildExperienceOrderBy("recent")).toEqual([{ createdAt: "desc" }]);
  });
  it("tried は triedAt 降順 (null last)", () => {
    expect(buildExperienceOrderBy("tried")[0]).toEqual({ triedAt: { sort: "desc", nulls: "last" } });
  });
  it("helpful は result 昇順を先頭に", () => {
    expect(buildExperienceOrderBy("helpful")[0]).toEqual({ result: "asc" });
  });
});
