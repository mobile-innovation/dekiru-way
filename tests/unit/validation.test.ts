import { describe, it, expect } from "vitest";
import {
  roadCreateSchema,
  attemptCreateSchema,
  experienceQuerySchema,
  quickExperienceSchema,
} from "@/lib/validation";
import { ATTEMPT_RESULTS } from "@/lib/constants";

describe("attemptCreateSchema", () => {
  it("method は必須", () => {
    const r = attemptCreateSchema.safeParse({ method: "  ", result: "success" });
    expect(r.success).toBe(false);
  });

  it("result は 5 分類のみ許可 (指示書 4)", () => {
    for (const result of ["success", "partial", "no_change", "failed", "ongoing"]) {
      expect(attemptCreateSchema.safeParse({ method: "x", result }).success).toBe(true);
    }
    expect(attemptCreateSchema.safeParse({ method: "x", result: "maybe" }).success).toBe(false);
  });

  it("failed も success と同じく通る (指示書 23)", () => {
    const r = attemptCreateSchema.safeParse({ method: "だめだった方法", result: "failed" });
    expect(r.success).toBe(true);
  });

  it("triedAt は YYYY-MM-DD か null", () => {
    expect(attemptCreateSchema.safeParse({ method: "x", result: "success", triedAt: "2025-01-02" }).success).toBe(true);
    expect(attemptCreateSchema.safeParse({ method: "x", result: "success", triedAt: "2025/01/02" }).success).toBe(false);
  });

  it("できた％／気持ち／その後／前に試した方法は登録項目から外され、送っても無視される（登録画面・登録項目 更新指示書）", () => {
    const base = { method: "x", result: "success" as const };
    const r = attemptCreateSchema.safeParse({
      ...base,
      achievementPercent: 60,
      feeling: "うれしい",
      stateAfter: "できるようになった",
      previousAttemptId: "00000000-0000-0000-0000-000000000000",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // zod は未知キーを黙って除去する（エラーにはしない）ので、パース結果にそもそも残らない。
      expect(r.data).not.toHaveProperty("achievementPercent");
      expect(r.data).not.toHaveProperty("feeling");
      expect(r.data).not.toHaveProperty("stateAfter");
      expect(r.data).not.toHaveProperty("previousAttemptId");
    }
  });
});

describe("roadCreateSchema", () => {
  // previouslyAble / difficulty / goal は「できる道」の中心となる変化を必ず残すための必須項目
  // (登録画面・登録項目 更新指示書 §4/§21/§25)。
  const REQUIRED_BASE = {
    previouslyAble: "以前はできていた",
    difficulty: "できなくなった",
    goal: "できるようになりたい",
  };

  it("difficulty / goal は必須（空白だけも不可）", () => {
    expect(roadCreateSchema.safeParse(REQUIRED_BASE).success).toBe(true);
    expect(roadCreateSchema.safeParse({ ...REQUIRED_BASE, difficulty: "  " }).success).toBe(false);
    expect(roadCreateSchema.safeParse({ ...REQUIRED_BASE, goal: "" }).success).toBe(false);
  });

  it("difficulty が空のときの文言は「困っていること」（作成画面の入口の言い方に合わせる）", () => {
    const r = roadCreateSchema.safeParse({ ...REQUIRED_BASE, difficulty: "" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toContain("困っていることを入力してください");
  });

  it("previouslyAble は任意（未入力・空文字でも作成できる。Road登録・編集画面 必須項目修正指示）", () => {
    expect(
      roadCreateSchema.safeParse({ ...REQUIRED_BASE, previouslyAble: undefined }).success,
    ).toBe(true);
    const { previouslyAble: _omit, ...withoutPreviouslyAble } = REQUIRED_BASE;
    expect(roadCreateSchema.safeParse(withoutPreviouslyAble).success).toBe(true);
    const r = roadCreateSchema.parse({ ...REQUIRED_BASE, previouslyAble: "  " });
    expect(r.previouslyAble).toBeNull();
  });

  it("任意項目は省略できる", () => {
    const r = roadCreateSchema.parse(REQUIRED_BASE);
    expect(r.situation).toBeUndefined();
    expect(r.memo).toBeUndefined();
  });

  it("タグは最大 10 個", () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`);
    expect(roadCreateSchema.safeParse({ ...REQUIRED_BASE, tags }).success).toBe(false);
    expect(
      roadCreateSchema.safeParse({ ...REQUIRED_BASE, tags: tags.slice(0, 10) }).success,
    ).toBe(true);
  });
});

describe("experienceQuerySchema", () => {
  it("既定値: page=1 limit=20 sort=recent", () => {
    const r = experienceQuerySchema.parse({});
    expect(r).toMatchObject({ page: 1, limit: 20, sort: "recent" });
  });
  it("limit は 50 で頭打ち", () => {
    expect(experienceQuerySchema.safeParse({ limit: "999" }).success).toBe(false);
  });
  it("ai フラグは '1' のみ許可し、既定値には影響しない", () => {
    expect(experienceQuerySchema.parse({ ai: "1" }).ai).toBe("1");
    expect(experienceQuerySchema.parse({}).ai).toBeUndefined();
    expect(experienceQuerySchema.safeParse({ ai: "true" }).success).toBe(false);
    // 既定値は不変
    expect(experienceQuerySchema.parse({ ai: "1" })).toMatchObject({
      page: 1,
      limit: 20,
      sort: "recent",
    });
  });
});

describe("quickExperienceSchema（簡易登録 最終動作確認指示書）", () => {
  const BASE = { difficulty: "困っていたこと", method: "試したこと", result: "success" as const };

  it("困っていたこと・試したこと・結果はすべて必須", () => {
    expect(quickExperienceSchema.safeParse(BASE).success).toBe(true);
    expect(quickExperienceSchema.safeParse({ ...BASE, difficulty: "  " }).success).toBe(false);
    expect(quickExperienceSchema.safeParse({ ...BASE, method: "" }).success).toBe(false);
    expect(quickExperienceSchema.safeParse({ ...BASE, result: undefined }).success).toBe(false);
  });

  it("結果は 5 分類すべてを許可する", () => {
    for (const result of ATTEMPT_RESULTS) {
      expect(quickExperienceSchema.safeParse({ ...BASE, result }).success).toBe(true);
    }
    expect(quickExperienceSchema.safeParse({ ...BASE, result: "great" }).success).toBe(false);
  });

  it("困っていたこと・試したことは 400 文字まで（超過は失敗）", () => {
    expect(quickExperienceSchema.safeParse({ ...BASE, difficulty: "a".repeat(400) }).success).toBe(
      true,
    );
    expect(quickExperienceSchema.safeParse({ ...BASE, difficulty: "a".repeat(401) }).success).toBe(
      false,
    );
    expect(quickExperienceSchema.safeParse({ ...BASE, method: "a".repeat(401) }).success).toBe(
      false,
    );
  });

  it("制御文字を除去し、連続する空白を 1 つに畳む", () => {
    const withTabAndRuns = ["abc", "def", "ghi"].join("   ").replace(" ", "\t");
    const r = quickExperienceSchema.parse({ ...BASE, difficulty: withTabAndRuns });
    expect(r.difficulty).toBe("abc def ghi");
  });
});

describe("roads.status（「今の状態」）の文字数上限（2026-10-06: 60 → 300）", () => {
  it("300 文字までは通り、301 文字は通らない。他の欄の上限は変えていない", async () => {
    const { FIELD_MAX } = await import("@/lib/constants");
    const { roadUpdateSchema } = await import("@/lib/validation");
    expect(FIELD_MAX).toMatchObject({ statusLabel: 300, text: 2000, longText: 4000 });
    expect(roadUpdateSchema.safeParse({ status: "あ".repeat(300) }).success).toBe(true);
    expect(roadUpdateSchema.safeParse({ status: "あ".repeat(301) }).success).toBe(false);
  });
});
