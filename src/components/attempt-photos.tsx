"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "@/lib/client/api";
import type { PhotoDTO } from "@/lib/serializers";

/** 編集画面で既存の写真を表示・削除する。 */
export function AttemptPhotos({ attemptId, photos }: { attemptId: string; photos: PhotoDTO[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (photos.length === 0) return null;

  function remove(photoId: string) {
    if (!confirm("この写真を削除しますか？")) return;
    start(async () => {
      await api.del(`/api/v1/attempts/${attemptId}/photos/${photoId}`);
      setMsg("写真を削除しました");
      router.refresh();
    });
  }

  return (
    <div>
      <p className="text-sm font-bold">いまの写真</p>
      <ul className="mt-2 flex flex-wrap gap-3">
        {photos.map((p) => (
          <li key={p.id} className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.storageUrl}
              alt={p.caption ?? "試したときの写真"}
              className="h-24 w-24 rounded-[var(--radius-sm)] object-cover"
            />
            <button
              type="button"
              onClick={() => remove(p.id)}
              disabled={pending}
              className="mt-1 text-xs text-[var(--color-danger)] underline disabled:opacity-50"
            >
              削除
            </button>
          </li>
        ))}
      </ul>
      <span role="status" aria-live="polite" className="text-xs text-[var(--color-ink-muted)]">
        {msg}
      </span>
    </div>
  );
}
