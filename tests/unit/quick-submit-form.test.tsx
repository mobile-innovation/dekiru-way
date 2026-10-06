import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * SNS からの簡易登録フォーム（/try）。2026-10-01 最終UI調整で見た目だけ変えた
 * （入力欄 4 行・注意文 13px）。入力項目・順番・5 択・ボタン文言・送信内容は変えていないことを確かめる。
 */

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn(async (..._args: unknown[]) => ({})) }));
vi.mock("@/lib/client/api", () => ({
  api: { post: apiPost, get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ClientApiError: class extends Error {},
}));

import { QuickSubmitForm } from "@/components/quick-submit-form";

afterEach(() => {
  cleanup();
  apiPost.mockClear();
});

describe("簡易登録フォーム（/try）", () => {
  it("入力欄は「困っていたこと」→「試したこと」の順で、どちらも 4 行（約 120px）・最大 400 文字", () => {
    render(<QuickSubmitForm />);
    const areas = screen.getAllByRole("textbox") as HTMLTextAreaElement[];
    expect(areas).toHaveLength(2);
    expect(areas[0].id).toBe(screen.getByLabelText("困っていたこと", { exact: false }).id);
    expect(areas[1].id).toBe(screen.getByLabelText("試したこと", { exact: false }).id);
    for (const a of areas) {
      expect(a.rows).toBe(4);
      expect(a.maxLength).toBe(400);
    }
    // プレースホルダーは変更なし
    expect(screen.getByPlaceholderText("例：シャツのボタンがとめにくい")).toBeTruthy();
    expect(screen.getByPlaceholderText("何を試しましたか？")).toBeTruthy();
  });

  it("試した結果は 5 択・PC では 2 列のまま", () => {
    render(<QuickSubmitForm />);
    const group = screen.getByRole("radiogroup", { name: "試した結果" });
    expect(group.className).toContain("sm:grid-cols-2");
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "できるようになった",
      "少しできた",
      "変化はなかった",
      "うまくいかなかった",
      "まだ試している",
    ]);
  });

  it("ボタン文言・注意文は変更なし（注意文は 13px で少し読みやすく）", () => {
    render(<QuickSubmitForm />);
    expect(screen.getByRole("button", { name: "試したことを登録する" })).toBeTruthy();
    const note = screen.getByText("登録した内容は、運営が確認してから「できる道」で公開されます。");
    expect(note.className).toContain("text-[0.8125rem]"); // 標準で 13px。文字サイズ切替に追従させるため rem
  });

  it("送信内容は従来どおり（困っていたこと・試したこと・結果）", async () => {
    render(<QuickSubmitForm />);
    fireEvent.change(screen.getByLabelText("困っていたこと", { exact: false }), {
      target: { value: " 瓶のフタが開けにくい " },
    });
    fireEvent.change(screen.getByLabelText("試したこと", { exact: false }), {
      target: { value: "ゴムシートを使った" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "少しできた" }));
    fireEvent.click(screen.getByRole("button", { name: "試したことを登録する" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0]).toEqual([
      "/api/v1/quick-experiences",
      { difficulty: "瓶のフタが開けにくい", method: "ゴムシートを使った", result: "partial" },
    ]);
  });

  it("完了画面の「もう1件教える」で、困っていたことを残したままフォームに戻る", async () => {
    render(<QuickSubmitForm />);
    fireEvent.change(screen.getByLabelText("困っていたこと", { exact: false }), {
      target: { value: "瓶のフタが開けにくい" },
    });
    fireEvent.change(screen.getByLabelText("試したこと", { exact: false }), {
      target: { value: "ゴムシートを使った" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "少しできた" }));
    fireEvent.click(screen.getByRole("button", { name: "試したことを登録する" }));
    const again = await screen.findByRole("button", { name: "もう1件教える" });
    expect(
      screen.getByRole("link", { name: "ログインして自分の道として残す" }).getAttribute("href"),
    ).toBe("/login?next=/me/roads/new");

    fireEvent.click(again);
    expect(
      (screen.getByLabelText("困っていたこと", { exact: false }) as HTMLTextAreaElement).value,
    ).toBe("瓶のフタが開けにくい");
    expect((screen.getByLabelText("試したこと", { exact: false }) as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("radio", { name: "少しできた" }).getAttribute("aria-checked")).toBe("false");
  });
});

describe("簡易登録フォーム（/try）：音声入力（道・記録の画面と同じボタン）", () => {
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
  afterEach(() => {
    delete w.webkitSpeechRecognition;
    started = null;
  });

  it("困っていたこと・試したことの 2 欄に、入力欄のすぐ下の「音声で入力」がある", () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<QuickSubmitForm />);
    expect(screen.getAllByRole("button", { name: "音声で入力" })).toHaveLength(2);
    for (const label of ["困っていたこと", "試したこと"]) {
      const ta = screen.getByLabelText(label, { exact: false });
      const btn = ta.parentElement!.querySelector("button");
      expect(btn?.textContent, label).toContain("音声で入力");
    }
  });

  it("話した内容が既存の文の後ろに足され、そのまま送信される", async () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<QuickSubmitForm initialProblem="瓶のフタが" />);
    const difficulty = screen.getByLabelText("困っていたこと", { exact: false }) as HTMLTextAreaElement;
    fireEvent.click(screen.getAllByRole("button", { name: "音声で入力" })[0]);
    act(() => {
      started!.onresult?.({ results: { 0: { 0: { transcript: "開けにくい" } } } });
      started!.onend?.();
    });
    expect(difficulty.value).toBe("瓶のフタが 開けにくい");

    const method = screen.getByLabelText("試したこと", { exact: false }) as HTMLTextAreaElement;
    fireEvent.click(screen.getAllByRole("button", { name: "音声で入力" })[1]);
    act(() => {
      started!.onresult?.({ results: { 0: { 0: { transcript: "ゴムシートを使った" } } } });
      started!.onend?.();
    });
    expect(method.value).toBe("ゴムシートを使った");

    fireEvent.click(screen.getByRole("radio", { name: "少しできた" }));
    fireEvent.click(screen.getByRole("button", { name: "試したことを登録する" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0][1]).toEqual({
      difficulty: "瓶のフタが 開けにくい",
      method: "ゴムシートを使った",
      result: "partial",
    });
  });

  it("音声入力に対応していないブラウザではボタンを出さない", () => {
    render(<QuickSubmitForm />);
    expect(screen.queryAllByRole("button", { name: "音声で入力" })).toHaveLength(0);
  });
});
