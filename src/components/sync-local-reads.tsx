"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/client/api";
import { getLocalReadIds, clearLocalReadIds } from "@/lib/client/local-reads";

/**
 * 再ログイン時、未ログイン中にブラウザへ溜めた既読をアカウント側へ統合する (既読引き継ぎ指示書)。
 * ログイン中だけ描画される（呼び出し側 = `SiteHeader` が判定）。表示は何もしない。
 *
 * - ブラウザ側に既読 id が無ければ何もしない（毎回サーバーを叩かない）。
 * - 統合が成功したらブラウザ側は空にする（以後はアカウント側の既読が正になるため）。
 * - 通信に失敗してもブラウザ側の記録はそのまま残す。次にこのコンポーネントが
 *   マウントされたとき（次の読み込み時）にまた同じ id で再統合を試みる。
 */
export function SyncLocalReadsOnLogin() {
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    const ids = getLocalReadIds();
    if (ids.length === 0) return;
    api
      .post("/api/v1/me/reads/merge", { attemptIds: ids })
      .then(() => clearLocalReadIds())
      .catch(() => {
        /* 失敗時はブラウザ側の記録を残し、次回また統合を試みる */
      });
  }, []);
  return null;
}
