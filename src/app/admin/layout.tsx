import type { Metadata } from "next";
import Link from "next/link";
import { getAdminSession } from "@/lib/admin/auth";
import { AdminLogoutButton } from "@/components/admin/admin-actions";

export const metadata: Metadata = {
  title: "管理画面",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "ダッシュボード" },
  { href: "/admin/moderation", label: "経験を確認" },
  { href: "/admin/posts", label: "公開されている経験" },
  { href: "/admin/audit", label: "操作ログ" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // ここでは redirect しない (login ページも同じ layout を通るため)。
  // 各保護ページ側で requireAdmin() を呼ぶ。
  const admin = await getAdminSession();

  return (
    <div className="mx-auto w-full max-w-5xl">
      {admin && (
        <header className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--color-border)] pb-3">
          <span className="text-sm font-bold">できる道 管理</span>
          <nav className="flex flex-wrap gap-3 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="font-semibold hover:underline">
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="ml-auto flex items-center gap-3 text-xs text-[var(--color-ink-muted)]">
            {admin.displayName ?? admin.email}
            <AdminLogoutButton />
          </span>
        </header>
      )}
      {children}
    </div>
  );
}
