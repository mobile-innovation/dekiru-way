"use client";

import { useEffect, useState } from "react";

type Scale = "normal" | "large" | "xlarge";
const ORDER: Scale[] = ["normal", "large", "xlarge"];
const LABEL: Record<Scale, string> = { normal: "標準", large: "大", xlarge: "特大" };
const STORAGE_KEY = "dekiru:font-scale";

function apply(scale: Scale) {
  const el = document.documentElement;
  if (scale === "normal") el.removeAttribute("data-font-scale");
  else el.setAttribute("data-font-scale", scale);
}

export function FontSizeControl() {
  const [scale, setScale] = useState<Scale>("normal");

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
    <div className="flex items-center gap-1" role="group" aria-label="文字サイズ">
      <span aria-hidden="true" className="text-[var(--color-ink-muted)]">
        A
      </span>
      {ORDER.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => change(s)}
          aria-pressed={scale === s}
          className={`min-h-0 rounded-[var(--radius-sm)] border px-2 py-1 text-xs ${
            scale === s
              ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] font-bold"
              : "border-[var(--color-border)] bg-[var(--color-surface)]"
          }`}
        >
          {LABEL[s]}
          <span className="sr-only">の文字サイズにする</span>
        </button>
      ))}
    </div>
  );
}
