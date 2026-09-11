"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconChevronDown, IconUser } from "@/components/icons";
import { api } from "@/lib/client/api";
import { mergeLocalReadIds } from "@/lib/client/local-reads";

/**
 * ヘッダー右上のユーザー操作メニュー（アカウント設定指示書 §3）。
 * - アイコンを押すとメニューが開く。中身は「アカウント設定」「ログアウト」のみ。
 * - 「アカウントを削除」はここには置かない（誤操作防止。アカウント設定画面から行う）。
 * - プロフィール名・アバターは表示しない（サービスでユーザー属性を持たせない方針）。
 */
export function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    try {
      // ログアウトで既読情報が消えないよう、先にアカウント側の既読をブラウザへ引き継ぐ
      // (既読引き継ぎ指示書)。取得に失敗しても、ログアウト自体は妨げない。
      try {
        const { attemptIds } = await api.get<{ attemptIds: string[] }>("/api/v1/me/reads");
        mergeLocalReadIds(attemptIds);
      } catch {
        /* 既読の引き継ぎは補助機能。失敗してもログアウトは続行する */
      }
      await fetch("/api/v1/auth/logout", { method: "POST" });
      setOpen(false);
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="アカウントのメニュー"
        className="tap-target inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface-sunken)]"
      >
        <IconUser aria-hidden="true" className="h-5 w-5" />
        <IconChevronDown aria-hidden="true" className="h-4 w-4" />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="アカウント"
          className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1 shadow-[var(--shadow-lift)]"
        >
          <Link
            href="/me/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm no-underline hover:bg-[var(--color-surface-sunken)]"
          >
            アカウント設定
          </Link>
          <div className="my-1 border-t border-[var(--color-border)]" />
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={busy}
            className="block w-full px-4 py-2.5 text-left text-sm hover:bg-[var(--color-surface-sunken)] disabled:opacity-60"
          >
            {busy ? "ログアウト中…" : "ログアウト"}
          </button>
        </div>
      )}
    </div>
  );
}
