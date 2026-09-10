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

  it("road.isSeed は既定 false、仮データ Road なら true", () => {
    expect(serializeExperience(base as any).road.isSeed).toBe(false);
    const seed = { ...base, road: { ...base.road, isSeedData: true } };
    expect(serializeExperience(seed as any).road.isSeed).toBe(true);
  });

  it("siblings 指定時は現在の attempt に isCurrent が立つ", () => {
    const sibling = { ...base, id: "a2", method: "べつの方法" };
    const dto = serializeExperience(base as any, { siblings: [base, sibling] as any });
    expect(dto.siblings).toHaveLength(2);
    expect(dto.siblings!.find((s) => s.id === "a1")!.isCurrent).toBe(true);
    expect(dto.siblings!.find((s) => s.id === "a2")!.isCurrent).toBe(false);
  });

  describe("like（いいね状態・数は含めない）", () => {
    const withOwner = { ...base, road: { ...base.road, userId: "u-owner" } };

    it("viewer 無し → すべて false", () => {
      expect(serializeExperience(withOwner as any).like).toEqual({
        isMine: false,
        canLike: false,
        likedByMe: false,
      });
    });

    it("他人が閲覧 → canLike true、いいね済みなら likedByMe true", () => {
      const dto = serializeExperience(withOwner as any, {
        viewer: { userId: "u-other", likedAttemptIds: new Set(["a1"]) },
      });
      expect(dto.like).toEqual({ isMine: false, canLike: true, likedByMe: true });
    });

    it("投稿者本人が閲覧 → isMine true / canLike false", () => {
      const dto = serializeExperience(withOwner as any, { viewer: { userId: "u-owner" } });
      expect(dto.like).toEqual({ isMine: true, canLike: false, likedByMe: false });
    });

    it("DTO にいいね数のキーは無い", () => {
      const dto = serializeExperience(withOwner as any, { viewer: { userId: "u-other" } });
      expect(JSON.stringify(dto)).not.toMatch(/count/i);
    });
  });

  describe("isRead（既読・数は含めない）", () => {
    it("viewer 無し → false", () => {
      expect(serializeExperience(base as any).isRead).toBe(false);
    });
    it("readAttemptIds に入っていれば true", () => {
      const dto = serializeExperience(base as any, {
        viewer: { userId: "u1", readAttemptIds: new Set(["a1"]) },
      });
      expect(dto.isRead).toBe(true);
    });
    it("readAttemptIds に無ければ false", () => {
      const dto = serializeExperience(base as any, {
        viewer: { userId: "u1", readAttemptIds: new Set(["other"]) },
      });
      expect(dto.isRead).toBe(false);
    });
  });
});
