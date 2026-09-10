import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { AdminLoginForm } from "@/components/admin/admin-actions";

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-6 py-10 sm:py-16">
      {/* ブランド表示（控えめ） */}
      <div className="text-center">
        <p className="text-lg font-bold">できる道</p>
        <p className="text-sm text-[var(--color-ink-muted)]">管理画面</p>
      </div>

      {/* ログインカード */}
      <div className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)] sm:p-8">
        <h1 className="text-base font-bold">管理画面ログイン</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          できる道の運営・管理者専用です。アプリ利用者の Google
          ログインとは別のアカウントを使用します。
        </p>
        <div className="mt-5">
          <AdminLoginForm />
        </div>
      </div>
    </div>
  );
}
