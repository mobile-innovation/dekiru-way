import Link from "next/link";
import { ResultBadge } from "@/components/ui";
import type { MethodCardDTO } from "@/lib/queries";

/**
 * 「経験を探す」で、検索語が方法（試したこと本文・気づき）の中に当たったときのカード。
 * カードには方法の内容を出し、タップするとその方法の道の詳細（経験詳細）へ移動する。
 * ＝ 道別カード（RoadCard）とは別種。困りごと・目標に語が当たった道は RoadCard で出る。
 */
export function MethodCard({ method: m }: { method: MethodCardDTO }) {
  const context = m.roadDifficulty ?? m.roadGoal ?? "ある困りごと";
  // その方法が実際に見えるページ（道詳細ツリーが 10 件ごとに分割されている場合は ?p=N）へ
  const href =
    m.treePage > 1
      ? `/experiences/${m.attemptId}?p=${m.treePage}`
      : `/experiences/${m.attemptId}`;

  return (
    <article className="rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Link href={href} className="block no-underline">
        <p className="text-[11px] font-bold tracking-wide text-[var(--color-ink-muted)]">
          方法の記録
        </p>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">この道の困りごと：{context}</p>

        <p className="mt-2 whitespace-pre-wrap font-semibold text-[var(--color-ink)]">
          {m.method}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ResultBadge result={m.result} size="sm" />
          {typeof m.achievementPercent === "number" && (
            <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink-muted)]">
              できた度 {m.achievementPercent}%
            </span>
          )}
          {m.triedAt && (
            <span className="text-[11px] text-[var(--color-ink-muted)]">{m.triedAt}</span>
          )}
        </div>

        {m.memo && (
          <p className="mt-2 line-clamp-2 text-sm text-[var(--color-ink-muted)]">
            気づき：{m.memo}
          </p>
        )}

        {m.roadTags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {m.roadTags.map((t) => (
              <li
                key={t}
                className="rounded-[var(--radius-pill)] bg-[#e4f2ed] px-2.5 py-0.5 text-xs text-[#26756a]"
              >
                #{t}
              </li>
            ))}
          </ul>
        )}

        <span className="mt-3 inline-block text-sm font-semibold text-[var(--color-primary-hover)]">
          この方法の道を見る →
        </span>
      </Link>
    </article>
  );
}
