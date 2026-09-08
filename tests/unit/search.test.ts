import { describe, it, expect } from "vitest";
import {
  buildExperienceWhere,
  buildExperienceOrderBy,
  buildRoadLevelSearchWhere,
  readFilterWhere,
} from "@/lib/search";

describe("buildExperienceWhere", () => {
  it("公開かつ Attempt も親 Road も承認済みに限定する", () => {
    const where = buildExperienceWhere({});
    expect(where.AND).toContainEqual({
      isPublished: true,
      moderationStatus: "approved",
      road: { is: { moderationStatus: "approved" } },
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
