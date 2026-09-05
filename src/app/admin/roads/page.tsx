import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { roadList } from "@/lib/admin/queries";
import { AdminRoadCard } from "@/components/admin/post-card";
import { ModerationDecisionButtons } from "@/components/admin/admin-actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string; q?: string; page?: string }>;

const TABS = [
  { value: "pending", label: "確認待ち" },
  { value: "approved", label: "公開中" },
  { value: "rejected", label: "却下" },
  { value: "", label: "すべて" },
];

export default async function AdminRoadsPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = sp.status ?? "pending";
  const q = sp.q ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, hasMore } = await roadList({ status, q, page });

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
          <h1 className="text-lg font-bold">道を確認</h1>
          <span className="text-sm text-[var(--color-ink-muted)]">{total} 件</span>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          「道」は一人の困りごとと、その人が試したことのまとまりです。内容を確認して公開の可否を選びます。
        </p>
      </div>

      <nav className="flex flex-wrap gap-3 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/admin/roads${t.value ? `?status=${t.value}` : "?status="}`}
            className={status === t.value ? "font-bold underline" : "underline"}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <form action="/admin/roads" method="get" className="flex gap-2">
        <input type="hidden" name="status" value={status} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="タイトル・困りごと・目標で検索"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-[var(--radius-pill)] border border-[var(--color-neutral)] px-3 py-1.5 text-sm font-semibold"
        >
          検索
        </button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-muted)]">
          該当する道がありません。
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((road) => (
            <li key={road.id} className="space-y-2">
              <AdminRoadCard road={road} />
              {road.moderationStatus === "pending" && (
                <ModerationDecisionButtons id={road.id} target="road" />
              )}
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex justify-between text-sm">
          {page > 1 ? (
            <Link href={`/admin/roads?${qs({ page: String(page - 1) })}`} className="underline">
              ← 前へ
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={`/admin/roads?${qs({ page: String(page + 1) })}`} className="underline">
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
