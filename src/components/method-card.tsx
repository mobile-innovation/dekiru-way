import Link from "next/link";
import { ResultBadge } from "@/components/ui";
import { ReadBadge } from "@/components/read-badge";
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
    // 未読は淡い緑のまま「少しだけ目立つ」、既読は白背景で落ち着かせる。
    // 色だけでなく右上の「既読 / 未読」バッジ（アイコン + 文字）でも判別できる（指示書 5）。
    <article
      className={`relative rounded-[var(--radius-lg)] border border-[var(--color-primary)] p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] ${
        m.isRead ? "bg-[var(--color-surface)]" : "bg-[var(--color-primary-soft)]"
      }`}
    >
      <div className="pointer-events-none absolute right-3 top-3">
        <ReadBadge read={m.isRead} />
      </div>
      <Link href={href} className="block no-underline">
        <p className="flex items-center gap-1.5 pr-16 text-[11px] font-bold tracking-wide text-[var(--color-ink-muted)]">
          方法の記録
        </p>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">この道の困りごと：{context}</p>

        <p className="mt-2 whitespace-pre-wrap font-semibold text-[var(--color-ink)]">
          <span className="underline underline-offset-2">{m.method}</span>
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
