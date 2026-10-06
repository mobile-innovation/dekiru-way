"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconShare } from "@/components/icons";
import { xShareUrl } from "@/lib/share";

/**
 * 経験詳細の「この道をSNSで紹介」(SNS共有機能追加指示書)。
 *
 * - 自動投稿はしない。X は投稿画面を開くだけで、利用者が内容を確認して自分で投稿する。
 * - 共有文・URL はサーバー側で公開済みの内容だけから作って渡す（このコンポーネントはデータを取りに行かない）。
 * - 見た目は「参考になった」と同じ枠付きピル。ハートとは別のアイコン・文言で区別し、押すと選択肢が開く 2 段階にする。
 * - パネルは初期状態で閉じている。ボタンをもう一度押す・「閉じる」・Esc で閉じ、フォーカスはボタンへ戻す（最終調整指示書）。
 * - 共有数は数えない・表示しない。
 */
export function ShareButton({ text, url, title }: { text: string; url: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  // OS 標準の共有は対応ブラウザ（主にスマホ）だけ。SSR との食い違いを避けるためマウント後に判定する。
  const [canNativeShare, setCanNativeShare] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  const rootRef = useRef<HTMLDivElement>(null);

  // カードの外側を押したら閉じる（トリガー自体はトグルなので除外）
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || toggleRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copyLink() {
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopyFailed(true);
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, text, url });
    } catch {
      /* 利用者が閉じた・非対応。何もしない */
    }
  }

  // ボタンは既存の Button（src/components/ui.tsx）の primary / secondary と同じ配色。外部リンクの <a> にも使うためクラスで持つ
  const btnBase =
    "tap-target inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-4 py-2 text-sm font-semibold no-underline transition-colors";
  const btnPrimary = `${btnBase} bg-[var(--color-primary)] text-[var(--color-primary-ink)] hover:bg-[var(--color-primary-hover)]`;
  const btnSecondary = `${btnBase} border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]`;

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        // 見た目は「参考になった」（未押下）と同じ枠付きピル
        className="tap-target inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink-muted)] transition-colors"
      >
        <IconShare aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span>この道をSNSで紹介</span>
      </button>

      {/* 共有カード（デザイン改善指示書）。既存の .card を使った小さなカード。
          スマホはボタンの下にその場で開く（全幅）。sm 以上はボタンの直下に重ねるポップオーバー（幅 26rem）にして、
          開いてもボタンの位置や「道」の表示位置を動かさない。外側のクリック・Esc・「閉じる」で閉じる。 */}
      {open && (
        <div
          ref={rootRef}
          id={panelId}
          role="region"
          aria-labelledby={`${panelId}-title`}
          className="card w-full min-w-0 basis-full space-y-3 p-4 sm:absolute sm:right-0 sm:top-full sm:z-20 sm:mt-2 sm:w-[26rem] sm:shadow-[var(--shadow-lift)]"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p id={`${panelId}-title`} className="font-bold">
                この道を誰かに教える
              </p>
              <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                この経験が、同じことで困っている人のヒントになるかもしれません。
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              className="tap-target -mr-2 -mt-2 inline-flex shrink-0 items-center justify-center rounded-[var(--radius-pill)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-muted)] underline"
            >
              閉じる
            </button>
          </div>

          <div>
            <span className="text-[0.6875rem] font-bold tracking-wide text-[var(--color-ink-muted)]">
              投稿内容
            </span>
            <pre
              aria-label="共有される文章"
              className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] px-3 py-2 font-sans text-xs leading-relaxed"
            >
              {`${text}\n${url}`}
            </pre>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={xShareUrl(text, url)}
              target="_blank"
              rel="noopener noreferrer"
              className={btnPrimary}
            >
              Xで紹介する
            </a>
            <button type="button" onClick={copyLink} className={btnSecondary}>
              {copied ? "リンクをコピーしました" : "リンクをコピー"}
            </button>
            {canNativeShare && (
              <button
                type="button"
                onClick={nativeShare}
                className="tap-target px-1 text-sm font-semibold text-[var(--color-ink-muted)] underline"
              >
                ほかのアプリで共有
              </button>
            )}
          </div>
          {copyFailed && (
            <p role="alert" className="text-sm text-[var(--color-danger)]">
              コピーできませんでした。投稿内容のリンクを長押しなどでコピーしてください。
            </p>
          )}

          <p className="text-xs text-[var(--color-ink-muted)]">
            自動では投稿されません。内容を確認してから投稿できます。
          </p>
        </div>
      )}
    </>
  );
}
