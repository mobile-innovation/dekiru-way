"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * ヘッダーのナビリンク。いま開いているページ（配下のページを含む。例: /experiences/[id] は
 * 「経験を探す」）だけを太字にし、aria-current="page" で読み上げにも伝える。
 */
export function HeaderNavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`rounded-[var(--radius-pill)] px-3 py-2 no-underline hover:bg-[var(--color-surface-sunken)] ${
        current ? "font-bold" : ""
      }`}
    >
      {children}
    </Link>
  );
}
