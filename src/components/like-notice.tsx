"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconSprout } from "@/components/icons";
import { api } from "@/lib/client/api";

/**
 * ログイン後トップ画面の上部に出す通知ボックス (いいね指示書 §11)。
 *
 * - 「あなたの経験にいいねが届いた」ことだけを伝える。
 * - 誰がいいねしたか・何件かは出さない (SNS 的な表現・数の強調をしない)。
 * - 「閉じる」で未読通知をすべて既読にして、次からは出さない。
 */
export function LikeNotice() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  if (hidden) return null;

  async function close() {
    if (busy) return;
    setBusy(true);
    setHidden(true);
    try {
      await api.post("/api/v1/notifications/read");
    } catch {
      /* 既読化に失敗しても画面上は閉じる。次回の表示で再試行される。 */
    }
    router.refresh();
  }

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-4"
    >
      <IconSprout aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-[var(--color-ink)]">
          あなたの経験が、誰かの次の一歩になりました
        </p>
        <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
          あなたの経験に「いいね」が届いています。
        </p>
      </div>
      <button
        type="button"
        onClick={close}
        disabled={busy}
        className="tap-target shrink-0 rounded-[var(--radius-pill)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary-hover)] hover:bg-[var(--color-surface)] disabled:opacity-60"
      >
        閉じる
      </button>
    </div>
  );
}
