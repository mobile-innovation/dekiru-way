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
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

export function Field({ id, label, hint, error, required, children }: FieldShellProps) {
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
      {error && (
        <p id={errId} className="text-sm font-medium text-[var(--color-danger)]">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
    </div>
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
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
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
  return (
    <Field label={label} hint={hint} error={error} required={required} id={id}>
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
