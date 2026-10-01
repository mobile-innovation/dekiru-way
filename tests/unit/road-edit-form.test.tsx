import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * 「道を編集」と「道を育てる」（2026-10-01 画面分離）。
 * - 道を編集 = 道そのもの。作成画面と同じ 4 項目（困っていること・これから・以前・メモ・気づき）
 * - 道を育てる = その後。日付・場面・状態・進捗・次に試すこと・メモ・タグ
 * - それぞれ自分の項目だけを PATCH する（もう片方の値に触れない）
 * - 既存データが同じ意味の欄にそのまま出て、保存しても欠落しない
 * - 必須/任意は作成画面と一致（困っていること・できるようになりたいことが必須、以前は任意）
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { apiPatch } = vi.hoisted(() => ({
  apiPatch: vi.fn(async (..._args: unknown[]) => ({})),
}));
vi.mock("@/lib/client/api", () => ({
  api: { post: vi.fn(), get: vi.fn(), patch: apiPatch, del: vi.fn() },
  ClientApiError: class extends Error {},
}));

import { RoadEditForm } from "@/components/road-edit-form";
import { RoadGrowForm } from "@/components/road-grow-form";
import type { RoadDTO } from "@/lib/serializers";

/** 「できなくなったこと」の言い方で保存された既存の道（DB の中身は変えない）。 */
const EXISTING: RoadDTO = {
  id: "11111111-1111-1111-1111-111111111111",
  previouslyAble: "以前は自分でボタンを留めていた",
  difficulty: "シャツのボタンが自分でとめられなくなった",
  goal: "朝、自分で着替えを済ませたい",
  startedAt: "2024-04-01",
  situation: "朝の着替え",
  memo: "ボタンエイドが気になる",
  status: "継続中",
  progress: "大きいボタンなら留められる",
  nextAction: "ボタンエイドを試す",
  tags: ["着替え", "指先"],
  attempts: [],
  attemptCount: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const L = {
  difficulty: "今、どんなことで困っていますか？",
  goal: "これから、何ができるようになりたいですか？",
  previouslyAble: "以前は、どうしていましたか？（任意）",
  memoBasic: "メモ・気づき",
  startedAt: "いつ頃から困るようになりましたか？",
  situation: "どんな場面で困っていますか？",
  status: "状態（例：継続中／一区切り）",
  progress: "いまの進捗",
  nextAction: "次に試すこと",
  memoGrow: "メモ",
  tags: "タグ（カンマ区切り）",
} as const;

const field = (label: string) =>
  screen.getByLabelText(label, { exact: label !== L.difficulty && label !== L.goal }) as
    HTMLInputElement | HTMLTextAreaElement;

const labelTexts = () =>
  Array.from(document.querySelectorAll("label")).map((l) => l.textContent ?? "");

afterEach(() => {
  cleanup();
  apiPatch.mockClear();
});

/* ------------------------------------------------------------------ */
/* 道を編集                                                            */
/* ------------------------------------------------------------------ */

describe("道を編集：表示", () => {
  it("作成画面と同じ 4 項目だけ。並びも同じで、古い言い方（できなくなったこと 等）が残らない", () => {
    render(<RoadEditForm road={EXISTING} />);
    const labels = labelTexts();
    expect(labels).toHaveLength(4);
    const idx = [L.difficulty, L.goal, L.previouslyAble, L.memoBasic].map((t) =>
      labels.findIndex((l) => l.startsWith(t)),
    );
    expect(idx).toEqual([0, 1, 2, 3]);

    // 項目名と、空にしたときのエラー文言に古い言い方が無いこと。
    // 補足文「以前できていたことや、以前のやり方を…」は指示書どおりの文言なので対象外。
    fireEvent.change(field(L.difficulty), { target: { value: "" } });
    fireEvent.change(field(L.goal), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    const text = [
      ...labelTexts(),
      ...screen.getAllByText(/」を書いてください$/).map((e) => e.textContent ?? ""),
    ].join("\n");
    for (const old of ["できなくなったこと", "以前できていたこと", "やりたいこと・目標"]) {
      expect(text).not.toContain(old);
    }
    expect(screen.getByText(/以前できていたことや、以前のやり方を書いてください/)).toBeTruthy();
  });

  it("日付・場面・状態・進捗・次に試すこと・タグは出さない（「道を育てる」へ移した）", () => {
    render(<RoadEditForm road={EXISTING} />);
    for (const t of [L.startedAt, L.situation, L.status, L.progress, L.nextAction, L.tags]) {
      expect(screen.queryByLabelText(t, { exact: false }), t).toBeNull();
    }
  });

  it("必須は「困っていること」「できるようになりたいこと」の 2 つだけ（作成画面と同じ）", () => {
    render(<RoadEditForm road={EXISTING} />);
    const required = labelTexts().filter((l) => l.includes("（必須）"));
    expect(required).toHaveLength(2);
    expect(required[0]).toContain(L.difficulty);
    expect(required[1]).toContain(L.goal);
  });

  it("既存データが同じ意味の欄にそのまま出る", () => {
    render(<RoadEditForm road={EXISTING} />);
    expect(field(L.difficulty).value).toBe(EXISTING.difficulty);
    expect(field(L.goal).value).toBe(EXISTING.goal);
    expect(field(L.previouslyAble).value).toBe(EXISTING.previouslyAble);
    expect(field(L.memoBasic).value).toBe(EXISTING.memo);
  });
});

describe("道を編集：保存", () => {
  it("基本情報 4 項目だけを送る（「道を育てる」側の値には触れない）", async () => {
    render(<RoadEditForm road={EXISTING} />);
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch.mock.calls[0]).toEqual([
      `/api/v1/roads/${EXISTING.id}`,
      {
        difficulty: EXISTING.difficulty,
        goal: EXISTING.goal,
        previouslyAble: EXISTING.previouslyAble,
        memo: EXISTING.memo,
      },
    ]);
  });

  it("変えた内容が同じ意味のフィールドで送られる（困っていることと以前が入れ替わらない）", async () => {
    render(<RoadEditForm road={EXISTING} />);
    fireEvent.change(field(L.difficulty), {
      target: { value: "瓶のフタを一人で開けるのが難しい" },
    });
    fireEvent.change(field(L.previouslyAble), { target: { value: "以前は普通に開けられていた" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    const body = apiPatch.mock.calls[0][1] as Record<string, unknown>;
    expect(body.difficulty).toBe("瓶のフタを一人で開けるのが難しい");
    expect(body.previouslyAble).toBe("以前は普通に開けられていた");
    expect(body.goal).toBe(EXISTING.goal);
  });

  it("任意項目（以前・メモ）が空の道もそのまま保存できる（空は null で送る）", async () => {
    render(<RoadEditForm road={{ ...EXISTING, previouslyAble: null, memo: null }} />);
    expect(field(L.previouslyAble).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    const body = apiPatch.mock.calls[0][1] as Record<string, unknown>;
    expect(body.previouslyAble).toBeNull();
    expect(body.memo).toBeNull();
    expect(body.difficulty).toBe(EXISTING.difficulty);
  });

  it("「困っていること」を空にすると保存しない（作成画面と同じ文言）", () => {
    render(<RoadEditForm road={EXISTING} />);
    fireEvent.change(field(L.difficulty), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(apiPatch).not.toHaveBeenCalled();
    expect(screen.getByText("「困っていること」を書いてください")).toBeTruthy();
  });

  it("「できるようになりたいこと」を空にすると保存しない（作成画面と同じ文言）", () => {
    render(<RoadEditForm road={EXISTING} />);
    fireEvent.change(field(L.goal), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    expect(apiPatch).not.toHaveBeenCalled();
    expect(screen.getByText("「できるようになりたいこと」を書いてください")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* 道を育てる                                                          */
/* ------------------------------------------------------------------ */

describe("道を育てる：表示", () => {
  it("「今の状態」「次の一歩」の 7 項目。基本情報（困っていること等）は出さない", () => {
    render(<RoadGrowForm road={EXISTING} />);
    expect(screen.getByRole("heading", { name: "今の状態" })).toBeTruthy();
    // 「次の一歩・記録」→「次の一歩」（試したことの記録と混同しないため。2026-10-01）
    expect(screen.getByRole("heading", { name: "次の一歩" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "次の一歩・記録" })).toBeNull();
    const labels = labelTexts();
    expect(labels).toHaveLength(7);
    const idx = [
      L.startedAt,
      L.situation,
      L.status,
      L.progress,
      L.nextAction,
      L.memoGrow,
      L.tags,
    ].map((t) => labels.findIndex((l) => l.startsWith(t)));
    expect(idx).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const t of [L.difficulty, L.goal, L.previouslyAble]) {
      expect(screen.queryByLabelText(t, { exact: false }), t).toBeNull();
    }
    // 必須項目は無い
    expect(labels.filter((l) => l.includes("（必須）"))).toHaveLength(0);
  });

  it("「次に試すこと」は未来の一歩。実際に試したことは「試したことを記録」へ案内する", () => {
    render(<RoadGrowForm road={EXISTING} />);
    expect(screen.getByText(/これから試してみたいことを書いてください/)).toBeTruthy();
    expect(screen.getByText(/「試したことを記録」から残せます/)).toBeTruthy();
    expect(screen.getByPlaceholderText("例：車への乗り移り方を調べてみる")).toBeTruthy();
  });

  it("既存データ（日付・場面・状態・進捗・次に試すこと・メモ・タグ）がそのまま出る", () => {
    render(<RoadGrowForm road={EXISTING} />);
    expect(field(L.startedAt).value).toBe("2024-04-01");
    expect(field(L.situation).value).toBe(EXISTING.situation);
    expect(field(L.status).value).toBe("継続中");
    expect(field(L.progress).value).toBe(EXISTING.progress);
    expect(field(L.nextAction).value).toBe(EXISTING.nextAction);
    expect(field(L.memoGrow).value).toBe(EXISTING.memo);
    expect(field(L.tags).value).toBe("着替え, 指先");
  });
});

describe("道を育てる：保存", () => {
  it("追加情報 7 項目だけを送る（基本情報には触れない）", async () => {
    render(<RoadGrowForm road={EXISTING} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch.mock.calls[0]).toEqual([
      `/api/v1/roads/${EXISTING.id}`,
      {
        startedAt: "2024-04-01",
        situation: EXISTING.situation,
        status: EXISTING.status,
        progress: EXISTING.progress,
        nextAction: EXISTING.nextAction,
        memo: EXISTING.memo,
        tags: ["着替え", "指先"],
      },
    ]);
  });

  it("空の項目ばかりの道もそのまま保存できる（空は null、タグは空配列）", async () => {
    const sparse: RoadDTO = {
      ...EXISTING,
      startedAt: null,
      situation: null,
      memo: null,
      status: null,
      progress: null,
      nextAction: null,
      tags: [],
    };
    render(<RoadGrowForm road={sparse} />);
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch.mock.calls[0][1]).toEqual({
      startedAt: null,
      situation: null,
      status: null,
      progress: null,
      nextAction: null,
      memo: null,
      tags: [],
    });
  });
});

/* ------------------------------------------------------------------ */
/* 見た目（どちらも作成画面と同じ）                                   */
/* ------------------------------------------------------------------ */

describe.each([
  { name: "道を編集", Form: RoadEditForm, sections: 1, submit: "変更を保存" },
  { name: "道を育てる", Form: RoadGrowForm, sections: 2, submit: "保存" },
])("$name：見た目を作成画面とそろえる", ({ Form, sections, submit }) => {
  it("カードは作成画面の fieldset と同じトークン（緑枠・淡いグリーン下地・角丸・影）", () => {
    render(<Form road={EXISTING} />);
    const els = document.querySelectorAll("section");
    expect(els).toHaveLength(sections);
    for (const s of Array.from(els)) {
      for (const cls of [
        "border-[var(--color-primary)]",
        "bg-[var(--color-primary-tint)]",
        "rounded-[var(--radius-lg)]",
        "shadow-[var(--shadow-card)]",
        "space-y-5",
        "sm:p-6",
      ]) {
        expect(s.className).toContain(cls);
      }
    }
  });

  it("保存ボタンは作成画面の「この道を作る」と同じ全幅の主ボタン＋アイコン。戻る／キャンセルは無い", () => {
    render(<Form road={EXISTING} />);
    const save = screen.getByRole("button", { name: submit });
    for (const cls of [
      "bg-[var(--color-primary)]",
      "text-[var(--color-primary-ink)]",
      "rounded-[var(--radius-pill)]",
      "py-3",
      "w-full",
    ]) {
      expect(save.className).toContain(cls);
    }
    expect(save.querySelector("svg")).not.toBeNull();
    // ボタンは保存の 1 つだけ（上部の「← 道へ戻る」リンクで戻る。2026-10-01）
    expect(screen.queryByRole("button", { name: "戻る" })).toBeNull();
    expect(screen.queryByRole("button", { name: "キャンセル" })).toBeNull();
  });
});

describe("道を編集：エラー表示", () => {
  it("作成画面と同じ（入力が残っている旨を添える）", () => {
    render(<RoadEditForm road={EXISTING} />);
    fireEvent.change(field(L.difficulty), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("bg-[var(--color-danger-soft)]");
    expect(alert.textContent).toContain("入力した内容は残っています");
  });
});

/* ------------------------------------------------------------------ */
/* 音声入力                                                            */
/* ------------------------------------------------------------------ */

describe("音声入力", () => {
  type FakeRec = { onresult: ((e: unknown) => void) | null; onend: (() => void) | null };
  let started: FakeRec | null = null;
  class FakeSpeechRecognition {
    lang = "";
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      started = this;
    }
    stop() {}
    abort() {}
  }
  const w = window as unknown as { webkitSpeechRecognition?: unknown };
  const speak = (text: string) =>
    act(() => {
      started!.onresult?.({ results: { 0: { 0: { transcript: text } } } });
      started!.onend?.();
    });

  afterEach(() => {
    delete w.webkitSpeechRecognition;
    started = null;
  });

  const expectVoiceUnder = (labels: string[]) => {
    expect(screen.getAllByRole("button", { name: "音声で入力" })).toHaveLength(labels.length);
    for (const label of labels) {
      const ta = field(label) as HTMLTextAreaElement;
      const btn = ta.parentElement!.querySelector("button");
      expect(btn?.textContent, label).toContain("音声で入力");
      expect(ta.className, label).toMatch(/\bblock\b/);
    }
  };

  it("道を編集: 4 欄すべてに音声入力ボタンがあり、各入力欄のすぐ下に出る", () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<RoadEditForm road={EXISTING} />);
    expectVoiceUnder([L.difficulty, L.goal, L.previouslyAble, L.memoBasic]);
  });

  it("道を育てる: 自由記述の 4 欄（場面・進捗・次に試すこと・メモ）にあり、日付・状態・タグには無い", () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<RoadGrowForm road={EXISTING} />);
    expectVoiceUnder([L.situation, L.progress, L.nextAction, L.memoGrow]);
  });

  it("道を育てる: 話した内容が既存の文の後ろに足され、そのまま保存される", async () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<RoadGrowForm road={EXISTING} />);
    const buttons = screen.getAllByRole("button", { name: "音声で入力" });
    // 3 番目 = 次に試すこと
    fireEvent.click(buttons[2]);
    speak("マジックテープも試す");
    expect(field(L.nextAction).value).toBe("ボタンエイドを試す マジックテープも試す");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect((apiPatch.mock.calls[0][1] as { nextAction: string }).nextAction).toBe(
      "ボタンエイドを試す マジックテープも試す",
    );
  });

  it("音声入力に対応していないブラウザではボタンを出さない", () => {
    render(<RoadEditForm road={EXISTING} />);
    expect(screen.queryAllByRole("button", { name: "音声で入力" })).toHaveLength(0);
    cleanup();
    render(<RoadGrowForm road={EXISTING} />);
    expect(screen.queryAllByRole("button", { name: "音声で入力" })).toHaveLength(0);
  });
});
