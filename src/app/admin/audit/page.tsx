import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { auditLog } from "@/lib/admin/queries";
import { ACTION_LABEL } from "@/components/admin/post-card";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, hasMore } = await auditLog({ page });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h1 className="text-lg font-bold">操作ログ</h1>
        <span className="text-sm text-[var(--color-ink-muted)]">{total} 件</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-muted)]">
          まだ操作ログはありません。
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)]">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
              <span className="text-xs text-[var(--color-ink-muted)]">
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
              <span className="font-bold">{ACTION_LABEL[a.action] ?? a.action}</span>
              <span className="text-[var(--color-ink-muted)]">
                {a.admin.displayName ?? a.admin.email}
              </span>
              {a.attemptId && (
                <Link href={`/admin/posts/${a.attemptId}`} className="ml-auto text-xs underline">
                  対象の経験 →
                </Link>
              )}
              {a.roadId && (
                <Link href={`/admin/roads/${a.roadId}`} className="ml-auto text-xs underline">
                  対象の道 →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex justify-between text-sm">
          {page > 1 ? (
            <Link href={`/admin/audit?page=${page - 1}`} className="underline">
              ← 前へ
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={`/admin/audit?page=${page + 1}`} className="underline">
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
