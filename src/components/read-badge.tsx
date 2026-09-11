import { IconCheckCircle, IconCircleDashed, IconUser } from "@/components/icons";

/**
 * 検索結果カードの既読 / 未読バッジ (指示書 4 / 5)。
 * 色だけに頼らず、アイコン + 「既読」「未読」の文字を必ず出す。
 * 数（既読数・閲覧数）は出さない。
 */
export function ReadBadge({ read }: { read: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-2 py-0.5 text-[11px] font-bold ${
        read
          ? "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)]"
          : "bg-[var(--color-primary)] text-[var(--color-primary-ink)]"
      }`}
    >
      {read ? (
        <IconCheckCircle aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <IconCircleDashed aria-hidden="true" className="h-3.5 w-3.5" />
      )}
      {read ? "既読" : "未読"}
    </span>
  );
}

/**
 * 自分自身の投稿であることを示すバッジ（既読 / 未読バッジと同じ場所に、代わりに出す）。
 * 「自分の投稿は既読ではなく自分の投稿だとわかるようにしたい」指示。
 * 既読/未読は「これから読むかどうか」の状態だが、自分の投稿はそもそもその区別が意味を持たない
 * ため、既読バッジを流用せず別の見た目にする。
 */
export function OwnPostBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-accent-strong)]">
      <IconUser aria-hidden="true" className="h-3.5 w-3.5" />
      自分の投稿
    </span>
  );
}
