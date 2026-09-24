import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { dashboardStats, moderationQueue, postList, auditLog } from "@/lib/admin/queries";
import { ACTION_LABEL } from "@/components/admin/post-card";

export const dynamic = "force-dynamic";

function mmdd(d: Date) {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function clip(s: string, n = 24) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] p-4">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{label}</div>
    </div>
  );
}

/** 「最近の動き」の 1 ブロック。中身が無ければ「現在ありません」。 */
function RecentBlock({
  title,
  moreHref,
  empty,
  children,
}: {
  title: string;
  moreHref: string;
  empty: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold">{title}</p>
        {!empty && (
          <Link href={moreHref} className="text-xs text-[var(--color-ink-muted)] underline">
            すべて見る →
          </Link>
        )}
      </div>
      {empty ? (
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">現在ありません</p>
      ) : (
        <ul className="mt-2 space-y-1.5">{children}</ul>
      )}
    </div>
  );
}

export default async function AdminDashboardPage() {
  await requireAdmin();
  const [s, queue, published, audit] = await Promise.all([
    dashboardStats(),
    moderationQueue({ page: 1 }),
    postList({ status: "approved", page: 1 }),
    auditLog({ page: 1 }),
  ]);

  const needsReview = s.pendingActive;
  const reviewSample = queue.items.slice(0, 3);
  const recentPublished = published.items.slice(0, 5);
  const recentAudit = audit.items.slice(0, 5);

  return (
    <div className="space-y-8">
      <h1 className="text-lg font-bold">できる道 管理</h1>

      {/* 1. 確認が必要なもの */}
      <section aria-labelledby="need-review" className="space-y-3">
        <h2 id="need-review" className="text-base font-bold">
          確認が必要なもの
        </h2>

        {needsReview === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-4 text-sm">
            <span aria-hidden="true">✓ </span>
            現在、確認が必要な経験はありません。
            {s.pendingHeld > 0 && (
              <span className="ml-1 text-[var(--color-ink-muted)]">（保留中 {s.pendingHeld} 件）</span>
            )}
          </div>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-status-warning)] bg-[var(--color-status-warning-soft)] p-4">
            <p className="text-base">
              <span className="text-2xl font-bold">{needsReview}</span> 件の経験があります
              {s.pendingHeld > 0 && (
                <span className="ml-1 text-sm text-[var(--color-ink-muted)]">
                  （保留中 {s.pendingHeld} 件）
                </span>
              )}
            </p>
            {reviewSample.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {reviewSample.map((p) => (
                  <li key={p.id}>・「{clip(p.road.difficulty ?? p.road.goal ?? "（無題）")}」</li>
                ))}
              </ul>
            )}
            <Link
              href="/admin/moderation"
              className="tap-target mt-3 inline-flex items-center rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-ink)] no-underline"
            >
              経験を確認する →
            </Link>
          </div>
        )}
      </section>

      {/* 2. 現在の状況 */}
      <section aria-labelledby="status" className="space-y-3">
        <h2 id="status" className="text-base font-bold">
          現在の状況
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard value={s.users} label="利用者" />
          <StatCard value={s.roads} label="道" />
          <StatCard value={s.approved} label="公開経験" />
          <StatCard value={s.recentApproved} label="最近の更新" />
        </div>
      </section>

      {/* 3. 最近の動き */}
      <section aria-labelledby="recent" className="space-y-3">
        <h2 id="recent" className="text-base font-bold">
          最近の動き
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <RecentBlock
            title="最近公開された経験"
            moreHref="/admin/posts?status=approved"
            empty={recentPublished.length === 0}
          >
            {recentPublished.map((a) => (
              <li key={a.id} className="flex items-baseline gap-x-2 text-sm">
                <span className="shrink-0 text-xs tabular-nums text-[var(--color-ink-muted)]">
                  {mmdd(a.updatedAt)}
                </span>
                <Link href={`/admin/posts/${a.id}`} className="line-clamp-1">
                  {clip(a.road.difficulty ?? a.road.goal ?? a.method, 28)}
                </Link>
              </li>
            ))}
          </RecentBlock>

          <RecentBlock
            title="最近の管理操作"
            moreHref="/admin/audit"
            empty={recentAudit.length === 0}
          >
            {recentAudit.map((x) => (
              <li key={x.id} className="flex items-baseline gap-x-2 text-sm">
                <span className="shrink-0 text-xs tabular-nums text-[var(--color-ink-muted)]">
                  {mmdd(x.createdAt)}
                </span>
                <span className="line-clamp-1">
                  <span className="font-semibold">{ACTION_LABEL[x.action] ?? x.action}</span>
                  <span className="text-[var(--color-ink-muted)]">
                    {" · "}
                    {x.admin.displayName ?? x.admin.email}
                  </span>
                </span>
              </li>
            ))}
          </RecentBlock>
        </div>
      </section>
    </div>
  );
}
