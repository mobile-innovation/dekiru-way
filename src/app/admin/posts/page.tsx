import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { postList } from "@/lib/admin/queries";
import { AdminPostCard } from "@/components/admin/post-card";
import { AdminPostSearch } from "@/components/admin/post-search";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string; q?: string; page?: string }>;

const STATUS_TABS = [
  { value: "", label: "すべて" },
  { value: "pending", label: "確認待ち" },
  { value: "approved", label: "公開中" },
  { value: "rejected", label: "公開停止" },
];

export default async function AdminPostsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, hasMore } = await postList({ status, q, page });

  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(over)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return p.toString();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-lg font-bold">公開されている経験</h1>
          <span className="text-sm text-[var(--color-ink-muted)]">{total} 件</span>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          利用者が公開しようとした経験の一覧です。状態でしぼり込めます。
        </p>
      </div>

      <nav className="flex flex-wrap gap-3 text-sm">
        {STATUS_TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/posts${t.value ? `?status=${t.value}` : ""}`}
            className={status === t.value ? "font-bold underline" : "underline"}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <AdminPostSearch defaultValue={q} status={status} />

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-muted)]">
          該当する経験がありません。
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((post) => (
            <li key={post.id}>
              <AdminPostCard post={post} />
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex justify-between text-sm">
          {page > 1 ? (
            <Link href={`/admin/posts?${qs({ page: String(page - 1) })}`} className="underline">
              ← 前へ
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={`/admin/posts?${qs({ page: String(page + 1) })}`} className="underline">
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
