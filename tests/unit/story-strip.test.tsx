import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

/**
 * トップ「できる道って、こんな場所です」8 枚（2026-10-01 スマホ表示変更）。
 * jsdom はレイアウトを計算しないので、並び順・代替テキスト・クラス（レスポンシブ切り替え）・ドットを確かめる。
 * 実際の横スクロール・幅・インジケーター追従は e2e（tests/e2e/story-strip.spec.ts）で確かめる。
 */

vi.mock("next/image", () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} />
  ),
}));

import { StoryStrip } from "@/components/story-strip";

afterEach(cleanup);

const TITLES = [
  "「困ったな…」から、はじめよう。",
  "困っていることを、自分の「道」にしよう！",
  "できる方法を、いろいろ試してみよう！",
  "同じような経験を、探してみよう！",
  "少しずつ、できることを増やしていこう！",
  "やってみたことを、残しておこう！",
  "経験を重ねて、自分の「道」を育てよう！",
  "あなたの次の一歩へ！",
];

describe("8枚の紹介画像", () => {
  it("①〜⑧ の順で、画像は comic1〜8、代替テキストは画像の見出しどおり", () => {
    render(<StoryStrip />);
    const imgs = screen.getAllByRole("img");
    expect(imgs.map((i) => i.getAttribute("src"))).toEqual(
      Array.from({ length: 8 }, (_, i) => `/comic${i + 1}.png`),
    );
    imgs.forEach((img, i) => {
      expect(img.getAttribute("alt")).toContain(`${i + 1}枚目：${TITLES[i]}`);
    });
  });

  it("スマホは横スクロール（スナップ・1 枚 85%）、md 以上は 2 列グリッドに切り替わる", () => {
    render(<StoryStrip />);
    const list = screen.getByRole("list", { name: "できる道の紹介（8枚）" });
    for (const cls of [
      "flex",
      "overflow-x-auto",
      "snap-x",
      "snap-mandatory",
      "md:grid",
      "md:grid-cols-2",
      "md:overflow-visible",
    ]) {
      expect(list.className, cls).toMatch(
        new RegExp(`(^|\\s)${cls.replace(/[:[\]]/g, "\\$&")}(\\s|$)`),
      );
    }
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(8);
    for (const li of items) {
      expect(li.className).toContain("w-[85%]");
      expect(li.className).toContain("snap-start");
      expect(li.className).toContain("md:w-auto");
    }
  });

  it("ドットは 8 個（スマホだけ表示）。最初は 1 枚目が現在位置。押すとその画像へスクロールする", () => {
    render(<StoryStrip />);
    const dots = screen.getAllByRole("button", { name: /枚目を表示$/ });
    expect(dots).toHaveLength(8);
    expect(dots[0].getAttribute("aria-current")).toBe("true");
    expect(dots.slice(1).every((d) => d.getAttribute("aria-current") === null)).toBe(true);
    expect(dots[0].closest(".md\\:hidden")).not.toBeNull();
    // 現在位置は横に長い緑、他は淡い灰色の小さな点（既存トークンだけ）
    expect(dots[0].querySelector("span")!.className).toContain("w-4");
    expect(dots[0].querySelector("span")!.className).toContain("bg-[var(--color-primary)]");
    expect(dots[1].querySelector("span")!.className).toContain("w-2");
    expect(dots[1].querySelector("span")!.className).toContain("bg-[var(--color-border)]");

    const list = screen.getByRole("list", { name: "できる道の紹介（8枚）" });
    const scrollTo = vi.fn();
    (list as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
    fireEvent.click(dots[3]);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("最初は小さな操作案内を出す。自動で動く仕組み（タイマー）は持たない", () => {
    vi.useFakeTimers();
    render(<StoryStrip />);
    const hint = screen.getByText("横にスワイプして続きを見る →");
    // 補助的な案内: ドットの文字より小さく薄く
    expect(hint.className).toContain("text-[0.6875rem]"); // 標準で 11px。文字サイズ切替に追従させるため rem
    expect(hint.className).toContain("opacity-70");
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
