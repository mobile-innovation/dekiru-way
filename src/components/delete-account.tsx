"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { IconCircleAlert } from "@/components/icons";
import { api, ClientApiError } from "@/lib/client/api";

/**
 * アカウント削除（アカウント設定指示書 §7 / §8）。
 * - ボタンを押しただけでは消さない。確認パネルを出す。
 * - 消えるもの（自分の道 / 試したこと / 公開した経験）と、取り消せないことを明示する。
 * - 「アカウントを削除する」で `DELETE /api/v1/me` を呼び、成功したらトップへ（＝ログアウト状態）。
 */
export function DeleteAccount() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.del("/api/v1/me");
      router.push("/");
      router.refresh();
    } catch (e) {
      setBusy(false);
      setError(
        e instanceof ClientApiError
          ? e.message
          : "削除できませんでした。時間をおいて、もう一度お試しください。",
      );
    }
  }

  if (!confirming) {
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        アカウントを削除
      </Button>
    );
  }

  return (
    <div
      role="alertdialog"
      aria-labelledby="delete-account-title"
      aria-describedby="delete-account-desc"
      className="space-y-3 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4"
    >
      <p id="delete-account-title" className="flex items-center gap-2 font-bold">
        <IconCircleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-danger)]" />
        アカウントを削除しますか？
      </p>
      <div id="delete-account-desc" className="space-y-2 text-sm">
        <p>アカウントを削除すると、以下のデータが削除されます。</p>
        <ul className="list-disc space-y-0.5 pl-5">
          <li>自分の道</li>
          <li>試したこと</li>
          <li>公開した経験</li>
        </ul>
        <p className="font-bold">この操作は取り消せません。</p>
        <p className="text-[var(--color-ink-muted)]">
          Google アカウントそのものは削除されません。
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
          キャンセル
        </Button>
        <Button variant="danger" onClick={remove} disabled={busy}>
          {busy ? "削除中…" : "アカウントを削除する"}
        </Button>
      </div>
    </div>
  );
}
