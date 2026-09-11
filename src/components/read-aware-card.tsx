"use client";

import { useLayoutEffect, useState } from "react";
import { hasAnyLocalRead } from "@/lib/client/local-reads";

/**
 * 検索結果カードの外枠 (`<article>`)。背景色を既読 / 未読で切り替える
 * (指示書 4 / 5 ＝ 未読は淡い色・既読は白。既読引き継ぎ指示書)。
 *
 *   - ログイン中: サーバーが計算した既読状態 (`serverRead`) を**毎回そのまま**使う（従来どおり）。
 *   - 未ログイン: SSR は既読を判定できず常に「未読」で来るので、ブラウザの localStorage を見て、
 *     既読ならここでも背景を既読色に切り替える（`ReadBadgeAuto` と同じ判定なので、
 *     バッジと背景が食い違わない）。
 *
 * 表示に使う値は `useState` にキャッシュせず、描画のたびに `serverRead` / localStorage から
 * 直接計算する（`mounted` はハイドレーション後かどうかの目印としてだけ使う）。
 * こうしないと、「経験を探す」に戻ったとき（`/experiences` の React ツリーが同じ道のカードを
 * 使い回し、コンポーネントが作り直されない場合がある）に、最初にマウントしたときの既読状態が
 * 固まってしまい、実際は既読になっていても背景が未読色のまま変わらない、という不具合になる。
 */
export function ReadAwareCard({
  loggedIn,
  serverRead,
  attemptIds,
  className,
  readClassName,
  unreadClassName,
  children,
}: {
  loggedIn: boolean;
  serverRead: boolean;
  /** このカードが指す Attempt id（道カードは複数、方法カードは 1 件）。どれか既読なら既読扱い。 */
  attemptIds: string[];
  /** 既読・未読どちらでも常に付く枠線・角丸・余白などのクラス。 */
  className: string;
  /** 既読のときの背景クラス。 */
  readClassName: string;
  /** 未読のときの背景クラス。 */
  unreadClassName: string;
  children: React.ReactNode;
}) {
  // ハイドレーション後かどうかだけを覚える（値そのものはキャッシュしない）。
  // useLayoutEffect: 画面が実際に描かれる前に true にして、未ログイン時の
  // 「未読色 → 既読色」の一瞬の書き換わりが目に見えないようにする。
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);

  const read = loggedIn ? serverRead : serverRead || (mounted && hasAnyLocalRead(attemptIds));
  return <article className={`${className} ${read ? readClassName : unreadClassName}`}>{children}</article>;
}
