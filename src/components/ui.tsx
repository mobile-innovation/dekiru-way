import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { resultMeta } from "@/lib/constants";

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
  const pad = size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] font-semibold ${pad}`}
      style={{
        backgroundColor: `var(--color-result-${m.tokenKey}-soft)`,
        color: `var(--color-result-${m.tokenKey})`,
      }}
    >
      <span aria-hidden="true">{m.icon}</span>
      <span>{m.label}</span>
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
  icon = "🔎",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card p-8 text-center">
      <p className="text-3xl" aria-hidden="true">
        {icon}
      </p>
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
    <ol className="relative space-y-4 border-l-2 border-[var(--color-border)] pl-5">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span
            aria-hidden="true"
            className="absolute -left-[27px] top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--color-primary)]"
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
