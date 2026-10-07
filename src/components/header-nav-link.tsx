"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * ヘッダーのナビリンク。いま開いているページ（配下のページを含む。例: /experiences/[id] は
 * 「経験を探す」）だけを太字にし、aria-current="page" で読み上げにも伝える。
 * スマホ（sm 未満）はヘッダー 2 段目に並ぶので、タップ領域を高さ 44px（--tap-min）確保する。
 */
export function HeaderNavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded-[var(--radius-pill)] px-3 py-2 no-underline hover:bg-[var(--color-surface-sunken)] max-sm:inline-flex max-sm:min-h-[var(--tap-min)] max-sm:items-center max-sm:px-2 ${
        current ? "font-bold" : ""
      }`}
    >
      {children}
    </Link>
  );
}
