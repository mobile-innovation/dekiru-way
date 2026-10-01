import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";

/**
 * 道を編集（道の更新・編集画面 修正指示 2026-10-01）。
 * - 項目名を作成画面とそろえる（画面上のラベルだけ。保存先・既存データはそのまま）
 * - 既存データが新しいラベルの欄にそのまま出て、保存しても欠落しない
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
  startedAt: "いつ頃から困るようになりましたか？",
  situation: "どんな場面で困っていますか？",
} as const;

const field = (label: string) =>
  screen.getByLabelText(label, { exact: false }) as HTMLInputElement | HTMLTextAreaElement;

afterEach(() => {
  cleanup();
  apiPatch.mockClear();
});

describe("道を編集：表示", () => {
  it("項目名が作成画面とそろい、古い言い方（できなくなったこと 等）が画面に残らない", () => {
    render(<RoadEditForm road={EXISTING} />);
    // 項目名（label）と、空にしたときのエラー文言に古い言い方が無いこと。
    // 補足文「以前できていたことや、以前のやり方を…」は指示書どおりの文言なので対象外。
    fireEvent.change(field(L.difficulty), { target: { value: "" } });
    fireEvent.change(field(L.goal), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    const text = [
      ...Array.from(document.querySelectorAll("label")).map((l) => l.textContent ?? ""),
      ...screen.getAllByText(/」を書いてください$/).map((e) => e.textContent ?? ""),
    ].join("\n");
    for (const old of [
      "できなくなったこと",
      "以前できていたこと",
      "やりたいこと・目標",
      "いつ頃から難しくなったか",
      "困っている場面",
    ]) {
      expect(text).not.toContain(old);
    }
    // 「この道について」の並びは 困っていること → なりたい姿 → 以前（任意）
    const labels = Array.from(document.querySelectorAll("label")).map((l) => l.textContent ?? "");
    const idx = [L.difficulty, L.goal, L.previouslyAble, L.startedAt, L.situation].map((t) =>
      labels.findIndex((l) => l.startsWith(t)),
    );
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(screen.getByText(/以前できていたことや、以前のやり方を書いてください/)).toBeTruthy();
  });

  it("必須は「困っていること」「できるようになりたいこと」の 2 つだけ（作成画面と同じ）", () => {
    render(<RoadEditForm road={EXISTING} />);
    const required = Array.from(document.querySelectorAll("label"))
      .map((l) => l.textContent ?? "")
      .filter((l) => l.includes("（必須）"));
    expect(required).toHaveLength(2);
    expect(required[0]).toContain(L.difficulty);
    expect(required[1]).toContain(L.goal);
  });

  it("既存データが新しいラベルの欄にそのまま出る", () => {
    render(<RoadEditForm road={EXISTING} />);
    expect(field(L.difficulty).value).toBe(EXISTING.difficulty);
    expect(field(L.goal).value).toBe(EXISTING.goal);
    expect(field(L.previouslyAble).value).toBe(EXISTING.previouslyAble);
    expect(field(L.startedAt).value).toBe("2024-04-01");
    expect(field(L.situation).value).toBe(EXISTING.situation);
    expect(field("状態（例：継続中／一区切り）").value).toBe("継続中");
    expect(field("いまの進捗").value).toBe(EXISTING.progress);
    expect(field("次に試すこと").value).toBe(EXISTING.nextAction);
    expect(screen.getByLabelText("メモ", { exact: true })).toHaveProperty("value", EXISTING.memo);
    expect(field("タグ（カンマ区切り）").value).toBe("着替え, 指先");
  });
});

describe("道を編集：保存", () => {
  it("何も変えずに保存しても、すべての項目が同じ値で送られる（欠落しない）", async () => {
    render(<RoadEditForm road={EXISTING} />);
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect(apiPatch.mock.calls[0]).toEqual([
      `/api/v1/roads/${EXISTING.id}`,
      {
        previouslyAble: EXISTING.previouslyAble,
        difficulty: EXISTING.difficulty,
        goal: EXISTING.goal,
        startedAt: "2024-04-01",
        situation: EXISTING.situation,
        memo: EXISTING.memo,
        status: EXISTING.status,
        progress: EXISTING.progress,
        nextAction: EXISTING.nextAction,
        tags: ["着替え", "指先"],
      },
    ]);
  });

  it("任意項目が空の道もそのまま保存できる（空は null で送る）", async () => {
    const sparse: RoadDTO = {
      ...EXISTING,
      previouslyAble: null,
      startedAt: null,
      situation: null,
      memo: null,
      status: null,
      progress: null,
      nextAction: null,
      tags: [],
    };
    render(<RoadEditForm road={sparse} />);
    expect(field(L.previouslyAble).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    const body = apiPatch.mock.calls[0][1] as Record<string, unknown>;
    expect(body.previouslyAble).toBeNull();
    expect(body.startedAt).toBeNull();
    expect(body.difficulty).toBe(EXISTING.difficulty);
    expect(body.tags).toEqual([]);
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

describe("道を編集：見た目を作成画面とそろえる", () => {
  it("カードは作成画面の fieldset と同じトークン（緑枠・淡いグリーン下地・角丸・影）", () => {
    render(<RoadEditForm road={EXISTING} />);
    const sections = document.querySelectorAll("section");
    expect(sections).toHaveLength(3);
    for (const s of Array.from(sections)) {
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

  it("主ボタンは作成画面の「この道を作る」と同じ色・形", () => {
    render(<RoadEditForm road={EXISTING} />);
    const save = screen.getByRole("button", { name: "変更を保存" });
    for (const cls of [
      "bg-[var(--color-primary)]",
      "text-[var(--color-primary-ink)]",
      "rounded-[var(--radius-pill)]",
      "py-3",
    ]) {
      expect(save.className).toContain(cls);
    }
  });

  it("エラー表示は作成画面と同じ（入力が残っている旨を添える）", () => {
    render(<RoadEditForm road={EXISTING} />);
    fireEvent.change(field(L.difficulty), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("bg-[var(--color-danger-soft)]");
    expect(alert.textContent).toContain("入力した内容は残っています");
  });
});

describe("道を編集：音声入力", () => {
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

  const TEXTAREAS = [
    L.difficulty,
    L.goal,
    L.previouslyAble,
    L.situation,
    "いまの進捗",
    "次に試すこと",
    "メモ",
  ];

  it("自由記述の 7 欄すべてに音声入力ボタンがあり、各入力欄のすぐ下に出る（日付・状態・タグには無い）", () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<RoadEditForm road={EXISTING} />);
    expect(screen.getAllByRole("button", { name: "音声で入力" })).toHaveLength(7);
    for (const label of TEXTAREAS) {
      const ta =
        label === "メモ"
          ? (screen.getByLabelText("メモ", { exact: true }) as HTMLTextAreaElement)
          : (field(label) as HTMLTextAreaElement);
      const btn = ta.parentElement!.querySelector("button");
      expect(btn?.textContent, label).toContain("音声で入力");
      expect(ta.className, label).toMatch(/\bblock\b/);
    }
  });

  it("話した内容が既存の文の後ろに足され、そのまま保存される", async () => {
    w.webkitSpeechRecognition = FakeSpeechRecognition;
    render(<RoadEditForm road={EXISTING} />);
    const buttons = screen.getAllByRole("button", { name: "音声で入力" });
    // 6 番目 = 次に試すこと
    fireEvent.click(buttons[5]);
    act(() => {
      started!.onresult?.({ results: { 0: { 0: { transcript: "マジックテープも試す" } } } });
      started!.onend?.();
    });
    expect(field("次に試すこと").value).toBe("ボタンエイドを試す マジックテープも試す");

    fireEvent.click(screen.getByRole("button", { name: "変更を保存" }));
    await waitFor(() => expect(apiPatch).toHaveBeenCalledTimes(1));
    expect((apiPatch.mock.calls[0][1] as { nextAction: string }).nextAction).toBe(
      "ボタンエイドを試す マジックテープも試す",
    );
  });

  it("音声入力に対応していないブラウザではボタンを出さない", () => {
    render(<RoadEditForm road={EXISTING} />);
    expect(screen.queryAllByRole("button", { name: "音声で入力" })).toHaveLength(0);
  });
});
