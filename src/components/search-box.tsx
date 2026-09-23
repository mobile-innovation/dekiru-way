"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { VoiceInputButton } from "@/components/voice-input-button";
import { ClearFieldButton } from "@/components/ui";
import { IconSearch } from "@/components/icons";

/**
 * 困りごと入力ボックス (指示書 6-①)。
 * ログイン不要。送信すると経験検索へ遷移する。
 *
 * UI (指示書「検索入力欄 UI 改善 v1」): 入力欄を親カードから一段浮かせ、操作対象だと一目で
 * 分かるようにする。大きな問い → 補足 → 小ラベル「あなたの困りごと」→ 入力欄 → 送信 →
 * 音声入力、という並び。入力欄は白地・やわらかいグリーンの 1.5px 枠・ごく薄い影、
 * フォーカスで枠線だけ少し強める（強い発光はしない）。
 *
 * 見出し「何ができなくて困っていますか？」は、Cloud Code UI・入力フォーム改善指示書 v2 §3-1で
 * 「トップページの中心となる質問。これは変更しない」と明記されている中心の入口。2026-09-23に
 * 一時「前はできてたのに」に変更したが、同日中に v2 の確認により元に戻した
 * （`docs/implementation-decisions.md` 2026-09-23 参照）。
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
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const isHero = size === "hero";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/experiences?q=${encodeURIComponent(q)}` : "/experiences");
  }

  return (
    <form onSubmit={submit} role="search">
      {isHero && (
        <p className="text-xl font-bold sm:text-2xl">何ができなくて困っていますか？</p>
      )}
      <p
        id={hintId}
        className={isHero ? "mt-2 text-sm text-[var(--color-ink-muted)]" : "sr-only"}
      >
        できごとや場面を、いつもの言葉で書いてください。病名は必要ありません。
      </p>

      {/* 入力欄そのもののラベル。placeholder をラベル代わりにしない (指示書 §5 / §20) */}
      <label
        htmlFor={inputId}
        className={isHero ? "mt-4 block text-sm font-bold text-[var(--color-ink)]" : "sr-only"}
      >
        {isHero ? "あなたの困りごと" : "何ができなくて困っていますか？"}
      </label>

      <div className={`${isHero ? "mt-1.5 " : ""}flex flex-col gap-2 sm:flex-row`}>
        <div className="relative flex-1">
          <IconSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-primary)]"
          />
          <input
            id={inputId}
            ref={inputRef}
            name="q"
            type="search"
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby={hintId}
            placeholder="例：ボタンがとめにくい"
            className="w-full rounded-[12px] border border-[color-mix(in_srgb,var(--color-primary)_30%,white)] bg-[var(--color-surface)] py-3 pl-11 pr-11 text-base shadow-[0_2px_8px_rgba(46,42,38,0.05)] transition-[border-color,box-shadow] focus-visible:rounded-[12px] focus-visible:border-[var(--color-primary)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_28%,white),0_2px_8px_rgba(46,42,38,0.05)] [&::-webkit-search-cancel-button]:appearance-none"
          />
          {value && (
            <ClearFieldButton
              label="困りごとの入力を消す"
              onClick={() => {
                setValue("");
                inputRef.current?.focus();
              }}
            />
          )}
        </div>
        <button
          type="submit"
          className="tap-target inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-6 py-3 text-base font-semibold text-[var(--color-primary-ink)] transition-colors hover:bg-[var(--color-primary-hover)]"
        >
          <IconSearch aria-hidden="true" className="h-5 w-5" />
          似た経験を探す
        </button>
      </div>

      {/* 音声入力は主操作 (似た経験を探す) より控えめに。既存の処理は変更しない */}
      <div className={isHero ? "mt-3" : "mt-2"}>
        <VoiceInputButton onResult={(t) => setValue((v) => (v ? `${v} ${t}` : t))} />
      </div>
    </form>
  );
}
