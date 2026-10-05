import type { Branch } from "@/components/branching-paths";

/**
 * 「この人がたどった道」表示用の ViewModel。
 *
 * UI（`branching-paths.tsx`）の中で毎回ツリー判定を組み立てず、ここで 1 回だけ
 * `User → Road → Attempt` の Attempt 群を、描画順に並んだ行のリストへ変換する。
 *
 * 重要な方針（再作成指示書「道の詳細画面／方法の中に現在を含める」）:
 *   - 「現在」は Road 全体の独立ノードにしない。各 Attempt（方法）の結果として
 *     その方法カードの中に置く。文面は原則 `state_after`（本人入力）。
 *   - `state_after` が無ければ「現在」を出さない。Road.progress を全カードにコピーしない。
 *   - 例外: 明示された「いまの経験」(`isCurrent`) の枝の葉に `state_after` が無いときだけ、
 *     その葉の「現在」を Road.progress で補完する。`isCurrent` は URL で確定した経験であって、
 *     日付・成功率・登録順からの推測ではない。
 *   - 親子は `previous_attempt_id` が同じ集合内を指すときだけ。日付では接続しない。
 *   - `tried_at` は行の並び順を決めるためだけに使う（因果や「いまの枝」の判定には使わない）。
 */

export interface RoadDetailRow {
  branch: Branch;
  /** 方法A / 方法B-2 のような入れ子ラベル */
  label: string;
  /** 0 = やりたいこと直下。previous_attempt_id でつながるほど +1 */
  depth: number;
  /** その方法を試した結果としての、本人のいまの状態。無ければ null（＝「現在」を出さない） */
  currentState: string | null;
  /** 描画で縦線を閉じるため: 全行の最後か */
  isLastRow: boolean;
}

const clean = (s?: string | null): string | null => {
  const t = s?.trim();
  return t ? t : null;
};

export function buildRoadDetailRows(branches: Branch[], progress?: string | null): RoadDetailRow[] {
  if (branches.length === 0) return [];

  const byId = new Map(branches.map((b) => [b.id, b]));
  const childrenOf = new Map<string, Branch[]>();
  const roots: Branch[] = [];
  for (const b of branches) {
    const pid = b.previousAttemptId && byId.has(b.previousAttemptId) ? b.previousAttemptId : null;
    if (pid) childrenOf.set(pid, [...(childrenOf.get(pid) ?? []), b]);
    else roots.push(b);
  }

  // tried_at は「並び順」だけに使う。どの枝が「いまの枝」かの判定には使わない。
  const latestInSubtree = (b: Branch): string => {
    let m = b.triedAt ?? "";
    for (const c of childrenOf.get(b.id) ?? []) {
      const cm = latestInSubtree(c);
      if (cm > m) m = cm;
    }
    return m;
  };
  roots.sort((x, y) => latestInSubtree(x).localeCompare(latestInSubtree(y)));

  // 現在: 原則 state_after
  const currentState = new Map<string, string | null>();
  for (const b of branches) currentState.set(b.id, clean(b.stateAfter));

  // 補完: 明示された「いまの経験」の枝の葉に state_after が無いときだけ Road.progress
  const roadProgress = clean(progress);
  const current = branches.find((b) => b.isCurrent) ?? null;
  if (current && roadProgress) {
    let leaf = current;
    for (;;) {
      const kids = childrenOf.get(leaf.id) ?? [];
      if (kids.length === 0) break;
      leaf = kids[kids.length - 1];
    }
    if (!currentState.get(leaf.id)) currentState.set(leaf.id, roadProgress);
  }

  const rows: Omit<RoadDetailRow, "isLastRow">[] = [];
  const walk = (b: Branch, label: string, depth: number) => {
    rows.push({ branch: b, label, depth, currentState: currentState.get(b.id) ?? null });
    (childrenOf.get(b.id) ?? []).forEach((c, i) => walk(c, `${label}-${i + 2}`, depth + 1));
  };
  roots.forEach((r, i) =>
    walk(r, `方法${i < 26 ? String.fromCharCode(65 + i) : String(i + 1)}`, 0),
  );

  return rows.map((r, i) => ({ ...r, isLastRow: i === rows.length - 1 }));
}

/**
 * 表示上のページ分割（指示書「10 ブロックごとのページ切り替え」＋「枝分かれをページ境界で分断しない」）。
 *
 * - 1 ブロック = ツリー上の 1 方法（1 行）。幹ノードは数えない（呼び出し側で常に表示）。
 * - `buildRoadDetailRows` は root（depth 0）ごとに、その部分木を表示順で連続させて返す。
 *   ここではその「root の部分木」を **1 グループ** として、グループ単位でページへ詰める。
 *   親（root）とその枝分かれ（previous_attempt_id でつながる子孫）が別ページに分かれることはない。
 * - 1 ページ ≒ `pageSize`（10）行を目安にするが、境界よりも枝のまとまりを優先する:
 *   ページに行があるうちは、次のグループを足すと目安を超えても、目安未満なら詰める（→ 11, 12 行等を許容）。
 *   ページが目安に達したら、次のグループは次ページの先頭にする。
 *   1 グループが極端に大きい（`pageSize` の 1.5 倍超になる）場合は、そのグループを次ページの先頭へ送る。
 *   それでも 1 グループが単独で目安を超えるときは、そのグループだけで 1 ページになる（分割はしない）。
 * - グループは決して分割しないので、通常 `continuesFromLabel` は付かない（保険として判定は残す）。
 */
export const DETAIL_PAGE_SIZE = 10;

export interface PaginatedDetailRows {
  /** このページに表示する行（枝のまとまりを優先するため pageSize を超えることがある） */
  rows: RoadDetailRow[];
  /** 1 起点の現在ページ（範囲内にクランプ済み） */
  page: number;
  pageCount: number;
  /** このページ先頭が、前ページにある方法の続き（チェーンがページ境界をまたいだ）なら親ラベル */
  continuesFromLabel: string | null;
  /** このページのあとにまだ方法がある（次ページへ続く） */
  continuesToNextPage: boolean;
  /** このページの先頭・末尾が全体の何件目か（1 起点）。「全12件のうち 1〜10件目」の表示用 */
  firstNumber: number;
  lastNumber: number;
  /** 全体の方法の件数 */
  total: number;
}

/**
 * 表示順の行リストを、枝のまとまり（root の部分木）を崩さずにページ配列へ分割する。
 * ページ番号の算出（`treePageByAttempt`）と表示（`paginateDetailRows`）で同じロジックを使う。
 */
export function splitDetailRowsIntoPages(
  all: RoadDetailRow[],
  pageSize = DETAIL_PAGE_SIZE,
): RoadDetailRow[][] {
  if (all.length === 0) return [[]];
  const softCap = Math.round(pageSize * 1.5);

  // root（depth 0）で新しいグループを開始。部分木は表示順で連続している前提。
  const groups: RoadDetailRow[][] = [];
  for (const row of all) {
    if (row.depth === 0 || groups.length === 0) groups.push([row]);
    else groups[groups.length - 1].push(row);
  }

  const pages: RoadDetailRow[][] = [];
  let current: RoadDetailRow[] = [];
  for (const group of groups) {
    const wouldOverflow =
      current.length > 0 && (current.length >= pageSize || current.length + group.length > softCap);
    if (wouldOverflow) {
      pages.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

export function paginateDetailRows(
  all: RoadDetailRow[],
  requestedPage: number,
  pageSize = DETAIL_PAGE_SIZE,
): PaginatedDetailRows {
  const pages = splitDetailRowsIntoPages(all, pageSize);
  const pageCount = pages.length;
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
  const rows = pages[page - 1];

  let continuesFromLabel: string | null = null;
  const first = rows[0];
  if (first && page > 1 && first.branch.previousAttemptId) {
    const parentInPage = rows.some((r) => r.branch.id === first.branch.previousAttemptId);
    if (!parentInPage) {
      const parent = all.find((r) => r.branch.id === first.branch.previousAttemptId);
      if (parent) continuesFromLabel = parent.label;
    }
  }

  const before = pages.slice(0, page - 1).reduce((n, p) => n + p.length, 0);

  return {
    rows,
    page,
    pageCount,
    continuesFromLabel,
    continuesToNextPage: page < pageCount,
    firstNumber: before + 1,
    lastNumber: before + rows.length,
    total: all.length,
  };
}
