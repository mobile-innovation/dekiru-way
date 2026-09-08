import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { dashboardStats, recentActivity } from "@/lib/admin/queries";

export const dynamic = "force-dynamic";

function mmdd(d: Date) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** 「確認が必要」カード: 件数 + 何の件数か + 操作 をひとまとめにする。 */
function ReviewCard({
  href,
  noun,
  count,
  hint,
}: {
  href: string;
  noun: string;
  count: number;
  hint: string;
}) {
  const has = count > 0;
  return (
    <Link
      href={href}
      className={`block rounded-[var(--radius-lg)] border p-4 transition-shadow hover:shadow-[var(--shadow-card)] ${
        has
          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <p className="text-sm font-bold">{noun}の確認</p>
      {has ? (
        <p className="mt-1 text-base">
          <span className="text-2xl font-bold">{count}</span> 件あります
        </p>
      ) : (
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">今はありません</p>
      )}
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{hint}</p>
      <p
        className={`mt-2 text-sm font-semibold ${
          has ? "text-[var(--color-accent-strong)]" : "text-[var(--color-ink-muted)]"
        }`}
      >
        {has ? "確認する →" : "一覧を見る →"}
      </p>
    </Link>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{label}</div>
    </div>
  );
}

const MENU: { href: string; label: string; ready: boolean }[] = [
  { href: "/admin/moderation", label: "経験を確認する", ready: true },
  { href: "/admin/roads", label: "道を確認する", ready: true },
  { href: "/admin/posts", label: "公開されている経験を見る", ready: true },
  { href: "/admin/audit", label: "操作ログを見る", ready: true },
  { href: "", label: "利用者を見る（準備中）", ready: false },
  { href: "", label: "通報・対応を見る（準備中）", ready: false },
];

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [s, activity] = await Promise.all([dashboardStats(), recentActivity()]);
  const needsReview = s.pending + s.roadPending;

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-bold">できる道 管理</h1>

      {/* 確認が必要 — 最初に見るべきもの */}
      <section aria-labelledby="need-review" className="space-y-3">
        <h2 id="need-review" className="text-base font-bold">
          確認が必要
        </h2>
        {needsReview === 0 && (
          <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-4 text-sm">
            いま確認が必要なものはありません。
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <ReviewCard
            href="/admin/roads"
            noun="道"
            count={s.roadPending}
            hint="道の内容が公開してよいか確認してください"
          />
          <ReviewCard
            href="/admin/moderation"
            noun="経験"
            count={s.pending}
            hint="公開してよい内容か確認してください"
          />
        </div>
      </section>

      {/* 現在の状況 */}
      <section aria-labelledby="status" className="space-y-3">
        <h2 id="status" className="text-base font-bold">
          現在の状況
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard value={s.users} label="利用者" />
          <StatCard value={s.roads} label="道" />
          <StatCard value={s.approved} label="公開されている経験" />
          <StatCard value={s.recentApproved} label="直近7日に公開・更新" />
        </div>
        {(s.rejected > 0 || s.roadRejected > 0) && (
          <p className="text-xs text-[var(--color-ink-muted)]">
            公開を停止した経験 {s.rejected} 件 ・ 道 {s.roadRejected} 件（
            <Link href="/admin/posts?status=rejected" className="underline">
              経験
            </Link>{" "}
            /{" "}
            <Link href="/admin/roads?status=rejected" className="underline">
              道
            </Link>
            ）
          </p>
        )}
      </section>

      {/* 最近の動き（実データがあるときだけ） */}
      {activity.length > 0 && (
        <section aria-labelledby="recent" className="space-y-3">
          <h2 id="recent" className="text-base font-bold">
            最近の動き
          </h2>
          <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)]">
            {activity.map((a, i) => (
              <li key={i}>
                <Link
                  href={a.href}
                  className="flex items-baseline gap-x-3 p-3 text-sm hover:bg-[var(--color-surface-sunken)]"
                >
                  <span className="shrink-0 text-xs tabular-nums text-[var(--color-ink-muted)]">
                    {mmdd(a.at)}
                  </span>
                  <span className="line-clamp-1">{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 管理メニュー */}
      <section aria-labelledby="menu" className="space-y-3">
        <h2 id="menu" className="text-base font-bold">
          管理メニュー
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {MENU.map((m) =>
            m.ready ? (
              <Link
                key={m.label}
                href={m.href}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold hover:shadow-[var(--shadow-card)]"
              >
                {m.label}
              </Link>
            ) : (
              <span
                key={m.label}
                aria-disabled="true"
                className="cursor-not-allowed rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-ink-muted)]"
              >
                {m.label}
              </span>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
