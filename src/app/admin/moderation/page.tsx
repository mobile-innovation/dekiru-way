import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { moderationQueue } from "@/lib/admin/queries";
import { AdminPostCard } from "@/components/admin/post-card";
import { ModerationDecisionButtons } from "@/components/admin/admin-actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ verdict?: string; page?: string }>;

export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const verdict = sp.verdict === "ng" || sp.verdict === "unknown" ? sp.verdict : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, hasMore } = await moderationQueue({ verdict, page });

  const filterHref = (v?: string) =>
    `/admin/moderation${v ? `?verdict=${v}` : ""}`;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-lg font-bold">経験を確認</h1>
          <span className="text-sm text-[var(--color-ink-muted)]">確認待ち {total} 件</span>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          利用者が公開しようとしている経験です。公開してよいか確認し、「公開する」か「公開しない」を選びます。
        </p>
      </div>

      <nav className="flex gap-3 text-sm">
        <Link href={filterHref()} className={!verdict ? "font-bold underline" : "underline"}>
          すべて
        </Link>
        <Link href={filterHref("ng")} className={verdict === "ng" ? "font-bold underline" : "underline"}>
          AI: NG
        </Link>
        <Link
          href={filterHref("unknown")}
          className={verdict === "unknown" ? "font-bold underline" : "underline"}
        >
          AI: 不明
        </Link>
      </nav>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-muted)]">
          確認待ちの経験はありません。
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((post) => (
            <li key={post.id} className="space-y-2">
              <AdminPostCard post={post} />
              <ModerationDecisionButtons id={post.id} />
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex justify-between text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/moderation?${new URLSearchParams({ ...(verdict ? { verdict } : {}), page: String(page - 1) })}`}
              className="underline"
            >
              ← 前へ
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link
              href={`/admin/moderation?${new URLSearchParams({ ...(verdict ? { verdict } : {}), page: String(page + 1) })}`}
              className="underline"
            >
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
