import Link from "next/link";
import { ResultBadge } from "@/components/ui";
import type { RoadCardDTO } from "@/lib/queries";

const MAX_METHODS = 4;

/**
 * 「経験を探す」画面のカード = 一人の道（= 1 Road）。
 * 方法別ではなく困りごと別。困ったこと＋その人が試した複数の方法・結果を見せ、
 * 「この道を見る →」で枝分かれの詳細へつなぐ。
 * 成功だけでなく、失敗・変化なし・継続中も同じように道として並べる。
 */
export function RoadCard({ road }: { road: RoadCardDTO }) {
  const difficulty = road.difficulty ?? road.goal ?? "困っていたこと";
  const shown = road.attempts.slice(0, MAX_METHODS);
  const rest = road.attemptCount - shown.length;

  return (
    <article className="card p-5 transition-shadow hover:shadow-[var(--shadow-lift)]">
      <Link href={`/experiences/${road.entryId}`} className="block no-underline">
        <p className="text-[11px] font-bold tracking-wide text-[var(--color-ink-muted)]">
          だれかの道
        </p>

        <div className="mt-2">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            困ったこと
          </p>
          <p className="mt-0.5 font-semibold text-[var(--color-ink)]">{difficulty}</p>
        </div>

        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            試したこと（{road.attemptCount}）
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {shown.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-1 text-[var(--color-ink-muted)]">
                  ・
                </span>
                <span className="line-clamp-1 min-w-0 flex-1 text-[var(--color-ink)]">
                  {a.method}
                </span>
                {typeof a.achievementPercent === "number" && (
                  <span className="shrink-0 text-[11px] font-bold text-[var(--color-ink-muted)]">
                    {a.achievementPercent}%
                  </span>
                )}
                <ResultBadge result={a.result} size="sm" />
              </li>
            ))}
          </ul>
          {rest > 0 && (
            <p className="mt-1.5 text-xs text-[var(--color-ink-muted)]">ほかに {rest} 件の方法</p>
          )}
        </div>

        {road.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {road.tags.map((t) => (
              <li
                key={t}
                className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-xs text-[var(--color-ink-muted)]"
              >
                #{t}
              </li>
            ))}
          </ul>
        )}

        <span className="mt-4 inline-block text-sm font-semibold text-[var(--color-primary-hover)]">
          この道を見る →
        </span>
      </Link>
    </article>
  );
}
