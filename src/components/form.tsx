"use client";

import { useId, type ComponentProps, type ReactNode } from "react";

/**
 * フォーム部品。
 * - ラベルは必ず関連付け (htmlFor / id)
 * - ヒントとエラーは aria-describedby で読み上げに含める
 * - エラーは色だけでなく文言で説明する (指示書 9)
 */

interface FieldShellProps {
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** コントロールの下・エラーの上に出す補足（例: 残り文字数カウンタ） */
  footer?: ReactNode;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ id, label, hint, error, required, footer, children }: FieldShellProps) {
  const reactId = useId();
  const fid = id ?? reactId;
  const hintId = hint ? `${fid}-hint` : undefined;
  const errId = error ? `${fid}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={fid} className="block text-sm font-bold">
        {label}
        {required && (
          <span className="ml-1 text-[var(--color-danger)]" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only">（必須）</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-[var(--color-ink-muted)]">
          {hint}
        </p>
      )}
      {children({ id: fid, describedBy, invalid: Boolean(error) })}
      {footer}
      {error && (
        <p id={errId} className="text-sm font-medium text-[var(--color-danger)]">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * 残り文字数カウンタ。読み上げ用の「最大 N 文字」は hint 側（focus 時に 1 回読まれる）に入れ、
 * こちらは目視用なので aria-hidden。
 */
function CharCount({ value, max }: { value: unknown; max: number }) {
  const len = typeof value === "string" ? value.length : 0;
  const tone =
    len > max
      ? "text-[var(--color-danger)] font-bold"
      : len >= max * 0.9
        ? "text-[var(--color-ink)]"
        : "text-[var(--color-ink-muted)]";
  return (
    <p aria-hidden="true" className={`text-right text-xs tabular-nums ${tone}`}>
      {len} / {max} 文字
    </p>
  );
}

function withMaxHint(hint: ReactNode, max: number | undefined): ReactNode {
  if (max === undefined) return hint;
  return (
    <>
      {hint}
      {hint ? "・" : null}最大 {max} 文字
    </>
  );
}

const CONTROL =
  "w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3.5 py-2.5 text-base";
const CONTROL_OK = "border-[var(--color-border)]";
const CONTROL_ERR = "border-[var(--color-danger)]";

export function TextField({
  label,
  hint,
  error,
  required,
  id,
  ...rest
}: { label: string; hint?: ReactNode; error?: string | null } & ComponentProps<"input">) {
  const max = typeof rest.maxLength === "number" ? rest.maxLength : undefined;
  // 文字数カウンタは自由記述向け。date/number など長さの概念が無いものには付けない。
  const countable = max !== undefined && (rest.type === undefined || rest.type === "text" || rest.type === "search");
  return (
    <Field
      label={label}
      hint={withMaxHint(hint, countable ? max : undefined)}
      error={error}
      required={required}
      id={id}
      footer={countable ? <CharCount value={rest.value} max={max!} /> : undefined}
    >
      {({ id: fid, describedBy, invalid }) => (
        <input
          id={fid}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} ${invalid ? CONTROL_ERR : CONTROL_OK}`}
          {...rest}
        />
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  required,
  id,
  rows = 4,
  ...rest
}: { label: string; hint?: ReactNode; error?: string | null } & ComponentProps<"textarea">) {
  const max = typeof rest.maxLength === "number" ? rest.maxLength : undefined;
  return (
    <Field
      label={label}
      hint={withMaxHint(hint, max)}
      error={error}
      required={required}
      id={id}
      footer={max !== undefined ? <CharCount value={rest.value} max={max} /> : undefined}
    >
      {({ id: fid, describedBy, invalid }) => (
        <textarea
          id={fid}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${CONTROL} ${invalid ? CONTROL_ERR : CONTROL_OK}`}
          {...rest}
        />
      )}
    </Field>
  );
}
