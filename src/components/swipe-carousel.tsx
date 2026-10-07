"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * スマホ（md 未満）だけ横スクロールのカルーセルになるリスト（2026-10-01 トップページ用）。
 * md 以上は `desktopListClassName` のレイアウト（グリッド等）で普通に並ぶ。リストは 1 つで、
 * クラスだけを画面幅で切り替えるので、HTML の並び順はそのまま。
 *
 * スマホ:
 * - 1 件を幅の約 85% で大きく見せ、右に次の 1 件を少しのぞかせて「横に続く」ことを伝える
 * - scroll-snap で 1 件ずつ止まる。スクロールバーは出さない。縦スクロールは妨げない
 * - 下に件数ぶんのドット（現在位置。押すとその件へ）と、任意で小さな操作案内（一度横に動かすと消える）
 * - 開いた直後は必ず 1 件目から（ブラウザが横位置を復元しても戻す）
 * - 自動スクロールはしない（タイマーを持たない）
 */
export function SwipeCarousel({
  label,
  items,
  desktopListClassName,
  desktopItemClassName = "md:w-auto",
  dotLabelSuffix = "件目を表示",
  hint,
}: {
  /** リストの読み上げ名（例: 「できる道の紹介（6枚）」） */
  label: string;
  items: { key: string; node: ReactNode }[];
  /** md 以上のレイアウト（例: "md:grid md:grid-cols-2 md:gap-4"） */
  desktopListClassName: string;
  desktopItemClassName?: string;
  /** ドットの読み上げ名の後ろ（例: 「枚目を表示」→「3枚目を表示」） */
  dotLabelSuffix?: string;
  /** 小さな操作案内（例: 「横にスワイプして続きを見る →」）。省略時は出さない */
  hint?: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const [swiped, setSwiped] = useState(false);

  // スワイプに合わせて現在位置（ドット）を更新する。スクロール位置に最も近い件を現在の 1 件とみなす。
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // 開いた直後は必ず 1 件目から（戻る／再読み込みでブラウザが横位置を復元しても戻す）
    list.scrollLeft = 0;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const els = Array.from(list.children) as HTMLElement[];
        const left = list.scrollLeft;
        const dist = (el: HTMLElement) => Math.abs(el.offsetLeft - els[0].offsetLeft - left);
        let best = 0;
        for (let i = 1; i < els.length; i++) if (dist(els[i]) < dist(els[best])) best = i;
        setActive(best);
        if (left > 8) setSwiped(true);
      });
    };
    list.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      list.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  function goTo(i: number) {
    const list = listRef.current;
    const el = list?.children[i] as HTMLElement | undefined;
    if (!list || !el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({
      left: el.offsetLeft - (list.children[0] as HTMLElement).offsetLeft,
      behavior: reduce ? "auto" : "smooth",
    });
  }

  return (
    <>
      <ol
        ref={listRef}
        aria-label={label}
        className={`flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain [scrollbar-width:none] md:snap-none md:overflow-visible [&::-webkit-scrollbar]:hidden ${desktopListClassName}`}
      >
        {items.map((it, i) => (
          <li
            key={it.key}
            aria-label={`${i + 1} / ${items.length}`}
            className={`w-[85%] shrink-0 snap-start ${desktopItemClassName}`}
          >
            {it.node}
          </li>
        ))}
      </ol>

      {/* スマホだけ: 現在位置のドットと、最初だけ小さな操作案内 */}
      <div className="space-y-0.5 md:hidden">
        <div className="flex justify-center gap-1" role="group" aria-label={`${label}の表示位置`}>
          {items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1}${dotLabelSuffix}`}
              aria-current={active === i ? "true" : undefined}
              // 見た目は小さな点。押しやすさのため押せる範囲は広めに取る（min-h-0 で 44px の最小高を外す）
              className="flex h-6 min-h-0 min-w-6 items-center justify-center"
            >
              {/* 現在位置は少し横に長い緑（16×8px）、他は淡い灰色の点（8×8px）。
                  色は既存トークン（--color-primary / --color-border）だけ */}
              <span
                aria-hidden="true"
                className={`block h-2 rounded-full transition-[width] motion-reduce:transition-none ${
                  active === i ? "w-4 bg-[var(--color-primary)]" : "w-2 bg-[var(--color-border)]"
                }`}
              />
            </button>
          ))}
        </div>
        {hint && !swiped && (
          // 補助的な案内: 画像・ドットより目立たせない（小さめ・薄め・余白控えめ）
          <p className="text-center text-[0.6875rem] leading-tight text-[var(--color-ink-muted)] opacity-70">
            {hint}
          </p>
        )}
      </div>
    </>
  );
}
