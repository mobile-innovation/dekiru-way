"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { VoiceInputButton } from "@/components/voice-input-button";

/**
 * 困りごと入力ボックス (指示書 6-①)。
 * ログイン不要。送信すると経験検索へ遷移する。
 */
export function SearchBox({
  autoFocus = false,
  defaultValue = "",
  size = "hero",
}: {
  autoFocus?: boolean;
  defaultValue?: string;
  size?: "hero" | "compact";
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/experiences?q=${encodeURIComponent(q)}` : "/experiences");
  }

  return (
    <form onSubmit={submit} className="space-y-3" role="search">
      <label
        htmlFor={inputId}
        className={size === "hero" ? "block text-xl font-bold sm:text-2xl" : "sr-only"}
      >
        何ができなくて困っていますか？
      </label>
      <p id={hintId} className="text-sm text-[var(--color-ink-muted)]">
        できごとや場面を、いつもの言葉で書いてください。病名は必要ありません。
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={inputId}
          name="q"
          type="search"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-describedby={hintId}
          placeholder="例：ボタンがとめにくい"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base"
        />
        <button
          type="submit"
          className="tap-target shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-6 py-3 text-base font-semibold text-[var(--color-primary-ink)] hover:bg-[var(--color-primary-hover)]"
        >
          似た経験を探す
        </button>
      </div>
      <VoiceInputButton onResult={(t) => setValue((v) => (v ? `${v} ${t}` : t))} />
    </form>
  );
}
