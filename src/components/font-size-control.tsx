"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconChevronDown } from "@/components/icons";
import { FONT_SCALES as ORDER, FONT_SCALE_STORAGE_KEY as STORAGE_KEY, type FontScale as Scale } from "@/lib/font-scale";

const LABEL: Record<Scale, string> = { normal: "標準", large: "大", xlarge: "特大" };

function apply(scale: Scale) {
  const el = document.documentElement;
  if (scale === "normal") el.removeAttribute("data-font-scale");
  else el.setAttribute("data-font-scale", scale);
}

/**
 * ヘッダーの文字サイズ切替（標準・大・特大）。
 * - sm 以上: 3 つのボタンを横に並べる（従来どおり）。
 * - スマホ（sm 未満）: ヘッダーの段数を減らすため「A 標準 ▾」の 1 ボタンにまとめ、押すと 3 つの選択肢を開く
 *   （2026-10-07 スマホ固定ヘッダーのコンパクト化。機能は同じ・タップ領域は 44px 以上）。
 */
export function FontSizeControl() {
  const [scale, setScale] = useState<Scale>("normal");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 保存値は通常 layout の head スクリプト（FONT_SCALE_INIT_SCRIPT）が描画前に html へ適用済み。
  // ここではボタンの選択表示を合わせ、head スクリプトが出ない画面（404 等）のために再適用もする。
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Scale | null;
      if (saved && ORDER.includes(saved)) {
        setScale(saved);
        apply(saved);
      }
    } catch {
      /* localStorage 不可でも既定サイズで動作する */
    }
  }, []);

  function change(next: Scale) {
    setScale(next);
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 保存できなくても継続 */
    }
  }

  return (
    <>
      <div className="hidden items-center gap-1.5 sm:flex" role="group" aria-label="文字サイズ">
        <span aria-hidden="true" className="text-sm font-semibold text-[var(--color-ink-muted)]">
          A
        </span>
        {ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => change(s)}
            aria-pressed={scale === s}
            className={`inline-flex min-h-[36px] items-center rounded-[var(--radius-sm)] border px-2.5 text-xs ${
              scale === s
                ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] font-bold"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-sunken)]"
            }`}
          >
            {LABEL[s]}
            <span className="sr-only">の文字サイズにする</span>
          </button>
        ))}
      </div>
      {/* スマホ: 1 ボタンにまとめ、押すと選択肢を開く */}
      <div ref={rootRef} className="relative sm:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={`文字サイズ（いまは${LABEL[scale]}）`}
          className="tap-target inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm hover:bg-[var(--color-surface-sunken)]"
        >
          <span aria-hidden="true" className="font-semibold text-[var(--color-ink-muted)]">
            A
          </span>
          <span aria-hidden="true">{LABEL[scale]}</span>
          <IconChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
        {open && (
          <div
            id={menuId}
            role="group"
            aria-label="文字サイズ"
            className="absolute right-0 z-50 mt-2 flex flex-col gap-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-lift)]"
          >
            {ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  change(s);
                  setOpen(false);
                }}
                aria-pressed={scale === s}
                className={`inline-flex min-w-[6rem] items-center justify-center rounded-[var(--radius-sm)] border px-3 text-sm ${
                  scale === s
                    ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] font-bold"
                    : "border-transparent hover:bg-[var(--color-surface-sunken)]"
                }`}
              >
                {LABEL[s]}
                <span className="sr-only">の文字サイズにする</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
