import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";

/**
 * 「自分の道を作る」フォーム（入力画面 更新指示 2026-10-01）。
 * - 入口は「今、どんなことで困っていますか？」。保存先は従来どおり difficulty
 * - 並び順: 困っていること → なりたい姿 → 以前（任意）→ メモ・気づき（登録は軽く。2026-10-01 役割整理）
 * - 「いつ頃から」「場面」は登録画面では聞かない（編集画面で追加する）
 * - 必須は「困っていること」「できるようになりたいこと」だけ
 * - 自由記述の 4 欄すべてに音声入力ボタン。ボタンは各入力欄のすぐ下（カウンタと同じ行）
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { apiPost } = vi.hoisted(() => ({
  apiPost: vi.fn(async (..._args: unknown[]) => ({ id: "00000000-0000-0000-0000-000000000000" })),
}));
vi.mock("@/lib/client/api", () => ({
  api: { post: apiPost, get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ClientApiError: class extends Error {},
}));

import { RoadForm } from "@/components/road-form";

/** Web Speech API の最小スタブ。start() されたインスタンスに認識結果を流せるようにする。 */
type FakeRec = {
  onresult: ((e: unknown) => void) | null;
  onend: (() => void) | null;
};
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

function speak(text: string) {
  const rec = started!;
  act(() => {
    rec.onresult?.({ results: { 0: { 0: { transcript: text } } } });
    rec.onend?.();
  });
}

const LABELS = {
  difficulty: "今、どんなことで困っていますか？",
  goal: "これから、何ができるようになりたいですか？",
  previouslyAble: "以前は、どうしていましたか？（任意）",
  memo: "メモ・気づき",
} as const;

beforeEach(() => {
  started = null;
  (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition =
    FakeSpeechRecognition;
});

afterEach(() => {
  cleanup();
  apiPost.mockClear();
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
});

describe("自分の道を作る：表示", () => {
  it("見出し・項目の順番・必須/任意の表示・プレースホルダー", () => {
    render(<RoadForm />);
    expect(screen.getByText("あなたの「困っていること」から、道を作ります")).toBeTruthy();
    expect(screen.getByText(/解決していなくても大丈夫です/)).toBeTruthy();

    const labels = Array.from(document.querySelectorAll("fieldset label")).map(
      (l) => l.textContent ?? "",
    );
    const idx = Object.values(LABELS).map((t) => labels.findIndex((l) => l.startsWith(t)));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);

    // 必須は 2 つだけ（Field は必須に sr-only「（必須）」を付ける）
    const required = labels.filter((l) => l.includes("（必須）"));
    expect(required).toHaveLength(2);
    expect(required[0]).toContain(LABELS.difficulty);
    expect(required[1]).toContain(LABELS.goal);

    expect(screen.getByPlaceholderText("例：シャツのボタンを自分で留めるのが難しい")).toBeTruthy();
    expect(screen.getByPlaceholderText("例：自分でシャツを着られるようになりたい")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("例：以前は自分でシャツを着て、ボタンを留めていました。"),
    ).toBeTruthy();
    // 「いつ頃から」「場面」「状態」「進捗」「次に試すこと」「タグ」は登録画面に出さない
    for (const t of [
      "いつ頃から困るようになりましたか？",
      "どんな場面で困っていますか？",
      "状態",
      "いまの進捗",
      "次に試すこと",
      "タグ",
    ]) {
      expect(
        labels.some((l) => l.startsWith(t)),
        t,
      ).toBe(false);
    }
    expect(labels).toHaveLength(4);
  });

  it("4 欄すべてに音声入力ボタンがあり、各入力欄のすぐ下（同じ項目内）に出る", () => {
    render(<RoadForm />);
    const buttons = screen.getAllByRole("button", { name: "音声で入力" });
    expect(buttons).toHaveLength(4);
    for (const k of ["difficulty", "goal", "previouslyAble", "memo"] as const) {
      const textarea = screen.getByLabelText(LABELS[k], { exact: false });
      // ボタンは入力欄と同じ Field の中（入力欄の後ろ）にある
      const field = textarea.parentElement!;
      const btn = field.querySelector("button");
      expect(btn?.textContent).toContain("音声で入力");
      expect(
        textarea.compareDocumentPosition(btn!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // 入力欄下の隙間を詰める（inline-block の行の高さぶんの隙間を消す）
      expect(textarea.className).toMatch(/\bblock\b/);
    }
  });

  it("音声入力ボタンの角丸は入力欄と同じ --radius-md", () => {
    render(<RoadForm />);
    const btn = screen.getAllByRole("button", { name: "音声で入力" })[0];
    expect(btn.className).toContain("rounded-[var(--radius-md)]");
  });

  it("音声入力に対応していないブラウザではボタンを出さない（文字入力だけで完結）", () => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    render(<RoadForm />);
    expect(screen.queryAllByRole("button", { name: "音声で入力" })).toHaveLength(0);
    // 文字数カウンタは出たまま
    expect(screen.getAllByText("0 / 2000 文字").length).toBeGreaterThan(0);
  });
});

describe("自分の道を作る：音声入力", () => {
  it("話した内容が既存の文の後ろに足される（困っていること・メモ・気づき）", () => {
    render(<RoadForm />);
    const difficulty = screen.getByLabelText(LABELS.difficulty, {
      exact: false,
    }) as HTMLTextAreaElement;
    const memo = screen.getByLabelText(LABELS.memo, { exact: false }) as HTMLTextAreaElement;
    const buttons = screen.getAllByRole("button", { name: "音声で入力" });

    fireEvent.change(difficulty, { target: { value: "ボタンが" } });
    fireEvent.click(buttons[0]);
    speak("留めにくい");
    expect(difficulty.value).toBe("ボタンが 留めにくい");

    fireEvent.click(buttons[3]);
    speak("ボタンエイドを試したい");
    expect(memo.value).toBe("ボタンエイドを試したい");
    // カウンタも追随する
    expect(screen.getByText("11 / 4000 文字")).toBeTruthy();
  });
});

describe("自分の道を作る：送信", () => {
  it("「困っていること」が空なら送らない", () => {
    render(<RoadForm />);
    fireEvent.click(screen.getByRole("button", { name: "この道を作る" }));
    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.getAllByText(/「困っていること」を書いてください/).length).toBeGreaterThan(0);
  });

  it("「困っていること」だけでは送らない（「できるようになりたいこと」も必須）", () => {
    render(<RoadForm />);
    fireEvent.change(screen.getByLabelText(LABELS.difficulty, { exact: false }), {
      target: { value: "ボタンが留めにくい" },
    });
    fireEvent.click(screen.getByRole("button", { name: "この道を作る" }));
    expect(apiPost).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(/「できるようになりたいこと」を書いてください/).length,
    ).toBeGreaterThan(0);
  });

  it("必須 2 つだけで送れる。困りごとは従来どおり difficulty、空の任意項目は送らない", async () => {
    render(<RoadForm />);
    fireEvent.change(screen.getByLabelText(LABELS.difficulty, { exact: false }), {
      target: { value: " ボタンが留めにくい " },
    });
    fireEvent.change(screen.getByLabelText(LABELS.goal, { exact: false }), {
      target: { value: "自分でシャツを着たい" },
    });
    fireEvent.click(screen.getByRole("button", { name: "この道を作る" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0]).toEqual([
      "/api/v1/roads",
      {
        previouslyAble: undefined,
        difficulty: "ボタンが留めにくい",
        goal: "自分でシャツを着たい",
        memo: undefined,
      },
    ]);
  });
});

describe("自分の道を作る：4 項目がそれぞれ同じ意味のフィールドで送られる", () => {
  it("困っていること → difficulty / これから → goal / 以前 → previouslyAble / メモ → memo", async () => {
    render(<RoadForm />);
    fireEvent.change(screen.getByLabelText(LABELS.difficulty, { exact: false }), {
      target: { value: "瓶のフタを開けるのが難しい" },
    });
    fireEvent.change(screen.getByLabelText(LABELS.goal, { exact: false }), {
      target: { value: "自分で瓶を開けられるようになりたい" },
    });
    fireEvent.change(screen.getByLabelText(LABELS.previouslyAble, { exact: false }), {
      target: { value: "以前は普通に開けられていた" },
    });
    fireEvent.change(screen.getByLabelText(LABELS.memo, { exact: false }), {
      target: { value: "家で試してみたい" },
    });
    fireEvent.click(screen.getByRole("button", { name: "この道を作る" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0][1]).toEqual({
      difficulty: "瓶のフタを開けるのが難しい",
      goal: "自分で瓶を開けられるようになりたい",
      previouslyAble: "以前は普通に開けられていた",
      memo: "家で試してみたい",
    });
  });
});
