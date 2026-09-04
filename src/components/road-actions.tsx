"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { IconGlobe, IconLock, IconTrash } from "@/components/icons";

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
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] text-[var(--color-ink-muted)]"
        }`}
      >
        {on ? (
          <IconGlobe aria-hidden="true" className="h-4 w-4 shrink-0" />
        ) : (
          <IconLock aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        {on ? "経験として公開中" : "自分だけに表示"}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-[var(--color-ink-muted)]">
        {msg}
      </span>
    </span>
  );
}

/* 道全体の公開/非公開。押したときの表示変更は AttemptPublishToggle と同じにそろえる
   （公開中はオレンジの下地＋枠、非公開はグレー、操作後に状態メッセージを出す）。 */
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
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle() {
    const next = vis === "public" ? "private" : "public";
    setBusy(true);
    setMsg(null);
    try {
      await api.patch(`/api/v1/roads/${roadId}`, { visibility: next });
      setVis(next);
      setMsg(next === "public" ? "公開しました" : "公開をやめました");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof ClientApiError ? e.message : "変更できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const on = vis === "public";
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
            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            : "border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] text-[var(--color-ink-muted)]"
        }`}
      >
        {on ? (
          <IconGlobe aria-hidden="true" className="h-4 w-4 shrink-0" />
        ) : (
          <IconLock aria-hidden="true" className="h-4 w-4 shrink-0" />
        )}
        {on ? "道のページを公開中" : "道のページは非公開"}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-[var(--color-ink-muted)]">
        {msg}
      </span>
    </span>
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
      className="tap-target inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-danger)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-danger)] disabled:opacity-50"
    >
      <IconTrash aria-hidden="true" className="h-4 w-4 shrink-0" />
      {pending ? "削除中…" : "この道を削除"}
    </button>
  );
}
