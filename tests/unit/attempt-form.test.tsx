import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * 試したことを記録 / 記録を編集（AttemptForm）。
 * 2026-10-01: 見た目を「道を編集」「道を育てる」と同じ部品にそろえた（カード・エラー表示・全幅の主ボタン）。
 * 入力項目・結果の 5 択・公開設定（新規は既定 OFF）・保存内容は変えていないことを確かめる。
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { apiPost, apiPatch } = vi.hoisted(() => ({
  apiPost: vi.fn(async (..._args: unknown[]) => ({})),
  apiPatch: vi.fn(async (..._args: unknown[]) => ({})),
}));
vi.mock("@/lib/client/api", () => ({
  api: { post: apiPost, get: vi.fn(), patch: apiPatch, del: vi.fn() },
  ClientApiError: class extends Error {},
}));

import { AttemptForm } from "@/components/attempt-form";
import type { AttemptDTO } from "@/lib/serializers";

const ROAD_ID = "11111111-1111-1111-1111-111111111111";

afterEach(() => {
  cleanup();
  apiPost.mockClear();
  apiPatch.mockClear();
});

describe("試したことを記録：見た目を道の画面とそろえる", () => {
  it("4 つのカード（試したこと／結果／メモ・気づき／公開設定）が道を編集と同じカード", () => {
    render(<AttemptForm roadId={ROAD_ID} />);
    const sections = Array.from(document.querySelectorAll("section"));
    expect(sections.map((s) => s.querySelector("h2")?.textContent)).toEqual([
      "試したこと",
      "結果",
      "メモ・気づき",
      "公開設定",
    ]);
    for (const s of sections) {
      for (const cls of [
        "border-[var(--color-primary)]",
        "bg-[var(--color-primary-tint)]",
        "rounded-[var(--radius-lg)]",
        "shadow-[var(--shadow-card)]",
        "space-y-5",
        "sm:p-6",
      ]) {
        expect(s.className, cls).toContain(cls);
      }
    }
  });

  it("「記録する」は道を編集・道を育てると同じ全幅の主ボタン＋アイコン。キャンセルは無い", () => {
    render(<AttemptForm roadId={ROAD_ID} />);
    const submit = screen.getByRole("button", { name: "記録する" });
    for (const cls of [
      "w-full",
      "bg-[var(--color-primary)]",
      "text-[var(--color-primary-ink)]",
      "rounded-[var(--radius-pill)]",
      "py-3",
    ]) {
      expect(submit.className, cls).toContain(cls);
    }
    expect(submit.querySelector("svg")).not.toBeNull();
    // 道を編集・道を育てると同じく、下部のボタンは記録の 1 つだけ（上部の「← … へ戻る」で戻る）
    expect(screen.queryByRole("button", { name: "キャンセル" })).toBeNull();
  });

  it("エラー表示は道の画面と同じ（入力が残っている旨を添える）", async () => {
    const { ClientApiError } = await import("@/lib/client/api");
    apiPost.mockRejectedValueOnce(
      new (ClientApiError as unknown as new (m: string) => Error)("失敗"),
    );
    render(<AttemptForm roadId={ROAD_ID} />);
    fireEvent.change(screen.getByLabelText("どんな方法を試しましたか？", { exact: false }), {
      target: { value: "クッションを変えた" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /^できるようになった/ }));
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("bg-[var(--color-danger-soft)]");
    expect(alert.textContent).toContain("入力した内容は残っています");
  });
});

describe("試したことを記録：機能は変えない", () => {
  it("結果は 5 択のまま", () => {
    render(<AttemptForm roadId={ROAD_ID} />);
    const labels = screen
      .getAllByRole("radio")
      .map((r) => r.querySelector(".font-bold")?.textContent);
    expect(labels).toEqual([
      "できるようになった",
      "少しできた",
      "変化はなかった",
      "うまくいかなかった",
      "まだ試している",
    ]);
  });

  it("結果ボタンは押すと濃い緑の地・白い枠・白い文字になり、他は白地のまま", () => {
    render(<AttemptForm roadId={ROAD_ID} />);
    const partial = screen.getByRole("radio", { name: /^少しできた/ });
    const failed = screen.getByRole("radio", { name: /^うまくいかなかった/ });
    expect(partial.className).toContain("bg-[var(--color-surface)]");

    fireEvent.click(partial);
    expect(partial.getAttribute("aria-checked")).toBe("true");
    for (const cls of [
      "bg-[var(--color-primary)]",
      "border-[var(--color-surface)]",
      "text-[var(--color-primary-ink)]",
    ]) {
      expect(partial.className, cls).toContain(cls);
    }
    expect(failed.className).toContain("bg-[var(--color-surface)]");
    expect(failed.className).toContain("border-[var(--color-border)]");

    // 別のボタンを押すと選択が移る
    fireEvent.click(failed);
    expect(failed.className).toContain("bg-[var(--color-primary)]");
    expect(partial.className).toContain("bg-[var(--color-surface)]");
  });

  it("新規は公開 OFF が既定。試したこと・結果が空なら送らない", () => {
    render(<AttemptForm roadId={ROAD_ID} />);
    expect(
      (screen.getByRole("checkbox", { name: /この経験を公開する/ }) as HTMLInputElement).checked,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    expect(screen.getByText("試したことを書いてください")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("どんな方法を試しましたか？", { exact: false }), {
      target: { value: "クッションを変えた" },
    });
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    expect(screen.getByText("結果を選んでください")).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("記録する: 試したこと・結果・メモ・公開設定だけを送る（従来どおり）", async () => {
    render(<AttemptForm roadId={ROAD_ID} />);
    fireEvent.change(screen.getByLabelText("どんな方法を試しましたか？", { exact: false }), {
      target: { value: " 車への乗り移り方を調べた " },
    });
    fireEvent.click(screen.getByRole("radio", { name: /^うまくいかなかった/ }));
    fireEvent.change(screen.getByLabelText("メモ・気づき（任意）", { exact: false }), {
      target: { value: "一人では難しかった" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /この経験を公開する/ }));
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(apiPost.mock.calls[0]).toEqual([
      `/api/v1/roads/${ROAD_ID}/attempts`,
      {
        method: "車への乗り移り方を調べた",
        result: "failed",
        memo: "一人では難しかった",
        isPublished: true,
      },
    ]);
  });

  it("記録を編集: 既存の値が出て、ボタンは「保存する」。PATCH で同じ項目だけ送る", async () => {
    const attempt = {
      id: "22222222-2222-2222-2222-222222222222",
      roadId: ROAD_ID,
      method: "クッションを変えた",
      result: "partial",
      memo: "少し楽になった",
      isPublished: true,
    } as unknown as AttemptDTO;
    render(<AttemptForm roadId={ROAD_ID} attempt={attempt} />);
    expect(
      (screen.getByLabelText("どんな方法を試しましたか？", { exact: false }) as HTMLTextAreaElement)
        .value,
    ).toBe("クッションを変えた");
    expect(screen.getByRole("radio", { name: /^少しできた/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch.mock.calls[0]).toEqual([
      `/api/v1/attempts/${attempt.id}`,
      {
        method: "クッションを変えた",
        result: "partial",
        memo: "少し楽になった",
        isPublished: true,
      },
    ]);
  });
});

describe("試したことを記録：音声入力（道の画面と同じボタン）", () => {
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

  it("試したこと・メモ・気づきの 2 欄に、入力欄のすぐ下の緑の「音声で入力」がある", () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<AttemptForm roadId={ROAD_ID} />);
    const buttons = screen.getAllByRole("button", { name: "音声で入力" });
    expect(buttons).toHaveLength(2);
    for (const label of ["どんな方法を試しましたか？", "メモ・気づき（任意）"]) {
      const ta = screen.getByLabelText(label, { exact: false });
      const btn = ta.parentElement!.querySelector("button");
      expect(btn?.textContent, label).toContain("音声で入力");
      expect(btn?.className, label).toContain("bg-[var(--color-primary)]");
      expect(ta.className, label).toMatch(/(^|\s)mb-2(\s|$)/);
    }
  });

  it("話した内容が既存の文の後ろに足され、そのまま記録される", async () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<AttemptForm roadId={ROAD_ID} />);
    const method = screen.getByLabelText("どんな方法を試しましたか？", {
      exact: false,
    }) as HTMLTextAreaElement;
    fireEvent.change(method, { target: { value: "クッションを" } });
    fireEvent.click(screen.getAllByRole("button", { name: "音声で入力" })[0]);
    act(() => {
      started!.onresult?.({ results: { 0: { 0: { transcript: "変えてみた" } } } });
      started!.onend?.();
    });
    expect(method.value).toBe("クッションを 変えてみた");

    fireEvent.click(screen.getByRole("radio", { name: /^少しできた/ }));
    fireEvent.click(screen.getByRole("button", { name: "記録する" }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect((apiPost.mock.calls[0][1] as { method: string }).method).toBe("クッションを 変えてみた");
  });

  it("音声入力に対応していないブラウザではボタンを出さない", () => {
    render(<AttemptForm roadId={ROAD_ID} />);
    expect(screen.queryAllByRole("button", { name: "音声で入力" })).toHaveLength(0);
  });
});
