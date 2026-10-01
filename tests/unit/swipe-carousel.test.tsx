import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SwipeCarousel } from "@/components/swipe-carousel";

/**
 * スマホだけ横スライドになる共通リスト（トップの 8 枚ストーリー・「いろいろな方法」で使う。2026-10-01）。
 * jsdom はレイアウトを計算しないので、クラス・ドット・案内・タイマーなしを確かめる（動きは e2e）。
 */

afterEach(cleanup);

const items = ["A", "B", "C"].map((k) => ({ key: k, node: <a href={`/x/${k}`}>カード{k}</a> }));

describe("SwipeCarousel", () => {
  it("スマホは横スクロール（スナップ・1 件 85%）、md 以上は渡したレイアウト。中身（リンク）はそのまま", () => {
    render(
      <SwipeCarousel
        label="記録された道の例"
        items={items}
        desktopListClassName="md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3"
      />,
    );
    const list = screen.getByRole("list", { name: "記録された道の例" });
    for (const cls of ["flex", "overflow-x-auto", "snap-mandatory", "md:grid", "lg:grid-cols-3"]) {
      expect(list.className.split(/\s+/), cls).toContain(cls);
    }
    const lis = screen.getAllByRole("listitem");
    expect(lis).toHaveLength(3);
    lis.forEach((li) =>
      expect(li.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-[85%]", "md:w-auto"])),
    );
    expect(screen.getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual([
      "/x/A",
      "/x/B",
      "/x/C",
    ]);
  });

  it("ドットは件数ぶん（スマホだけ）。読み上げ名は dotLabelSuffix、最初は 1 件目", () => {
    render(
      <SwipeCarousel
        label="例"
        items={items}
        desktopListClassName="md:grid"
        dotLabelSuffix="件目を表示"
      />,
    );
    const dots = screen.getAllByRole("button", { name: /件目を表示$/ });
    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute("aria-current")).toBe("true");
    expect(dots[0].closest(".md\\:hidden")).not.toBeNull();
    const list = screen.getByRole("list", { name: "例" });
    const scrollTo = vi.fn();
    (list as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
    fireEvent.click(dots[2]);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it("hint を渡さなければ案内は出さない。自動で動くタイマーは持たない", () => {
    vi.useFakeTimers();
    render(<SwipeCarousel label="例" items={items} desktopListClassName="md:grid" />);
    expect(screen.queryByText(/スワイプ/)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
