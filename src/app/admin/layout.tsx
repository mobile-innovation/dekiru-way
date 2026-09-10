import type { Metadata } from "next";
import { getAdminSession } from "@/lib/admin/auth";
import { AdminLogoutButton } from "@/components/admin/admin-actions";
import { AdminNav } from "@/components/admin/admin-nav";

export const metadata: Metadata = {
  title: "管理",
  // 管理系ページは検索エンジンに登録・キャッシュさせない（login ページは自前 metadata で上書き）。
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // ここでは redirect しない (login ページも同じ layout を通るため)。
  // 各保護ページ側で requireAdmin() を呼ぶ。
  const admin = await getAdminSession();

  return (
    <div className="mx-auto w-full max-w-5xl">
      {admin && (
        <header className="mb-8 border-b border-[var(--color-border)] py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-base font-bold">できる道 管理</span>
            <AdminNav />
            <span className="ml-auto flex items-center gap-3 text-xs text-[var(--color-ink-muted)]">
              <span>{admin.displayName ?? admin.email}</span>
              <AdminLogoutButton />
            </span>
          </div>
        </header>
      )}
      {children}
    </div>
  );
}
