import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { AdminLoginForm } from "@/components/admin/admin-actions";

// 管理機能の入口だと分かる語（管理画面 / 管理者 / 運営者）は画面にもタブにも出さない。
// 検索エンジンにも登録させない。
export const metadata: Metadata = {
  title: "ログイン",
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 py-10 sm:py-16">
      <p className="text-lg font-bold">できる道</p>

      <div className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)] sm:p-8">
        <h1 className="text-base font-bold">ログイン</h1>
        <div className="mt-5">
          <AdminLoginForm />
        </div>
      </div>
    </div>
  );
}
