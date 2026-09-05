"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * 一般利用者向けのサイト共通枠 (ヘッダー・フッター) を出し分ける。
 * 管理画面 (/admin/*) は業務画面として独立させ、利用者向けナビや
 * フッターの利用規約文言を出さない (管理画面UI改善指示書 v1 §13)。
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
