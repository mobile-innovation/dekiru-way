import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/**
 * 「この道を削除」（「自分の道」詳細 最終改善指示 §8）。
 * - ボタンを押しただけでは消さない（確認パネルを出す）
 * - 消える対象（道と試したこと N 件）と取り消せないことを示す
 * - キャンセルで閉じ、API は呼ばない
 * - 確認パネルの「この道を削除」で初めて DELETE を呼び、一覧へ戻る
 */

const { push, refresh, apiDel } = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  apiDel: vi.fn(async (..._args: unknown[]) => ({})),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh }),
}));
vi.mock("@/lib/client/api", () => ({
  api: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), del: apiDel },
  ClientApiError: class extends Error {},
}));

import {
  AttemptPublishToggle,
  DeleteAttemptButton,
  DeleteRoadButton,
  ToastRegion,
} from "@/components/road-actions";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DeleteRoadButton", () => {
  it("押しただけでは削除せず、対象と取り消せないことを示す確認を出す", () => {
    render(<DeleteRoadButton roadId="r1" attemptCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: "この道を削除" }));

    expect(apiDel).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog", { name: "この道を削除しますか？" });
    expect(dialog.textContent).toContain("この道に記録されている試したこと（3 件）が削除されます");
    expect(dialog.textContent).toContain("この操作は取り消せません。");
  });

  it("キャンセルで閉じ、削除しない", () => {
    render(<DeleteRoadButton roadId="r1" attemptCount={1} />);
    fireEvent.click(screen.getByRole("button", { name: "この道を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(apiDel).not.toHaveBeenCalled();
  });

  it("確認パネルの「この道を削除」で DELETE を呼び、一覧へ戻る", async () => {
    render(<DeleteRoadButton roadId="r1" attemptCount={0} />);
    fireEvent.click(screen.getByRole("button", { name: "この道を削除" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("この道が削除されます。");

    fireEvent.click(screen.getByRole("button", { name: "この道を削除" }));
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/api/v1/roads/r1"));
    expect(push).toHaveBeenCalledWith("/me");
  });
});

describe("AttemptPublishToggle の表示（最終UI改善指示 §3）", () => {
  it("公開中は短く「公開中」と出し、状態の判定は変えない", () => {
    render(<AttemptPublishToggle attemptId="a1" initial initialState="published" />);
    expect(screen.getByRole("switch", { name: "公開中" }).getAttribute("aria-checked")).toBe("true");
  });

  it("非公開・確認中・見送りの表示は従来どおり", () => {
    render(<AttemptPublishToggle attemptId="a1" initial={false} initialState="private" />);
    render(<AttemptPublishToggle attemptId="a2" initial initialState="reviewing" />);
    render(<AttemptPublishToggle attemptId="a3" initial initialState="rejected" />);
    expect(screen.getByRole("switch", { name: "自分だけに表示" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: "確認中" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: "公開が見送られました" })).toBeTruthy();
  });
});

describe("DeleteAttemptButton（試したこと 1 件の削除確認）", () => {
  const METHOD = "タクシーを使ったが、自分の運転でない";

  it("押しただけでは削除せず、「試したこと」と対象の文章を示す確認を出す（道の削除と混同しない）", () => {
    render(<DeleteAttemptButton attemptId="a1" method={METHOD} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(apiDel).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "この試したことを削除しますか？" });
    expect(dialog.textContent).toContain("削除すると、この試したことの記録が削除されます。");
    expect(dialog.textContent).toContain("この操作は元に戻せません。");
    expect(dialog.textContent).toContain("試したこと");
    expect(dialog.textContent).toContain(METHOD);
    expect(dialog.textContent).not.toContain("この道を削除");
    expect(screen.getByRole("button", { name: "キャンセル" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "削除する" })).toBeTruthy();
  });

  it("キャンセルで閉じ、削除しない", () => {
    render(<DeleteAttemptButton attemptId="a1" method={METHOD} />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiDel).not.toHaveBeenCalled();
  });

  it("「削除する」で既存の DELETE API（この 1 件だけ）を呼び、閉じて通知を出す。ページ移動はしない", async () => {
    render(
      <>
        <ToastRegion />
        <DeleteAttemptButton attemptId="a1" method={METHOD} />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(apiDel).toHaveBeenCalledWith("/api/v1/attempts/a1"));
    expect(apiDel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status").textContent).toContain("試したことを削除しました。");
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("失敗したらダイアログを閉じずにメッセージを出す", async () => {
    apiDel.mockRejectedValueOnce(new Error("network"));
    render(<DeleteAttemptButton attemptId="a1" method={METHOD} />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除する" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("削除できませんでした"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
