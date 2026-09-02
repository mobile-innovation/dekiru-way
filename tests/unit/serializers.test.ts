import { describe, it, expect } from "vitest";
import { sortAttemptsChronologically, serializeExperience } from "@/lib/serializers";

describe("sortAttemptsChronologically", () => {
  it("triedAt 優先、なければ createdAt で昇順に並ぶ", () => {
    const rows = [
      { triedAt: new Date("2025-03-01"), createdAt: new Date("2025-01-01") },
      { triedAt: null, createdAt: new Date("2025-02-01") },
      { triedAt: new Date("2025-01-15"), createdAt: new Date("2025-05-01") },
    ];
    const sorted = [...rows].sort(sortAttemptsChronologically);
    expect(sorted.map((r) => r.createdAt.toISOString().slice(0, 10))).toEqual([
      "2025-05-01", // triedAt 2025-01-15
      "2025-02-01", // triedAt null -> createdAt 2025-02-01
      "2025-01-01", // triedAt 2025-03-01
    ]);
  });
});

describe("serializeExperience", () => {
  const base = {
    id: "a1",
    roadId: "r1",
    method: "やってみた",
    result: "partial" as const,
    triedAt: new Date("2025-02-02"),
    memo: null,
    isPublished: true,
    createdAt: new Date("2025-02-01"),
    updatedAt: new Date("2025-02-01"),
    photos: [],
    road: {
      previouslyAble: null,
      difficulty: "むずかしい",
      goal: null,
      situation: null,
      progress: null,
      nextAction: null,
      startedAt: null,
      roadTags: [{ tag: { name: "手先" } }],
    },
  };

  it("日付は ISO / YYYY-MM-DD 文字列になる", () => {
    const dto = serializeExperience(base as any);
    expect(dto.triedAt).toBe("2025-02-02");
    expect(dto.road.difficulty).toBe("むずかしい");
    expect(dto.road.tags).toEqual(["手先"]);
    expect(dto.siblings).toBeUndefined();
  });

  it("siblings 指定時は現在の attempt に isCurrent が立つ", () => {
    const sibling = { ...base, id: "a2", method: "べつの方法" };
    const dto = serializeExperience(base as any, { siblings: [base, sibling] as any });
    expect(dto.siblings).toHaveLength(2);
    expect(dto.siblings!.find((s) => s.id === "a1")!.isCurrent).toBe(true);
    expect(dto.siblings!.find((s) => s.id === "a2")!.isCurrent).toBe(false);
  });
});
