import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/**
 * Markdown取り込み画面の確認・編集で、試したことの並び順を入れ替えられること
 * （「マークダウンからの解析したデータで、試したことの順番を変えれるようにしたい」指示）。
 * 保存時 (`persistSeedRoads`) は配列の順番どおりに 1 件ずつ create するため、
 * ここでの並び替えがそのまま保存後の試した順になる。
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));

const { apiPost } = vi.hoisted(() => ({ apiPost: vi.fn() }));
vi.mock("@/lib/client/api", () => ({
  api: { post: apiPost, get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ClientApiError: class extends Error {},
}));

import { SeedMarkdownImporter } from "@/components/admin/seed-markdown-importer";

const PARSED_ROAD = {
  title: "道1",
  difficulty: "困っていたこと1",
  previouslyAble: null,
  goal: null,
  situation: null,
  status: null,
  nextAction: null,
  attempts: [
    { method: "方法A", result: "success", attemptMemo: null },
    { method: "方法B", result: "partial", attemptMemo: null },
    { method: "方法C", result: "failed", attemptMemo: null },
  ],
};

afterEach(() => {
  cleanup();
  apiPost.mockReset();
  routerPush.mockClear();
});

async function renderParsed() {
  apiPost.mockImplementation(async (path: string) => {
    if (path.includes("parse-markdown")) return { roads: [PARSED_ROAD], errors: [] };
    return {};
  });
  render(<SeedMarkdownImporter />);
  fireEvent.change(screen.getByLabelText("Markdownを貼り付け"), {
    target: { value: "# 道1\n\n## 困っていたこと\n困っていたこと1\n\n## 試したこと\n- 方法：方法A\n- 結果：success\n" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Markdownを解析する" }));
  await waitFor(() => {
    expect(screen.getAllByPlaceholderText("試した一つの方法")).toHaveLength(3);
  });
}

function methodValues(): string[] {
  return screen
    .getAllByPlaceholderText("試した一つの方法")
    .map((el) => (el as HTMLTextAreaElement).value);
}

describe("SeedMarkdownImporter: 試したことの並び替え", () => {
  it("解析直後は Markdown に書いた順（方法A→B→C）で表示される", async () => {
    await renderParsed();
    expect(methodValues()).toEqual(["方法A", "方法B", "方法C"]);
  });

  it("「↑ 上へ」で1つ上と入れ替わる", async () => {
    await renderParsed();
    const upButtons = screen.getAllByText("↑ 上へ");
    fireEvent.click(upButtons[1]!); // 2番目（方法B）を1つ上へ
    expect(methodValues()).toEqual(["方法B", "方法A", "方法C"]);
  });

  it("「↓ 下へ」で1つ下と入れ替わる", async () => {
    await renderParsed();
    const downButtons = screen.getAllByText("↓ 下へ");
    fireEvent.click(downButtons[0]!); // 1番目（方法A）を1つ下へ
    expect(methodValues()).toEqual(["方法B", "方法A", "方法C"]);
  });

  it("先頭は「↑ 上へ」、末尾は「↓ 下へ」が無効", async () => {
    await renderParsed();
    expect(screen.getAllByText("↑ 上へ")[0]).toBeDisabled();
    expect(screen.getAllByText("↓ 下へ").at(-1)).toBeDisabled();
    // 先頭以外の「↑」・末尾以外の「↓」は押せる
    expect(screen.getAllByText("↑ 上へ")[1]).not.toBeDisabled();
    expect(screen.getAllByText("↓ 下へ")[0]).not.toBeDisabled();
  });

  it("並び替えたあとに保存すると、入れ替え後の順番でAPIへ送られる", async () => {
    await renderParsed();
    fireEvent.click(screen.getAllByText("↑ 上へ")[1]!); // B, A, C の順にする
    expect(methodValues()).toEqual(["方法B", "方法A", "方法C"]);

    fireEvent.click(screen.getAllByRole("button", { name: "非公開で保存" })[0]!);
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/admin/seed-data"));

    const saveCall = apiPost.mock.calls.find(([path]) => path === "/api/admin/seed-data");
    expect(saveCall).toBeTruthy();
    const body = saveCall![1] as { roads: { attempts: { method: string }[] }[] };
    expect(body.roads[0]!.attempts.map((a) => a.method)).toEqual(["方法B", "方法A", "方法C"]);
  });
});
