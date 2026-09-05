import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";
import { AdminLoginForm } from "@/components/admin/admin-actions";

export default async function AdminLoginPage() {
  if (await getAdminSession()) redirect("/admin");

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="mb-1 text-lg font-bold">管理画面ログイン</h1>
      <p className="mb-6 text-sm text-[var(--color-ink-muted)]">
        運営者向けです。アプリのログイン（Google）とは別のアカウントです。
      </p>
      <AdminLoginForm />
    </div>
  );
}
