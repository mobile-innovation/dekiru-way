"use client";

import { useLayoutEffect, useState } from "react";
import { ReadBadge } from "@/components/read-badge";
import { hasAnyLocalRead } from "@/lib/client/local-reads";

/**
 * 検索結果カードの既読 / 未読バッジ (既読引き継ぎ指示書)。
 *   - ログイン中: サーバーが計算した既読状態 (`serverRead`) を**毎回そのまま**表示する（従来どおり）。
 *   - 未ログイン: SSR 側は既読を判定できない（常に未読で来る）ので、ブラウザの localStorage を見て
 *     バッジを更新する。SSR の結果と同じ「未読」を最初に描き、ハイドレーション不一致を起こさない。
 *
 * 表示する値は `useState` にキャッシュせず、描画のたびに `serverRead` / localStorage から
 * 直接計算する（`mounted` はハイドレーション後かどうかの目印としてだけ使う）。
 * こうしないと、「経験を探す」に戻ったとき（`/experiences` の React ツリーが同じ道のカードを
 * 使い回し、コンポーネントが作り直されない場合がある）に、最初にマウントしたときの既読状態が
 * `useState` の初期値のまま固まってしまい、実際は既読になっていてもバッジが未読のまま
 * 変わらない、という不具合になる。
 */
export function ReadBadgeAuto({
  loggedIn,
  serverRead,
  attemptIds,
}: {
  loggedIn: boolean;
  serverRead: boolean;
  /** この 1 枚のカードが指す Attempt id（道カードは複数、方法カードは 1 件）。どれか既読なら既読表示。 */
  attemptIds: string[];
}) {
  // ハイドレーション後かどうかだけを覚える（値そのものはキャッシュしない）。
  // useLayoutEffect: 画面が実際に描かれる前に true にして、未ログイン時の
  // 「未読 → 既読」の一瞬の書き換わりが目に見えないようにする。
  const [mounted, setMounted] = useState(false);
  useLayoutEffect(() => setMounted(true), []);

  const read = loggedIn ? serverRead : serverRead || (mounted && hasAnyLocalRead(attemptIds));
  return <ReadBadge read={read} />;
}
