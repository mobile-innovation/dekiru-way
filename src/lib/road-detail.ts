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

export function buildRoadDetailRows(
  branches: Branch[],
  progress?: string | null,
): RoadDetailRow[] {
  if (branches.length === 0) return [];

  const byId = new Map(branches.map((b) => [b.id, b]));
  const childrenOf = new Map<string, Branch[]>();
  const roots: Branch[] = [];
  for (const b of branches) {
    const pid =
      b.previousAttemptId && byId.has(b.previousAttemptId) ? b.previousAttemptId : null;
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
 * 表示上のページ分割（指示書「表示上の10ブロックごとのページ切り替え」）。
 *
 * - 1 ブロック = ツリー上の 1 方法（1 行）。幹ノードは数えない（呼び出し側で常に表示）。
 * - `buildRoadDetailRows` が返す**表示順のまま** 10 行ずつに区切るだけ。
 *   親子関係・並び・現在などは一切変えない。DB もページ番号も持たない。
 * - チェーン（previous_attempt_id）がページ境界をまたいだら、次ページ先頭に
 *   「前の方法からの続き」であることを示すため親ラベルを返す。
 */
export const DETAIL_PAGE_SIZE = 10;

export interface PaginatedDetailRows {
  /** このページに表示する行（最大 DETAIL_PAGE_SIZE 件） */
  rows: RoadDetailRow[];
  /** 1 起点の現在ページ（範囲内にクランプ済み） */
  page: number;
  pageCount: number;
  /** このページ先頭が、前ページにある方法の続き（チェーンがページ境界をまたいだ）なら親ラベル */
  continuesFromLabel: string | null;
  /** このページのあとにまだ方法がある（次ページへ続く） */
  continuesToNextPage: boolean;
}

export function paginateDetailRows(
  all: RoadDetailRow[],
  requestedPage: number,
  pageSize = DETAIL_PAGE_SIZE,
): PaginatedDetailRows {
  const pageCount = Math.max(1, Math.ceil(all.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
  const start = (page - 1) * pageSize;
  const rows = all.slice(start, start + pageSize);

  let continuesFromLabel: string | null = null;
  const first = rows[0];
  if (first && start > 0 && first.branch.previousAttemptId) {
    const parentIdx = all.findIndex((r) => r.branch.id === first.branch.previousAttemptId);
    if (parentIdx !== -1 && parentIdx < start) {
      continuesFromLabel = all[parentIdx].label;
    }
  }

  return {
    rows,
    page,
    pageCount,
    continuesFromLabel,
    continuesToNextPage: start + pageSize < all.length,
  };
}
