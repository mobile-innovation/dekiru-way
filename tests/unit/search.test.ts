import { describe, it, expect } from "vitest";
import { buildExperienceWhere, buildExperienceOrderBy } from "@/lib/search";

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
