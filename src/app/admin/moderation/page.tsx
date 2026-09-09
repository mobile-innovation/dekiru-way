import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { moderationQueue } from "@/lib/admin/queries";
import { AdminPostCard } from "@/components/admin/post-card";
import { ModerationDecisionButtons } from "@/components/admin/admin-actions";

export const dynamic = "force-dynamic";

/** フィルタ 1 項目。選択中は塗り、未選択は白ピル。 */
function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-[var(--radius-pill)] px-3 py-1 text-sm font-semibold no-underline ${
        active
          ? "bg-[var(--color-primary)] text-[var(--color-primary-ink)]"
          : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-primary-soft)]"
      }`}
    >
      {children}
    </Link>
  );
}

type SearchParams = Promise<{ verdict?: string; page?: string; held?: string }>;

export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const verdict = sp.verdict === "ng" || sp.verdict === "unknown" ? sp.verdict : undefined;
  const held = sp.held === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const { items, total, hasMore } = await moderationQueue({ verdict, page, held });

  const hrefWith = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    if (verdict) p.set("verdict", verdict);
    if (held) p.set("held", "1");
    for (const [k, v] of Object.entries(over)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    return `/admin/moderation${qs ? `?${qs}` : ""}`;
  };
  const verdictHref = (v?: string) => hrefWith({ verdict: v, page: undefined });

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-lg font-bold">経験を確認</h1>
          <span className="text-sm text-[var(--color-ink-muted)]">
            {held ? "保留" : "確認待ち"} {total} 件
          </span>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          {held
            ? "「保留」にした経験です。公開できる状態になったら「公開する」、確認待ちに戻すなら「保留を解除」。"
            : "利用者が公開しようとしている経験です。公開してよいか確認し、「公開する」か「公開しない」を選びます。今は判断できないものは「保留」に。"}
        </p>
      </div>

      {/* しぼり込み。検索フォームと同じ淡い緑のカードにまとめて、選択中を塗りピルで分かりやすく。 */}
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-4 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-bold text-[var(--color-ink-muted)]">保留</span>
          <FilterPill href={hrefWith({ held: undefined, page: undefined })} active={!held}>
            保留していない
          </FilterPill>
          <FilterPill href={hrefWith({ held: "1", page: undefined })} active={held}>
            保留している
          </FilterPill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 shrink-0 text-xs font-bold text-[var(--color-ink-muted)]">AI 判定</span>
          <FilterPill href={verdictHref()} active={!verdict}>
            すべて
          </FilterPill>
          <FilterPill href={verdictHref("ng")} active={verdict === "ng"}>
            AI: NG
          </FilterPill>
          <FilterPill href={verdictHref("unknown")} active={verdict === "unknown"}>
            AI: 不明
          </FilterPill>
        </div>
        <p className="text-xs text-[var(--color-ink-muted)]">
          「保留」は管理画面だけの表示です（利用者には出ません）。
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-muted)]">
          {held ? "保留している経験はありません。" : "確認待ちの経験はありません。"}
        </p>
      ) : (
        <ul className="space-y-4">
          {items.map((post) => (
            <li key={post.id} className="space-y-2">
              <AdminPostCard post={post} />
              <ModerationDecisionButtons id={post.id} held={held} />
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex justify-between text-sm">
          {page > 1 ? (
            <Link href={hrefWith({ page: String(page - 1) })} className="underline">
              ← 前へ
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={hrefWith({ page: String(page + 1) })} className="underline">
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
