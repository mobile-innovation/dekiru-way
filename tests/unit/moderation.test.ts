import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ModerationStatus } from "@prisma/client";

// 実 AI は呼ばない。キーありのケースでは callJson に渡る審査本文だけを検証する。
vi.mock("@/lib/ai/client", () => ({
  callJson: vi.fn(async (_prompt: string, fallback: unknown) => fallback),
  DISCLAIMER: "テスト用の注意書き",
}));

import { callJson } from "@/lib/ai/client";
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

describe("モデレーション: 審査本文 (H-2)", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.ANTHROPIC_API_KEY;
    // ダミーキー (callJson はモック済みなので外部には出ない)
    process.env.ANTHROPIC_API_KEY = "test-dummy-not-a-real-key";
    vi.mocked(callJson).mockClear();
  });
  afterEach(() => {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    else delete process.env.ANTHROPIC_API_KEY;
  });

  const promptOf = () => String(vi.mocked(callJson).mock.calls[0]?.[0] ?? "");

  it("道の progress (いまの進捗) が審査本文に含まれる", async () => {
    await moderateAttemptContent({
      method: "手すりをつけた",
      road: { difficulty: "立ち上がれない", progress: "進捗に書いた内容 090-0000-0000" },
    });
    expect(callJson).toHaveBeenCalledTimes(1);
    expect(promptOf()).toContain("いまの進捗: 進捗に書いた内容 090-0000-0000");
  });

  it("道の nextAction (道で次に試すこと) が審査本文に含まれる", async () => {
    await moderateAttemptContent({
      method: "手すりをつけた",
      road: { difficulty: "立ち上がれない", nextAction: "道の次の一手 https://example.com" },
    });
    expect(callJson).toHaveBeenCalledTimes(1);
    expect(promptOf()).toContain("道で次に試すこと: 道の次の一手 https://example.com");
  });

  it("試したこと側の nextAction とは別ラベルで並ぶ", async () => {
    await moderateAttemptContent({
      method: "手すりをつけた",
      nextAction: "試したことの次",
      road: { nextAction: "道の次" },
    });
    expect(promptOf()).toContain("次に試すこと: 試したことの次");
    expect(promptOf()).toContain("道で次に試すこと: 道の次");
  });

  it("progress / nextAction だけが入っていても審査対象になる (空扱いで ok にしない)", async () => {
    await moderateAttemptContent({ method: "  ", road: { progress: "進捗だけ" } });
    expect(callJson).toHaveBeenCalledTimes(1);
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
