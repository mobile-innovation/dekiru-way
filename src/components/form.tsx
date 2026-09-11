"use client";

import { useId, type ChangeEvent, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { IconCircleAlert, IconX } from "@/components/icons";

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
        <p
          id={errId}
          className="flex items-start gap-1.5 text-sm font-medium text-[var(--color-danger)]"
        >
          <IconCircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
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

// min-w-0: <input type="date"> はスマホの一部ブラウザでネイティブ表示に必要な幅を
// 「内容の最小幅」として持ち、w-full だけでは親幅より広がって右にはみ出ることがある。
// min-w-0 で明示的にその最小幅を無効化し、指定した幅まで縮められるようにする。
const CONTROL =
  "w-full min-w-0 rounded-[var(--radius-md)] border bg-[var(--color-surface)] px-3.5 py-2.5 text-base shadow-[0_1px_2px_rgba(46,42,38,0.04)]";
const CONTROL_OK = "border-[var(--color-border)]";
const CONTROL_ERR = "border-[var(--color-danger)]";
// 読み取り専用（確定して変更できない項目）は、編集できないと分かる見た目にする。
const CONTROL_LOCKED = "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] cursor-not-allowed";
// pr-9: 右に重ねる自前アイコン（下の CONTROL_DATE_STYLE）の分の余白。
// overflow-hidden は付けない: iOS Safari のネイティブ日付コントロールに付けると、
// 単なる描画クリップでは済まずページ全体が実際に横スクロールする副作用が確認されたため。
const CONTROL_DATE = "pr-9";
// iOS Safari はカレンダーアイコンを描画しない（枠全体がタップ領域になるだけ）ため、
// 目印として背景画像でアイコンを右に重ねる。wrapper要素 + absolute 配置は iOS の日付欄を
// 実際にページ幅より広げる副作用があったため不採用（input 自身の background-image なら
// レイアウトに一切影響しない）。色は --color-ink-muted の固定値（このアプリにダークテーマは無い）。
const CONTROL_DATE_STYLE: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23595248' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='4' rx='2'/%3E%3Cpath d='M16 2v4'/%3E%3Cpath d='M8 2v4'/%3E%3Cpath d='M3 10h18'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.875rem center",
  backgroundSize: "1rem",
};

export function TextField({
  label,
  hint,
  error,
  required,
  id,
  onChange,
  ...rest
}: { label: string; hint?: ReactNode; error?: string | null } & ComponentProps<"input">) {
  const max = typeof rest.maxLength === "number" ? rest.maxLength : undefined;
  // 文字数カウンタは自由記述向け。date/number など長さの概念が無いものには付けない。
  const countable = max !== undefined && (rest.type === undefined || rest.type === "text" || rest.type === "search");
  // 日付欄は値があるときだけ、明示的に消せるボタンを添える。スマホ（特に iOS Safari）は
  // ネイティブの日付ダイアログに値を消す手段が無く、一度選ぶと OS 側の操作だけでは
  // 空に戻せないことがあるため（任意項目なので、選び直し以外に空へ戻す手段が要る）。
  const clearableDate = rest.type === "date" && Boolean(rest.value);
  function clearDate() {
    onChange?.({ target: { value: "" } } as ChangeEvent<HTMLInputElement>);
  }
  return (
    <Field
      label={label}
      hint={withMaxHint(hint, countable ? max : undefined)}
      error={error}
      required={required}
      id={id}
      footer={
        countable ? (
          <CharCount value={rest.value} max={max!} />
        ) : clearableDate ? (
          <button
            type="button"
            onClick={clearDate}
            className="tap-target -ml-2 inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-1 text-xs font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
          >
            <IconX aria-hidden="true" className="h-3.5 w-3.5" />
            日付を消す
          </button>
        ) : undefined
      }
    >
      {({ id: fid, describedBy, invalid }) => (
        <input
          id={fid}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={onChange}
          className={`${CONTROL} ${invalid ? CONTROL_ERR : CONTROL_OK} ${
            rest.readOnly || rest.disabled ? CONTROL_LOCKED : ""
          } ${rest.type === "date" ? CONTROL_DATE : ""}`}
          style={rest.type === "date" ? CONTROL_DATE_STYLE : undefined}
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
          className={`${CONTROL} ${invalid ? CONTROL_ERR : CONTROL_OK} ${
            rest.readOnly || rest.disabled ? CONTROL_LOCKED : ""
          }`}
          {...rest}
        />
      )}
    </Field>
  );
}
