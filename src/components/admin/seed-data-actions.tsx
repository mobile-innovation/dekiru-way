"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ClientApiError } from "@/lib/client/api";

/**
 * 仮データ一覧の 1 行ぶんの操作 (実装指示書 4-1 / 10 / 11 / 12)。
 * 公開・非公開・削除はすべて 1 件ずつ。一括操作は用意しない。
 */

const BTN =
  "tap-target inline-flex items-center justify-center rounded-[var(--radius-pill)] border px-3 py-1 text-xs font-semibold disabled:opacity-50";
const BTN_PRIMARY = `${BTN} border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent-strong)]`;
const BTN_PLAIN = `${BTN} border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] text-[var(--color-ink-muted)]`;
const BTN_DANGER = `${BTN} border-[var(--color-danger)] bg-[var(--color-surface)] text-[var(--color-danger)]`;

export function SeedRowActions({
  roadId,
  isPublished,
}: {
  roadId: string;
  isPublished: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>, done: string) {
    setMsg(null);
    start(async () => {
      try {
        await fn();
        setMsg(done);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof ClientApiError ? e.message : "操作できませんでした");
      }
    });
  }

  function publish() {
    if (!confirm("この仮データを公開しますか？\n公開すると一般の経験検索に表示されます。")) return;
    run(() => api.post(`/api/admin/seed-data/${roadId}/publish`), "公開しました");
  }

  function unpublish() {
    if (!confirm("この仮データを非公開に戻しますか？\n一般の検索結果から表示されなくなります。")) return;
    run(() => api.post(`/api/admin/seed-data/${roadId}/unpublish`), "非公開にしました");
  }

  function remove() {
    if (!confirm("この仮データを削除しますか？\n\nこの操作は取り消せません。")) return;
    run(() => api.del(`/api/admin/seed-data/${roadId}`), "削除しました");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Link href={`/admin/seed-data/${roadId}/edit`} className={BTN_PLAIN}>
        編集
      </Link>
      {isPublished ? (
        <button type="button" disabled={pending} onClick={unpublish} className={BTN_PLAIN}>
          非公開にする
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={publish} className={BTN_PRIMARY}>
          公開
        </button>
      )}
      <button type="button" disabled={pending} onClick={remove} className={BTN_DANGER}>
        削除
      </button>
      {msg && <span className="w-full text-[11px] text-[var(--color-ink-muted)]">{msg}</span>}
    </div>
  );
}
