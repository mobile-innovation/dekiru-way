import type { ComponentProps, ReactNode } from "react";
import { IconCheckCircle, IconCircleAlert } from "@/components/icons";

/**
 * 管理画面のステータスバッジ・ボタンの共通見た目（指示書「管理画面 UI表示・カラー統一指示書 v1」）。
 * 「同じ意味には同じ色」を徹底するため、公開状態 (StatusBadge)・仮データの状態 (seed-data)・
 * AI 判定 (VerdictBadge) はすべてここの `Tone` 4 種類のどれかにマッピングして表示する。
 * カード本体の背景・枠線は状態で変えない（バッジだけで状態を示す）。
 */
export type AdminTone = "success" | "warning" | "neutral" | "danger";

const TONE_CLASS: Record<AdminTone, string> = {
  success:
    "border-[var(--color-status-success)] bg-[var(--color-status-success-soft)] text-[var(--color-status-success)]",
  warning:
    "border-[var(--color-status-warning)] bg-[var(--color-status-warning-soft)] text-[var(--color-status-warning)]",
  neutral:
    "border-[var(--color-status-neutral)] bg-[var(--color-status-neutral-soft)] text-[var(--color-ink-muted)]",
  danger:
    "border-[var(--color-status-danger)] bg-[var(--color-status-danger-soft)] text-[var(--color-status-danger)]",
};

/** tone ごとの既定アイコン。無理に全 tone へ当てはめず、意味が合う success/danger だけに絞る。 */
const TONE_ICON: Partial<Record<AdminTone, (p: ComponentProps<"svg">) => ReactNode>> = {
  success: IconCheckCircle,
  danger: IconCircleAlert,
};

/**
 * 状態バッジ（公開状態・仮データの状態・AI 判定 など）の共通コンポーネント。
 * 高さ・padding・角丸・文字サイズ・枠線・アイコン位置をここ 1 箇所に揃える。
 */
export function AdminBadge({
  tone,
  icon,
  children,
}: {
  tone: AdminTone;
  /** 既定アイコンを使わない／消したいときだけ指定（`null` で非表示）。 */
  icon?: ((p: ComponentProps<"svg">) => ReactNode) | null;
  children: ReactNode;
}) {
  const Icon = icon === undefined ? TONE_ICON[tone] : icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-bold ${TONE_CLASS[tone]}`}
    >
      {Icon && <Icon aria-hidden="true" className="h-3 w-3 shrink-0" />}
      {children}
    </span>
  );
}

/** 管理画面のボタン共通見た目。意味ごとに色を固定する（指示書 §14）。 */
const ADMIN_BTN_BASE =
  "tap-target inline-flex items-center justify-center gap-1 rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm font-semibold disabled:opacity-50";

export const ADMIN_BTN = {
  /** 主操作（公開する／やっぱり公開する 等）。ブランドの緑系。 */
  success: `${ADMIN_BTN_BASE} border-[var(--color-status-success)] bg-[var(--color-status-success-soft)] text-[var(--color-status-success)]`,
  /** 非公開操作（公開しない／公開を停止 等）とニュートラルな操作（保留・編集）。危険操作ではない。 */
  neutral: `${ADMIN_BTN_BASE} border-[var(--color-status-neutral)] bg-[var(--color-status-neutral-soft)] text-[var(--color-ink-muted)]`,
  /** 危険操作（削除 等）だけに使う。 */
  danger: `${ADMIN_BTN_BASE} border-[var(--color-status-danger)] bg-[var(--color-surface)] text-[var(--color-status-danger)]`,
};
