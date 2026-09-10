import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { resultMeta } from "@/lib/constants";
import { IconSearch, IconX, resultIcon } from "@/components/icons";

/* ------------------------------------------------------------------ */
/* カード                                                              */
/* ------------------------------------------------------------------ */

export function Card({
  as: As = "div",
  className = "",
  children,
  ...rest
}: { as?: "div" | "article" | "section"; className?: string; children: ReactNode } & ComponentProps<"div">) {
  return (
    <As className={`card p-5 ${className}`} {...rest}>
      {children}
    </As>
  );
}

/* ------------------------------------------------------------------ */
/* ボタン                                                              */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[var(--color-primary)] text-[var(--color-primary-ink)] hover:bg-[var(--color-primary-hover)]",
  secondary:
    "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-border)] hover:bg-[var(--color-surface-sunken)]",
  ghost: "bg-transparent text-[var(--color-primary-hover)] hover:bg-[var(--color-primary-soft)]",
  danger: "bg-[var(--color-danger)] text-white hover:opacity-90",
};

const BTN_BASE =
  "tap-target inline-flex items-center justify-center gap-2 rounded-[var(--radius-pill)] px-5 py-2.5 text-sm font-semibold no-underline transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: { variant?: Variant } & ComponentProps<"button">) {
  return <button className={`${BTN_BASE} ${VARIANT[variant]} ${className}`} {...rest} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  href,
  children,
  ...rest
}: { variant?: Variant; href: string; children: ReactNode } & Omit<ComponentProps<typeof Link>, "href">) {
  return (
    <Link href={href} className={`${BTN_BASE} ${VARIANT[variant]} ${className}`} {...rest}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* 結果バッジ (色 + アイコン + ラベル。色だけに依存しない)              */
/* ------------------------------------------------------------------ */

export function ResultBadge({ result, size = "md" }: { result: string; size?: "sm" | "md" }) {
  const m = resultMeta(result);
  const Icon = resultIcon(result);
  const pad = size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] font-semibold ${pad}`}
      style={{
        backgroundColor: `var(--color-result-${m.tokenKey}-soft)`,
        color: `var(--color-result-${m.tokenKey})`,
      }}
    >
      <Icon aria-hidden="true" className={`${iconSize} shrink-0`} />
      <span>{m.label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 入力欄の「×」クリアボタン                                           */
/* ------------------------------------------------------------------ */

/**
 * 検索・キーワード入力欄の右側に置く「×」ボタン。押すとその欄を空にする。
 * 呼び出し側で `relative` なラッパーの中に置き、入力欄の右パディングを空ける
 * (例: `pr-10`)。入力が空のときは描画しない。
 */
export function ClearFieldButton({
  onClick,
  label = "入力を消す",
  className = "",
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`tap-target absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${className}`}
    >
      <IconX aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* サンプル(仮データ)バッジ                                            */
/* ------------------------------------------------------------------ */

/**
 * 管理者が用意した仮データ (公開済み) を、利用者が実在の体験と誤認しないための小さな目印
 * (実装指示書 14 / 23)。デザインは崩さず、必要最小限の表示にとどめる。
 */
export function SampleBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink-muted)] ${className}`}
      title="運営が用意したサンプルです。実在の人の体験ではありません。"
    >
      サンプル
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 補足・注意書き                                                       */
/* ------------------------------------------------------------------ */

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn";
  title?: string;
  children: ReactNode;
}) {
  const bg = tone === "warn" ? "var(--color-accent-soft)" : "var(--color-primary-soft)";
  return (
    <div
      className="rounded-[var(--radius-md)] p-4 text-sm"
      style={{ backgroundColor: bg }}
      role="note"
    >
      {title && <p className="mb-1 font-bold">{title}</p>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 空状態                                                              */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon = IconSearch,
  title,
  children,
}: {
  icon?: (p: ComponentProps<"svg">) => ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card p-8 text-center">
      <Icon
        aria-hidden="true"
        className="mx-auto h-8 w-8 text-[var(--color-primary)]"
      />
      <p className="mt-2 text-lg font-bold">{title}</p>
      {children && <div className="mt-1 text-sm text-[var(--color-ink-muted)]">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 「困ったこと → 試したこと → 結果」などの縦フロー                      */
/* ------------------------------------------------------------------ */

export function StepFlow({ steps }: { steps: { label: string; body: ReactNode }[] }) {
  return (
    <ol className="relative space-y-4 pl-5">
      {/* 道の共通ガイド線 (指示書 §6)。線 2px / 接続点 10px を全画面で統一。 */}
      <span aria-hidden="true" className="road-guide absolute bottom-2 left-[4px] top-2" />
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden="true"
            className="road-dot absolute -left-5 top-1.5 ring-2 ring-[var(--color-surface)]"
          />
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            {s.label}
          </p>
          <div className="mt-0.5 whitespace-pre-wrap">{s.body}</div>
        </li>
      ))}
    </ol>
  );
}
