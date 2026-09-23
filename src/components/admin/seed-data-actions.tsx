"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { ADMIN_BTN } from "@/components/admin/admin-ui";

/**
 * 仮データ一覧の 1 行ぶんの操作 (実装指示書 4-1 / 10 / 11 / 12)。
 * 公開・非公開・削除はすべて 1 件ずつ。一括操作は用意しない。
 * ボタンの色・サイズは他の管理画面（admin-actions.tsx）と共通の `ADMIN_BTN` を使う
 * （指示書「管理画面 UI表示・カラー統一指示書 v1」§14/§15/§25。以前はこのファイル独自の
 * サイズ・色で個別実装しており、他画面のボタンとサイズ・色が揃っていなかった）。
 */

const BTN_PRIMARY = ADMIN_BTN.success;
const BTN_PLAIN = ADMIN_BTN.neutral;
const BTN_DANGER = ADMIN_BTN.danger;

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
