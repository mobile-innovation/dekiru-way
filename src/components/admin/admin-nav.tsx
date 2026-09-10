"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 管理画面のメインナビゲーション。管理機能への入口はここに一本化する
 * （ダッシュボード下部に「管理メニュー」を別途置かない）。
 * 現在のページは `aria-current` ＋ 太字 ＋ 背景で示す（色だけに依存しない）。
 */

const NAV: { href: string; label: string; exact?: boolean }[] = [
  { href: "/admin", label: "ダッシュボード", exact: true },
  { href: "/admin/moderation", label: "経験を確認" },
  { href: "/admin/posts", label: "公開されている経験" },
  { href: "/admin/seed-data", label: "仮データ管理" },
  { href: "/admin/audit", label: "操作ログ" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="管理メニュー" className="flex flex-wrap gap-1">
      {NAV.map((n) => {
        const active = n.exact
          ? pathname === n.href
          : pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={`tap-target inline-flex items-center rounded-[var(--radius-pill)] px-3 py-1.5 text-sm no-underline transition-colors ${
              active
                ? "bg-[var(--color-primary-soft)] font-bold text-[var(--color-ink)]"
                : "font-semibold text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-ink)]"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
