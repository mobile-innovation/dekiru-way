import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { env } from "@/lib/env";
import { Card, Callout } from "@/components/ui";
import { GoogleSigninButton } from "@/components/google-signin";
import { DevLogin } from "@/components/dev-login";

export const metadata: Metadata = {
  title: "ログイン",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect("/me");

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-xl font-bold">ログイン</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        経験を探すだけならログインは要りません。
        <strong>自分の道を作って記録を残す</strong>ときにログインします。
      </p>

      <Card className="space-y-4">
        {env.auth.googleConfigured ? (
          <Suspense fallback={<p>読み込み中…</p>}>
            <GoogleSigninButton />
          </Suspense>
        ) : (
          <Callout tone="warn" title="Google ログインは未設定です">
            管理者は <code>AUTH_GOOGLE_ID</code> / <code>AUTH_GOOGLE_SECRET</code> を設定してください。
          </Callout>
        )}

        {env.e2eTestLogin && (
          <Suspense fallback={null}>
            <DevLogin />
          </Suspense>
        )}
      </Card>

      <p className="text-xs text-[var(--color-ink-muted)]">
        ログインすると、あなたの道と記録がこのアカウントに保存されます。公開するかどうかは、
        記録ごとにあなたが決められます。
      </p>
    </div>
  );
}
