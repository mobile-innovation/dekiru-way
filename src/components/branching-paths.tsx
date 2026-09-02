import Link from "next/link";
import { type ReactNode } from "react";
import { ResultBadge } from "@/components/ui";
import { buildRoadDetailRows, paginateDetailRows } from "@/lib/road-detail";

/**
 * 「この人がたどった道」= 縦方向の樹形タイムライン（再作成指示書「道の詳細画面／方法の中に現在を含める」）。
 *
 *   幹（level-0 の縦ガイド線）: 以前できていた → できなくなった → やりたいこと
 *   枝（やりたいこと の下にインデントした level-1 ガイド線）: 試した各方法のカード
 *
 *   1 枚の方法カードの中身:
 *     方法 → 結果 → できた％ → そのときの気持ち → 現在 → 次に試すこと
 *
 *   「現在」は Road 全体の独立ノードにしない。その方法を試した結果として、方法カードの中に置く。
 *   文面は原則そのAttemptの state_after。無ければ「現在」を出さない（ViewModel 側で解決）。
 *
 * 方法は横に並べず縦に積む。件数が増えても横幅は広がらず、下へ伸びるだけ。
 *
 * 線の考え方:
 *   - 縦ガイドは連続した 1 本（テーマ緑 `--color-primary` 3px）。途切れない。
 *   - 各ノード/カードはガイドから伸びる横ティック＋接続ドットでガイドにつながる。
 *   - previous_attempt_id があるものだけ親の下へインデントし、線で「次の方法」へつなぐ。
 *     データ上関係のない方法どうしは線でつながない（日付では接続しない）。
 */

export interface Branch {
  id: string;
  method: string;
  result: string;
  triedAt?: string | null;
  isCurrent?: boolean;
  /** いま見ている枝に添える気づき・メモ */
  note?: string | null;
  /** v6: 本人が入力した「できた％」(0〜100)。AI 計算ではない */
  achievementPercent?: number | null;
  /** v6: そのときの気持ち */
  feeling?: string | null;
  /** v6: その方法を試した後の状態（道の詳細では「現在」として表示する） */
  stateAfter?: string | null;
  /** v6: その方法のあと、次に試すことにしたこと */
  nextAction?: string | null;
  /** v6: 実際にこの方法の前に試した Attempt(同じ Road)。因果が確定しているものだけ */
  previousAttemptId?: string | null;
}

interface Props {
  trunk: {
    previouslyAble?: string | null;
    difficulty?: string | null;
    goal?: string | null;
  };
  branches: Branch[];
  /**
   * Road 全体の「現在」状態（= Road.status/progress）。方法カードの「現在」は各 Attempt の
   * state_after であって、これではない。この progress は、いま表示している経験（isCurrent）の
   * 枝の葉に state_after が無いときだけ、その葉の「現在」の補完に使う。他の方法には出さない。
   * Road.next_action はここに含めない（各 Attempt 側の next_action を使う）。
   */
  present?: { progress?: string | null };
  /** null で見出しを出さない（カード側で見出しを持つとき用） */
  heading?: string | null;
  headingId?: string;
  /** null で注意書きを出さない */
  note?: ReactNode | null;
  branchPointLabel?: string;
  /**
   * 一覧ページ（道の見える化）用のコンパクト表示。
   * dense=false（経験詳細）では各方法カードの中身を最初から全部表示し、リンクにはしない
   * （タップして選ぶ・詳細へ飛ぶ、という操作を挟まない）。
   * dense=true（一覧）は情報を絞っているので、各カードはその経験の詳細への導線にする。
   */
  dense?: boolean;
  /**
   * 経験詳細で方法ブロックが多いときの「表示上の」ページ番号（1 起点）。
   * dense=false かつ pageHref があるときだけ 10 ブロックずつに区切る。DB には保存しない。
   */
  page?: number;
  /** ページ番号 → その URL（例: p => `/experiences/abc?p=${p}`）。無ければページ分割しない。 */
  pageHref?: (page: number) => string;
}

const DEFAULT_NOTE =
  "同じ困りごとに、この人がいろいろな方法を試した記録です。どれかが「正解」ではありません。うまくいかなかった記録も、道の一部として残しています。";

/** 縦の幹線は各行が自分の分を描く（Spine）。ここは並べる器だけ。 */
function Guide({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <ul className="m-0 list-none p-0">{children}</ul>
    </div>
  );
}

/**
 * 縦の幹線の、この行の分のセグメント（left-0 で全行そろうので 1 本につながる）。
 * 接続点はカード左枠線の縦中央なので、端の行はそこで止める。
 *   from="mid" … 最初の行。最初のノードの中央あたりから下へ。
 *   to="mid"   … 最後の行。カード中央（＝行の 50%）で止める。
 */
function Spine({ from = "top", to = "bottom" }: { from?: "top" | "mid"; to?: "mid" | "bottom" }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-0 w-[3px] rounded-full bg-[var(--color-primary)]"
      style={{
        top: from === "mid" ? "1.5rem" : 0,
        bottom: to === "bottom" ? 0 : "auto",
        height: to === "mid" ? "50%" : undefined,
      }}
    />
  );
}

/**
 * 幹線にぶら下がる 1 項目。
 * 幹線 → 横線でカード左枠へ → カード左枠線の縦中央に半円の接続点。
 * 半円は後から不透明のカードが右半分を隠すので、「左枠線に食い込んだ半円」に見える。
 *   variant "trunk"  … 幹のノード（以前できていた / できなくなった / やりたいこと）
 *   variant "branch" … 幹から枝分かれした方法カード（少し外側に出す）
 *   depth 1…          … previous_attempt_id でつながった子（方法B-2 等）
 */
function TreeItem({
  children,
  variant = "trunk",
  depth = 0,
  tight = false,
  first = false,
  last = false,
}: {
  children: ReactNode;
  variant?: "trunk" | "branch";
  depth?: number;
  tight?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  const armRem = variant === "trunk" ? 1.5 : 2.75 + depth * 1.25;
  const pad = `${armRem}rem`;
  return (
    <li
      className={`relative ${last ? "" : tight ? "pb-3" : "pb-5"}`}
      style={{ paddingLeft: pad }}
    >
      <Spine from={first ? "mid" : "top"} to={last ? "mid" : "bottom"} />
      {/* カードの左枠に、縦中央で接続。横線＋半円はカード基準(50%高)で置く。 */}
      <div className="relative">
        {/* 幹線 → カード左枠へ入る横線 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[var(--color-primary)]"
          style={{ right: "100%", width: pad }}
        />
        {/* 接続点：カード左枠線の縦中央。右半分は不透明カードが隠す＝枠に食い込んだ半円に見える。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-primary)]"
        />
        {children}
      </div>
    </li>
  );
}

/**
 * 幹のノード（以前できていた / できなくなった / やりたいこと）。
 * 「開けない・読むだけ」の文脈情報。カード（＝開ける方法）とは分ける:
 * 枠線・影を付けず、淡い下地の帯にする。強調ノード（やりたいこと）だけ少し濃い下地。
 */
function NodeBox({
  label,
  text,
  strong = false,
}: {
  label: string;
  text: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`w-full rounded-[var(--radius-sm)] px-3 py-2 ${
        strong
          ? "bg-[var(--color-primary-soft)] font-bold"
          : "bg-[var(--color-surface-sunken)]"
      }`}
    >
      <span className="block text-[11px] font-bold tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="block whitespace-pre-wrap">{text}</span>
    </div>
  );
}

/**
 * 1 枚の方法カード。1 つの Attempt を「一つの経験」として見せる:
 *   方法 → 結果 → できた％ → そのときの気持ち → 現在 → 次に試すこと
 * 値が無い項目は行ごと出さない（既存データで null でも壊れない）。
 */
function BranchCardInner({
  branch,
  label,
  currentState,
  dense,
}: {
  branch: Branch;
  label: string;
  /** その方法を試した結果としての、本人のいまの状態（ViewModel が解決済み）。無ければ null */
  currentState: string | null;
  dense: boolean;
}) {
  const hasDetail =
    Boolean(branch.feeling) ||
    Boolean(branch.note) ||
    Boolean(currentState) ||
    Boolean(branch.nextAction);
  return (
    <>
      <span className="block text-[11px] font-bold tracking-wide text-[var(--color-ink-muted)]">
        {label}
      </span>
      <p className={`mt-1 whitespace-pre-wrap font-medium ${dense ? "text-sm" : ""}`}>
        {branch.method}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ResultBadge result={branch.result} size="sm" />
        {typeof branch.achievementPercent === "number" && (
          <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink-muted)]">
            できた度 {branch.achievementPercent}%
          </span>
        )}
      </div>
      {branch.triedAt && (
        <p className="mt-1 text-[11px] text-[var(--color-ink-muted)]">{branch.triedAt}</p>
      )}
      {hasDetail && (
        <dl className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-ink-muted)]">
          {branch.feeling && (
            <div>
              <dt className="inline font-bold">そのときの気持ち：</dt>
              <dd className="inline whitespace-pre-wrap">{branch.feeling}</dd>
            </div>
          )}
          {branch.note && (
            <div>
              <dt className="inline font-bold">気づき：</dt>
              <dd className="inline whitespace-pre-wrap">{branch.note}</dd>
            </div>
          )}
          {currentState && (
            <div className="text-[var(--color-ink)]">
              <dt className="inline font-bold">現在：</dt>
              <dd className="inline whitespace-pre-wrap">{currentState}</dd>
            </div>
          )}
          {branch.nextAction && (
            <div>
              <dt className="inline font-bold">次に試すこと：</dt>
              <dd className="inline whitespace-pre-wrap">{branch.nextAction}</dd>
            </div>
          )}
        </dl>
      )}
    </>
  );
}

export function BranchingPaths({
  trunk,
  branches,
  present,
  heading = "この人がたどった道",
  headingId = "branching-heading",
  note = DEFAULT_NOTE,
  branchPointLabel = "ここから、いろいろな方法を試しています",
  dense = false,
  page = 1,
  pageHref,
}: Props) {
  if (branches.length === 0) return null;

  const trunkNodes = [
    trunk.previouslyAble && { label: "以前できていた", text: trunk.previouslyAble },
    trunk.difficulty && { label: "できなくなった", text: trunk.difficulty },
    { label: "やりたいこと", text: trunk.goal ?? trunk.difficulty ?? "この困りごと" },
  ].filter(Boolean) as { label: string; text: string }[];

  const tight = dense;
  // 一覧（dense）では Road.progress の補完はしない。「現在」は state_after があるときだけ。
  const allRows = buildRoadDetailRows(branches, dense ? null : present?.progress);
  const multi = allRows.length > 1;

  // 経験詳細で方法が多いときだけ「表示上」10 ブロックずつに区切る（親子関係・並びは変えない）。
  const paginated = !dense && pageHref ? paginateDetailRows(allRows, page) : null;
  const rows = paginated ? paginated.rows : allRows;
  const showBranchPoint = !dense && multi && (!paginated || paginated.page === 1);

  return (
    <section aria-labelledby={heading ? headingId : undefined} className="space-y-3">
      {!dense && heading && (
        <h2 id={headingId} className="text-base font-bold">
          {heading}
        </h2>
      )}
      {!dense && note && (
        <p role="note" className="text-sm text-[var(--color-ink-muted)]">
          {note}
        </p>
      )}

      <div className={`mx-auto w-full ${dense ? "max-w-lg" : "max-w-xl"} pl-1`}>
        {/* 幹線は各行が自分の分を描いて 1 本につながる。カードには上辺中央で接続する。 */}
        <Guide>
          {/* 幹: 以前できていた → できなくなった → やりたいこと */}
          {trunkNodes.map((n, idx) => (
            <TreeItem key={n.label} variant="trunk" tight={tight} first={idx === 0}>
              <NodeBox label={n.label} text={n.text} strong={n.label === "やりたいこと"} />
            </TreeItem>
          ))}

          {showBranchPoint && (
            <li className="relative pb-2 pl-6 text-[11px] text-[var(--color-ink-muted)]">
              <Spine />
              {branchPointLabel}
            </li>
          )}

          {/* ページ境界をまたいだチェーンの続き（表示上の補助。DB の親子関係は不変）。 */}
          {paginated?.continuesFromLabel && (
            <li className="relative pb-3 pl-6 text-[11px] font-bold text-[var(--color-ink-muted)]">
              <Spine />
              ← 「{paginated.continuesFromLabel}」からの続き
            </li>
          )}

          {/* 枝: 方法カード。previous_attempt_id があるものは親の下へインデント（＝次の方法）。
              経験詳細（dense=false）では中身を全部そのまま表示。リンクにはしない。 */}
          {rows.map(({ branch: b, label, depth, currentState, isLastRow }, i) => {
            // 方法カードはどれも「選んだ状態」の見た目（緑の枠線＋淡い緑の下地）でそろえる。
            // どの方法を見ているかのチップ／強調分けはしない（全部が同じ道の一部）。
            const cardTone = dense
              ? "border-[var(--color-border)] bg-[var(--color-surface)]"
              : "border-[var(--color-primary)] bg-[var(--color-primary-soft)]";
            const baseClass = `w-full rounded-[var(--radius-md)] border ${
              dense ? "p-3" : "p-4"
            } ${cardTone}`;

            const inner = (
              <BranchCardInner
                branch={b}
                label={label}
                currentState={currentState}
                dense={dense}
              />
            );

            // 縦線を閉じるのは「本当に最後の行」だけ。次ページへ続くなら閉じない。
            const closeLine = paginated
              ? i === rows.length - 1 && !paginated.continuesToNextPage
              : isLastRow;

            return (
              <TreeItem
                key={b.id}
                variant="branch"
                depth={depth}
                tight={tight}
                last={closeLine}
              >
                {dense ? (
                  <Link
                    href={`/experiences/${b.id}`}
                    className={`block no-underline transition hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-lift)] ${baseClass}`}
                  >
                    {inner}
                    <span className="mt-2 block text-sm font-semibold text-[var(--color-primary-hover)]">
                      詳しく見る →
                    </span>
                  </Link>
                ) : (
                  <div className={baseClass} aria-current={b.isCurrent || undefined}>
                    {inner}
                    {b.isCurrent && <span className="sr-only">（この経験を表示中）</span>}
                  </div>
                )}
              </TreeItem>
            );
          })}

          {/* 次ページへ続く（表示上の補助。新しい枝を作っているわけではない）。 */}
          {paginated?.continuesToNextPage && (
            <li className="relative pb-1 pl-6 text-[11px] font-bold text-[var(--color-ink-muted)]">
              <Spine to="mid" />
              ↓ この先は次のページに続きます
            </li>
          )}
        </Guide>
      </div>

      {paginated && paginated.pageCount > 1 && pageHref && (
        <nav
          className="mx-auto flex w-full max-w-xl items-center justify-between pl-1 text-sm"
          aria-label="道のページ送り"
        >
          {paginated.page > 1 ? (
            <Link href={pageHref(paginated.page - 1)} className="font-semibold" rel="prev">
              ← 前のページ
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--color-ink-muted)]">
            {paginated.page} / {paginated.pageCount} ページ
          </span>
          {paginated.page < paginated.pageCount ? (
            <Link href={pageHref(paginated.page + 1)} className="font-semibold" rel="next">
              次のページ →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
