import Link from "next/link";
import { ResultBadge } from "@/components/ui";
import { ReadBadge } from "@/components/read-badge";
import { IconArrowRight, IconFootprints } from "@/components/icons";
import type { RoadCardDTO } from "@/lib/queries";

const MAX_METHODS = 3;

/**
 * 「経験を探す」画面のカード = 一人の道（= 1 Road）。
 * 方法別ではなく困りごと別。困ったこと＋その人が試した複数の方法・結果を見せ、
 * 「この道を見る →」で枝分かれの詳細へつなぐ。
 * 成功だけでなく、失敗・変化なし・継続中も同じように道として並べる。
 *
 * デザインはトップ画面の実例カードと統一（指示書「経験を探す UI 統一 v1」）:
 * 白カード＋方法の縦線（●│●│●）。困りごと → 方法 → 結果 → タグ → この道を見る の順。
 */
export function RoadCard({ road }: { road: RoadCardDTO }) {
  const difficulty = road.difficulty ?? road.goal ?? "困っていたこと";
  const shown = road.attempts.slice(0, MAX_METHODS);
  const rest = road.attemptCount - shown.length;

  return (
    // 枠線は方法カード（MethodCard）／「自分の道」カードと同じ `--color-primary`。
    // 既読は通常の白背景、未読はごく淡い緑（--color-primary-tint）で「少しだけ目立つ」。
    // 色だけに頼らず、右上に「既読 / 未読」バッジ（アイコン + 文字）を必ず出す（指示書 5）。
    <article
      className={`relative flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-primary)] p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)] ${
        road.isRead ? "bg-[var(--color-surface)]" : "bg-[var(--color-primary-tint)]"
      }`}
    >
      <div className="pointer-events-none absolute right-3 top-3">
        <ReadBadge read={road.isRead} />
      </div>
      <Link href={`/experiences/${road.entryId}`} className="flex flex-1 flex-col no-underline">
        <p className="pr-16 text-[11px] font-bold tracking-wide text-[var(--color-ink-muted)]">
          だれかの道
        </p>

        <p className="mt-1.5 flex items-start gap-1.5 font-semibold text-[var(--color-ink)]">
          <IconFootprints
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]"
          />
          <span className="underline underline-offset-2">{difficulty}</span>
        </p>

        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
          試したこと（{road.attemptCount}）
        </p>
        <ol className="relative mt-2 space-y-2.5 pl-4">
          <span aria-hidden="true" className="road-guide absolute bottom-2 left-1 top-2" />
          {shown.map((a) => (
            <li key={a.id} className="relative">
              <span
                aria-hidden="true"
                className="road-dot absolute -left-4 top-1.5 ring-2 ring-[var(--color-surface)]"
              />
              <div className="flex items-start gap-2">
                <span className="line-clamp-1 min-w-0 flex-1 text-sm text-[var(--color-ink)]">
                  {a.method}
                </span>
                {typeof a.achievementPercent === "number" && (
                  <span className="shrink-0 text-[11px] font-bold text-[var(--color-ink-muted)]">
                    {a.achievementPercent}%
                  </span>
                )}
              </div>
              <div className="mt-0.5">
                <ResultBadge result={a.result} size="sm" />
              </div>
            </li>
          ))}
        </ol>
        {rest > 0 && (
          <p className="mt-2 pl-4 text-xs text-[var(--color-ink-muted)]">ほかに {rest} 件の方法</p>
        )}

        {road.tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {road.tags.map((t) => (
              <li
                key={t}
                className="rounded-[var(--radius-pill)] bg-[#e4f2ed] px-2.5 py-0.5 text-xs text-[#26756a]"
              >
                #{t}
              </li>
            ))}
          </ul>
        )}

        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-[var(--color-primary-hover)]">
          この道を見る
          <IconArrowRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </Link>
    </article>
  );
}
