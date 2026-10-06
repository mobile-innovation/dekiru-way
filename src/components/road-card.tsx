import Link from "next/link";
import { ResultBadge } from "@/components/ui";
import { ReadBadgeAuto } from "@/components/read-badge-auto";
import { OwnPostBadge } from "@/components/read-badge";
import { ReadAwareCard } from "@/components/read-aware-card";
import { IconArrowRight, IconFootprints } from "@/components/icons";
import type { RoadCardDTO } from "@/lib/queries";
import { ATTEMPT_RESULTS } from "@/lib/constants";
import { methodCount } from "@/lib/share";

const MAX_TAGS = 3;

/**
 * 「経験を探す」画面のカード = 一人の道（= 1 Road）。
 * 一覧＝道を探す / 詳細＝道を読む（「経験を探す」一覧ページ UI・情報設計改善指示書）。
 * カードの役割は「この経験、自分に関係ありそう」と判断してもらうこと。方法そのものは並べない。
 *   困っていたこと（主役）→ タグ（主要 3 件まで）→ 試した方法の数 → 結果の内訳 → この道を見る
 * 結果の内訳は公開 Attempt の result を機械的に数えるだけ（5 分類の順・件数つき）。「ほぼ解決」等の意味付けはしない。
 * 成功だけでなく、失敗・変化なし・継続中も同じように道として並べる。
 */
export function RoadCard({ road, loggedIn = false }: { road: RoadCardDTO; loggedIn?: boolean }) {
  // 主タイトルは困っていたこと（difficulty）。無い古いデータは goal を「できるようにしたいこと」として出す。
  const title = road.difficulty ?? road.goal;
  const titleLabel = road.difficulty
    ? "困っていたこと"
    : road.goal
      ? "できるようにしたいこと"
      : null;
  const resultCounts = ATTEMPT_RESULTS.map((r) => ({
    result: r,
    count: road.attempts.filter((a) => a.result === r).length,
  })).filter((x) => x.count > 0);
  const tags = road.tags.slice(0, MAX_TAGS);
  const moreTags = road.tags.length - tags.length;

  const attemptIds = road.attempts.map((a) => a.id);

  return (
    // 枠線は方法カード（MethodCard）／「自分の道」カードと同じ `--color-primary`。
    // 既読は通常の白背景、未読はごく淡い緑（--color-primary-tint）で「少しだけ目立つ」。
    // 色だけに頼らず、右上に「既読 / 未読」バッジ（アイコン + 文字）を必ず出す（指示書 5）。
    // 自分の道は既読/未読の区別自体が意味を持たないため、未読の強調表示にはせず
    // 「自分の投稿」バッジに差し替える（既読ではなく自分の投稿だとわかるようにする指示）。
    <ReadAwareCard
      loggedIn={loggedIn}
      serverRead={road.isMine || road.isRead}
      attemptIds={attemptIds}
      className="relative flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-primary)] p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]"
      readClassName="bg-[var(--color-surface)]"
      unreadClassName="bg-[var(--color-primary-tint)]"
    >
      <div className="pointer-events-none absolute right-3 top-3">
        {road.isMine ? (
          <OwnPostBadge />
        ) : (
          <ReadBadgeAuto loggedIn={loggedIn} serverRead={road.isRead} attemptIds={attemptIds} />
        )}
      </div>
      <Link href={`/experiences/${road.entryId}`} className="flex flex-1 flex-col no-underline">
        {titleLabel && (
          <p className="pr-16 text-[0.6875rem] font-bold tracking-wide text-[var(--color-ink-muted)]">
            {titleLabel}
          </p>
        )}
        {title && (
          // 長い困りごとはカードでは 3 行まで（CSS の省略のみ。文章は改変せず、読み上げ・全文は詳細ページで読める）
          <p className="mt-1 line-clamp-3 text-base font-bold leading-snug text-[var(--color-ink)]">
            {title}
          </p>
        )}

        {tags.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="タグ">
            {tags.map((t) => (
              <li
                key={t}
                className="rounded-[var(--radius-pill)] bg-[#e4f2ed] px-2.5 py-0.5 text-xs text-[#26756a]"
              >
                #{t}
              </li>
            ))}
            {moreTags > 0 && (
              <li className="px-1 py-0.5 text-xs text-[var(--color-ink-muted)]">
                ほか{moreTags}件
              </li>
            )}
          </ul>
        )}

        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-ink)]">
            <IconFootprints
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[var(--color-primary)]"
            />
            {methodCount(road.attemptCount)}の方法を試した
          </p>
          {resultCounts.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1.5" aria-label="結果の内訳">
              {resultCounts.map(({ result, count }) => (
                <li key={result} className="inline-flex items-center gap-1">
                  <ResultBadge result={result} size="sm" />
                  {count > 1 && (
                    <span className="text-xs font-bold text-[var(--color-ink-muted)]">
                      {count}件
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-[var(--color-primary-hover)]">
          この道を見る
          <IconArrowRight aria-hidden="true" className="h-4 w-4" />
        </span>
      </Link>
    </ReadAwareCard>
  );
}
