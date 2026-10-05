import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { RoadCard } from "@/components/road-card";
import type { RoadCardDTO } from "@/lib/queries";

/**
 * 「経験を探す」の道カード（一覧ページ UI・情報設計改善指示書）。
 * 困っていたこと（主役）→ タグ → 試した方法の数 → 結果の内訳（機械的な集計）→ この道を見る。方法本文は並べない。
 */

afterEach(cleanup);

const road = (over: Partial<RoadCardDTO> = {}): RoadCardDTO => ({
  entryId: "11111111-1111-4111-8111-111111111111",
  difficulty: "見え方が変わり、鍋の中の様子と炎の大きさが分かりにくい",
  goal: "簡単な煮物を自分で作りたい",
  tags: ["見え方", "台所", "料理", "火", "調理器具"],
  attempts: [
    { id: "a", method: "IHに変えた", result: "success", triedAt: null, achievementPercent: 80 },
    {
      id: "b",
      method: "ライトで照らす",
      result: "no_change",
      triedAt: null,
      achievementPercent: 10,
    },
    { id: "c", method: "タイマー管理", result: "partial", triedAt: null, achievementPercent: null },
    { id: "d", method: "音声タイマー", result: "success", triedAt: null, achievementPercent: 90 },
  ],
  attemptCount: 4,
  isRead: false,
  isMine: false,
  ...over,
});

describe("RoadCard", () => {
  it("困っていたことが主役。方法本文は出さず、方法の数と結果の内訳（5 分類の順・件数）を出す", () => {
    render(<RoadCard road={road()} />);
    expect(screen.getByText("困っていたこと")).toBeTruthy();
    expect(screen.getByText(road().difficulty!)).toBeTruthy();
    expect(screen.getByText("4つの方法を試した")).toBeTruthy();
    expect(screen.queryByText("IHに変えた")).toBeNull();

    const summary = screen.getByRole("list", { name: "結果の内訳" });
    const items = within(summary)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual(["できるようになった2件", "少しできた", "変化はなかった"]);

    const link = screen.getByRole("link", { name: /この道を見る/ });
    expect(link.getAttribute("href")).toBe(`/experiences/${road().entryId}`);
  });

  it("タグは主要 3 件まで（残りは件数だけ）", () => {
    render(<RoadCard road={road()} />);
    const tags = within(screen.getByRole("list", { name: "タグ" })).getAllByRole("listitem");
    expect(tags.map((t) => t.textContent)).toEqual(["#見え方", "#台所", "#料理", "ほか2件"]);
  });

  it("うまくいかなかった道もそのまま。10 件以上は「件」で数える", () => {
    const attempts = Array.from({ length: 12 }, (_, i) => ({
      id: `m${i}`,
      method: `方法${i}`,
      result: "failed",
      triedAt: null,
      achievementPercent: null,
    }));
    render(<RoadCard road={road({ attempts, attemptCount: 12 })} />);
    expect(screen.getByText("12件の方法を試した")).toBeTruthy();
    const items = within(screen.getByRole("list", { name: "結果の内訳" }))
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual(["うまくいかなかった12件"]);
  });

  it("困っていたことが無い古いデータは、やりたいことを「できるようにしたいこと」として出す（推測で作らない）", () => {
    render(<RoadCard road={road({ difficulty: null, tags: [] })} />);
    expect(screen.queryByText("困っていたこと")).toBeNull();
    expect(screen.getByText("できるようにしたいこと")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "タグ" })).toBeNull();
  });

  it("長い困りごとは文章を変えずに CSS で 3 行までに省略（全文は詳細ページ）", () => {
    const long = "指先に力が入りにくく、シャツの小さいボタンを自分でとめられない。".repeat(5);
    render(<RoadCard road={road({ difficulty: long })} />);
    const title = screen.getByText(long);
    expect(title.className).toContain("line-clamp-3");
  });
});
