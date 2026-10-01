"use client";

import type { ComponentProps, ReactNode } from "react";
import { IconCircleAlert } from "@/components/icons";
import { VoiceInputButton } from "@/components/voice-input-button";
import { ClientApiError } from "@/lib/client/api";

/**
 * 「道を編集」「道を育てる」で共通の部品（2026-10-01 画面分離）。
 * 色・余白は作成画面（road-form.tsx の fieldset）と同じトークン・クラス。
 */

/**
 * 意味のまとまりごとのカード: 緑枠 `--color-primary`、淡いグリーン下地 `--color-primary-tint` に
 * 白い入力欄が浮く、`--radius-lg`、`--shadow-card`。
 */
export function RoadFormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: (p: ComponentProps<"svg">) => ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-5 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-primary-tint)] p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/** エラー表示（作成画面と同じ見た目: アイコン＋入力が残っている旨） */
export function RoadFormError({
  error,
  submitLabel,
}: {
  error: string | null;
  submitLabel: string;
}) {
  if (!error) return null;
  return (
    <div
      className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]"
      role="alert"
    >
      <p className="flex items-start gap-1.5 font-medium">
        <IconCircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{error}</span>
      </p>
      <p className="mt-1 text-[var(--color-ink-muted)]">
        入力した内容は残っています。直してから、もう一度「{submitLabel}」を押せます。
      </p>
    </div>
  );
}

/**
 * 下部の保存ボタン。作成画面の「この道を作る」と同じ全幅の主ボタン＋アイコン。
 * 戻る／キャンセルは置かない（画面上部の「← 道へ戻る」で戻れる。2026-10-01）。
 */
export function RoadFormSubmit({
  busy,
  label,
  icon: Icon,
}: {
  busy: boolean;
  label: string;
  icon: (p: ComponentProps<"svg">) => ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      className="tap-target inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-[var(--color-primary-ink)] disabled:opacity-60"
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      {busy ? "保存中…" : label}
    </button>
  );
}

/** 音声入力: 作成画面と同じく、話した内容を既存の文の後ろに空白区切りで足す */
export function appendVoiceButton<T extends Record<string, string>>(
  k: keyof T,
  setV: (f: (p: T) => T) => void,
) {
  return (
    <VoiceInputButton onResult={(t) => setV((p) => ({ ...p, [k]: p[k] ? `${p[k]} ${t}` : t }))} />
  );
}

/** API エラーを画面全体の文言と項目ごとの文言に分ける */
export function apiErrorToMessages(e: unknown): {
  error: string;
  fieldErrors: Record<string, string>;
} {
  if (!(e instanceof ClientApiError)) return { error: "保存できませんでした。", fieldErrors: {} };
  const fieldErrors: Record<string, string> = {};
  if (Array.isArray(e.details)) {
    for (const d of e.details as { field: string; message: string }[])
      fieldErrors[d.field] = d.message;
  }
  return { error: e.message, fieldErrors };
}
