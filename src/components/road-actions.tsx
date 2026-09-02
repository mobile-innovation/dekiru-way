"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ClientApiError } from "@/lib/client/api";

/* 試したことの公開スイッチ (指示書 14: 個別 Attempt 単位で公開) */
export function AttemptPublishToggle({
  attemptId,
  initial,
}: {
  attemptId: string;
  initial: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setMsg(null);
    try {
      await api.patch(`/api/v1/attempts/${attemptId}`, { isPublished: next });
      setOn(next);
      setMsg(next ? "公開しました" : "公開をやめました");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof ClientApiError ? e.message : "変更できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        disabled={busy}
        className={`tap-target inline-flex items-center gap-2 rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm font-semibold disabled:opacity-60 ${
          on
            ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)]"
            : "border-[var(--color-border)] bg-[var(--color-surface)]"
        }`}
      >
        <span aria-hidden="true">{on ? "👁️" : "🔒"}</span>
        {on ? "経験として公開中" : "自分だけに表示"}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-[var(--color-ink-muted)]">
        {msg}
      </span>
    </span>
  );
}

/* 道全体の公開/非公開 */
export function RoadVisibilityToggle({
  roadId,
  initial,
}: {
  roadId: string;
  initial: "private" | "public";
}) {
  const router = useRouter();
  const [vis, setVis] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = vis === "public" ? "private" : "public";
    setBusy(true);
    try {
      await api.patch(`/api/v1/roads/${roadId}`, { visibility: next });
      setVis(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={vis === "public"}
      onClick={toggle}
      disabled={busy}
      className="tap-target inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold disabled:opacity-60"
    >
      <span aria-hidden="true">{vis === "public" ? "🌏" : "🔒"}</span>
      {vis === "public" ? "道のページを公開中" : "道のページは非公開"}
    </button>
  );
}

export function DeleteAttemptButton({ attemptId }: { attemptId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function del() {
    if (!confirm("この記録を削除しますか？（元に戻せません）")) return;
    start(async () => {
      await api.del(`/api/v1/attempts/${attemptId}`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={del}
      disabled={pending}
      className="text-sm text-[var(--color-danger)] underline disabled:opacity-50"
    >
      削除
    </button>
  );
}

export function DeleteRoadButton({ roadId }: { roadId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function del() {
    if (!confirm("この道と、ひも付く記録をすべて削除しますか？（元に戻せません）")) return;
    start(async () => {
      await api.del(`/api/v1/roads/${roadId}`);
      router.push("/me");
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={del}
      disabled={pending}
      className="tap-target rounded-[var(--radius-pill)] border border-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-50"
    >
      {pending ? "削除中…" : "この道を削除"}
    </button>
  );
}
