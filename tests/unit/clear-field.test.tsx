import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { apiPost } = vi.hoisted(() => ({
  apiPost: vi.fn(
    async (..._args: unknown[]): Promise<{ drafts: Record<string, unknown>[]; priorCount: number }> => ({
      drafts: [],
      priorCount: 0,
    }),
  ),
}));
vi.mock("@/lib/client/api", () => ({
  api: { post: apiPost, get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ClientApiError: class extends Error {},
}));

import { SearchBox } from "@/components/search-box";
import { SeedDataGenerator } from "@/components/admin/seed-data-generator";
import { TextField } from "@/components/form";

afterEach(() => {
  cleanup();
  apiPost.mockClear();
});

describe("検索・キーワード欄の × クリアボタン", () => {
  it("入力があるときだけ × が出て、押すと空になる（トップの検索）", () => {
    render(<SearchBox />);
    const input = screen.getByLabelText("あなたの困りごと") as HTMLInputElement;

    // 空のときは × 無し
    expect(screen.queryByRole("button", { name: "困りごとの入力を消す" })).toBeNull();

    fireEvent.change(input, { target: { value: "ボタンがとめにくい" } });
    expect(input.value).toBe("ボタンがとめにくい");

    const clear = screen.getByRole("button", { name: "困りごとの入力を消す" });
    fireEvent.click(clear);

    expect(input.value).toBe("");
    expect(screen.queryByRole("button", { name: "困りごとの入力を消す" })).toBeNull();
  });

  it("AI仮データ生成のキーワード欄も × で消せる", () => {
    render(<SeedDataGenerator />);
    const input = screen.getByLabelText("キーワード") as HTMLInputElement;
    expect(screen.queryByRole("button", { name: "キーワードを消す" })).toBeNull();

    fireEvent.change(input, { target: { value: "デスクワーク PC" } });
    fireEvent.click(screen.getByRole("button", { name: "キーワードを消す" }));

    expect(input.value).toBe("");
  });

  it("キーワード欄で Enter を押すと生成が走る", async () => {
    render(<SeedDataGenerator />);
    const input = screen.getByLabelText("キーワード") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "デスクワーク PC" } });

    // テキスト欄でのフォーム送信（Enter 相当）
    const form = input.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(apiPost).toHaveBeenCalled());
    expect(apiPost).toHaveBeenCalledWith(
      "/api/admin/seed-data/generate",
      expect.objectContaining({ keyword: "デスクワーク PC" }),
    );
  });

  it("再生成（保存せず再度生成）すると、前回の結果を exclude に載せて送る", async () => {
    apiPost.mockResolvedValueOnce({
      drafts: [
        { difficulty: "肩や首がつらい", method: "休憩する", result: "partial" },
        { difficulty: "マウス操作が難しい", method: "軽いマウスにする", result: "success" },
      ],
      priorCount: 0,
    });
    render(<SeedDataGenerator />);
    const input = screen.getByLabelText("キーワード") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "デスクワーク" } });
    const form = input.closest("form") as HTMLFormElement;

    // 1 回目 — exclude は空
    fireEvent.submit(form);
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0][1]).toMatchObject({ keyword: "デスクワーク", exclude: [] });

    // 2 回目（キーワードは変えずにもう一度）— 1 回目の結果が exclude に載る
    fireEvent.submit(form);
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2));
    const secondBody = apiPost.mock.calls[1][1] as { keyword: string; exclude: { difficulty: string | null }[] };
    expect(secondBody.keyword).toBe("デスクワーク");
    expect(secondBody.exclude.map((e) => e.difficulty)).toEqual(
      expect.arrayContaining(["肩や首がつらい", "マウス操作が難しい"]),
    );
  });
});

describe("日付欄の「日付を消す」ボタン（スマホの日付ダイアログに消す手段が無いことがあるため）", () => {
  it("値があるときだけ出て、押すと onChange が空文字で呼ばれる", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <TextField label="いつ頃から難しくなりましたか？" type="date" value="" onChange={onChange} />,
    );
    expect(screen.queryByRole("button", { name: "日付を消す" })).toBeNull();

    rerender(
      <TextField
        label="いつ頃から難しくなりましたか？"
        type="date"
        value="2026-01-01"
        onChange={onChange}
      />,
    );
    const clear = screen.getByRole("button", { name: "日付を消す" });
    fireEvent.click(clear);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: "" }) }),
    );
  });

  it("date 以外の欄には出ない", () => {
    render(<TextField label="メモ" type="text" value="abc" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "日付を消す" })).toBeNull();
  });
});
