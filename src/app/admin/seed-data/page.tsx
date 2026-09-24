import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listSeedData } from "@/lib/admin/seed-data";
import { SeedRowActions } from "@/components/admin/seed-data-actions";
import { AdminBadge, type AdminTone } from "@/components/admin/admin-ui";
import type { PublishState } from "@/lib/publish-state";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ page?: string; state?: string }>;

// 「確認待ち」は経験確認キュー（post-card.tsx の moderationStatus="pending"）と表記を揃える
// （以前はここだけ「確認中」だった。指示書「管理画面 UI表示・カラー統一指示書 v1」§4）。
const STATE_LABEL: Record<PublishState, string> = {
  private: "非公開",
  reviewing: "確認待ち",
  published: "公開中",
  rejected: "公開停止",
};

const STATE_TONE: Record<PublishState, AdminTone> = {
  private: "neutral",
  reviewing: "warning",
  published: "success",
  rejected: "neutral",
};

function StateBadge({ state }: { state: PublishState }) {
  return <AdminBadge tone={STATE_TONE[state]}>{STATE_LABEL[state]}</AdminBadge>;
}

function ymd(iso: string) {
  return iso.slice(0, 10);
}

const TAB =
  "tap-target inline-flex items-center rounded-[var(--radius-pill)] border px-3 py-1.5 text-sm font-semibold no-underline";
const TAB_ON = `${TAB} border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-ink)]`;
const TAB_OFF = `${TAB} border-[var(--color-neutral)] bg-[var(--color-surface)] text-[var(--color-ink-muted)]`;

export default async function AdminSeedDataPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  // 初期値は「非公開」。?state=published のときだけ公開ぶんを表示する。
  const showPublished = sp.state === "published";
  const { items, counts, hasMore } = await listSeedData({ page, published: showPublished });

  const qs = (over: { state?: "published" | "private"; page?: number }) => {
    const p = new URLSearchParams();
    const state = over.state ?? (showPublished ? "published" : "private");
    if (state === "published") p.set("state", "published");
    if (over.page && over.page > 1) p.set("page", String(over.page));
    const s = p.toString();
    return s ? `/admin/seed-data?${s}` : "/admin/seed-data";
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-lg font-bold">仮データ管理</h1>
          <span className="text-sm text-[var(--color-ink-muted)]">{counts.all} 件</span>
        </div>
        <p className="text-sm text-[var(--color-ink-muted)]">
          管理者が検索体験の確認用に作るサンプルです。実在の利用者の経験ではありません。
          保存した時点では非公開で、公開は 1 件ずつ行います。
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-bold text-[var(--color-ink-muted)]">作成方法</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/seed-data/generate"
            className="tap-target inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-ink)] no-underline"
          >
            ＋ AIで生成
          </Link>
          <Link
            href="/admin/seed-data/import-markdown"
            className="tap-target inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--color-primary)] bg-[var(--color-surface)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-hover)] no-underline"
          >
            ＋ Markdownから取り込む
          </Link>
        </div>
      </div>

      {/* 緑の指示枠：表示する仮データ（非公開／公開）を切り替える。初期は非公開。 */}
      <div className="space-y-2 rounded-[var(--radius-md)] bg-[var(--color-primary-tint)] p-3 shadow-[var(--shadow-card)]">
        <p className="text-sm font-bold">表示する仮データ</p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          生成した仮データは、はじめはすべて「非公開」です。内容を確認し、問題なければ各行の「公開」で
          1 件ずつ公開してください。公開したものは「公開」に切り替えると確認できます。
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={qs({ state: "private" })} className={showPublished ? TAB_OFF : TAB_ON}>
            非公開（{counts.private}）
          </Link>
          <Link href={qs({ state: "published" })} className={showPublished ? TAB_ON : TAB_OFF}>
            公開（{counts.published}）
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-ink-muted)]">
          {counts.all === 0
            ? "まだ仮データはありません。「＋ AIで生成」または「＋ Markdownから取り込む」から作成できます。"
            : showPublished
              ? "公開している仮データはありません。"
              : "非公開の仮データはありません。"}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StateBadge state={it.publishState} />
                {it.aiGenerated && (
                  <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--color-ink-muted)]">
                    AI生成
                  </span>
                )}
                <span className="text-xs text-[var(--color-ink-muted)]">作成 {ymd(it.createdAt)}</span>
              </div>
              <p className="text-sm font-semibold">
                {it.road.difficulty ?? it.road.goal ?? "（困ったこと未入力）"}
              </p>
              {it.attempts.length > 0 && (
                <div className="text-sm text-[var(--color-ink-muted)]">
                  <p className="text-xs font-bold">試したこと（{it.attempts.length}）</p>
                  <ol className="mt-0.5 space-y-0.5">
                    {it.attempts.slice(0, 3).map((a) => (
                      <li key={a.id} className="line-clamp-1">
                        ・{a.method}
                      </li>
                    ))}
                  </ol>
                  {it.attempts.length > 3 && (
                    <p className="mt-0.5 text-xs">ほかに {it.attempts.length - 3} 件</p>
                  )}
                </div>
              )}
              <SeedRowActions roadId={it.id} isPublished={it.isPublished} />
            </li>
          ))}
        </ul>
      )}

      {(page > 1 || hasMore) && (
        <div className="flex justify-between text-sm">
          {page > 1 ? (
            <Link href={qs({ page: page - 1 })} className="underline">
              ← 前へ
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={qs({ page: page + 1 })} className="underline">
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
