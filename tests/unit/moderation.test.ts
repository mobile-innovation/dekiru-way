import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ModerationStatus } from "@prisma/client";
import { moderateAttemptContent } from "@/lib/ai/moderation";
import { publishStateOf, PUBLISH_STATE_LABEL } from "@/lib/publish-state";
import { deriveManualModerationAction } from "@/lib/admin/audit";

describe("モデレーション (AIキー未設定)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  });

  it("投稿: キーが無ければ verdict=unknown を返す (運営レビューへ)", async () => {
    const res = await moderateAttemptContent({ method: "手すりをつけた", road: null });
    expect(res.verdict).toBe("unknown");
    expect(res.categories).toEqual([]);
    expect(res.reason).toBeTruthy();
  });

  it("投稿: 方法本文が空でも道の記述・タグがあれば審査対象になる (キー無しで unknown)", async () => {
    const res = await moderateAttemptContent({
      method: "  ",
      road: { difficulty: "ボタンをとめられない", tags: ["個人情報っぽいタグ"] },
    });
    expect(res.verdict).toBe("unknown");
  });

  it("投稿: 方法本文も道の情報もすべて空なら AI を呼ばず ok", async () => {
    const res = await moderateAttemptContent({
      method: "  ",
      road: { difficulty: "", goal: null, tags: [] },
    });
    expect(res.verdict).toBe("ok");
  });
});

describe("deriveManualModerationAction (監査ログの action 判定)", () => {
  const { pending, approved, rejected } = ModerationStatus;

  it("pending → approved は approve (republish ではない)", () => {
    expect(deriveManualModerationAction(pending, approved)).toBe("approve");
  });
  it("rejected → approved は republish", () => {
    expect(deriveManualModerationAction(rejected, approved)).toBe("republish");
  });
  it("approved → pending は unpublish", () => {
    expect(deriveManualModerationAction(approved, pending)).toBe("unpublish");
  });
  it("rejected → pending は requeue (approve と誤表示しない)", () => {
    expect(deriveManualModerationAction(rejected, pending)).toBe("requeue");
  });
  it("pending → rejected は reject", () => {
    expect(deriveManualModerationAction(pending, rejected)).toBe("reject");
  });
  it("approved → rejected は reject", () => {
    expect(deriveManualModerationAction(approved, rejected)).toBe("reject");
  });
});

describe("publishStateOf", () => {
  it("非公開", () => {
    expect(publishStateOf({ isPublished: false, moderationStatus: ModerationStatus.approved })).toBe(
      "private",
    );
  });
  it("公開 + 承認 = published", () => {
    expect(publishStateOf({ isPublished: true, moderationStatus: ModerationStatus.approved })).toBe(
      "published",
    );
  });
  it("公開 + pending = reviewing", () => {
    expect(publishStateOf({ isPublished: true, moderationStatus: ModerationStatus.pending })).toBe(
      "reviewing",
    );
  });
  it("公開 + rejected = rejected", () => {
    expect(publishStateOf({ isPublished: true, moderationStatus: ModerationStatus.rejected })).toBe(
      "rejected",
    );
  });
  it("ラベルが 4 状態そろっている", () => {
    expect(Object.keys(PUBLISH_STATE_LABEL).sort()).toEqual(
      ["private", "published", "rejected", "reviewing"].sort(),
    );
  });
});
