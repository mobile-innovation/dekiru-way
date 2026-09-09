import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUserId } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui";
import { DeleteAccount } from "@/components/delete-account";

export const metadata: Metadata = { title: "アカウント設定" };

/**
 * アカウント設定（アカウント設定指示書）。
 * プロフィール編集画面ではない。自分のデータ件数の確認と、アカウント削除だけ。
 * 件数はカウンターカラムを持たず、既存データから毎回集計する。
 */
export default async function AccountPage() {
  const userId = await requirePageUserId("/me/account");

  const [roadCount, attemptCount, publishedCount] = await Promise.all([
    prisma.road.count({ where: { userId } }),
    prisma.attempt.count({ where: { road: { userId } } }),
    prisma.attempt.count({ where: { road: { userId }, isPublished: true } }),
  ]);

  const rows: { label: string; value: number }[] = [
    { label: "自分の道", value: roadCount },
    { label: "試したこと", value: attemptCount },
    { label: "公開した経験", value: publishedCount },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <p className="text-sm">
        <Link href="/me">← 自分の道の一覧へ戻る</Link>
      </p>

      <h1 className="text-xl font-bold">アカウント設定</h1>

      <Card as="section" className="space-y-3">
        <h2 className="text-base font-bold">あなたのデータ</h2>
        <dl className="divide-y divide-[var(--color-border)]">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between py-2.5">
              <dt className="text-sm">{r.label}</dt>
              <dd className="text-sm font-bold tabular-nums">{r.value} 件</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-bold">アカウント</h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          このアカウントに登録されているデータ（自分の道・試したこと・公開した経験）を削除できます。
          Google アカウントそのものは削除されません。
        </p>
        <DeleteAccount />
      </section>
    </div>
  );
}
