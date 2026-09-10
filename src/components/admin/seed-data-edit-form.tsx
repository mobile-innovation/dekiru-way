"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import {
  SeedDraftFields,
  seedDraftToPayload,
  type SeedDraftValue,
} from "@/components/admin/seed-draft-fields";

/**
 * 仮データ 1 件の編集 (実装指示書 4 / 8)。PATCH /api/admin/seed-data/{roadId}。
 */

const BTN =
  "tap-target inline-flex items-center justify-center rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-semibold disabled:opacity-50";
const BTN_PRIMARY = `${BTN} border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-ink)]`;
const BTN_PLAIN = `${BTN} border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] text-[var(--color-ink-muted)]`;

export function SeedDataEditForm({
  roadId,
  initial,
}: {
  roadId: string;
  initial: SeedDraftValue;
}) {
  const router = useRouter();
  const [value, setValue] = useState<SeedDraftValue>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (value.method.trim().length === 0) {
      setError("「試したこと」を入力してください");
      return;
    }
    start(async () => {
      try {
        await api.patch(`/api/admin/seed-data/${roadId}`, seedDraftToPayload(value));
        setSaved(true);
        router.refresh();
      } catch (e2) {
        setError(e2 instanceof ClientApiError ? e2.message : "保存できませんでした");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <SeedDraftFields value={value} onChange={(patch) => setValue((v) => ({ ...v, ...patch }))} />

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">
          {error}
        </p>
      )}
      {saved && <p className="text-sm text-[var(--color-ink-muted)]">保存しました。</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={BTN_PRIMARY}>
          {pending ? "保存中…" : "保存"}
        </button>
        <a href="/admin/seed-data" className={BTN_PLAIN}>
          一覧へ戻る
        </a>
      </div>
    </form>
  );
}
