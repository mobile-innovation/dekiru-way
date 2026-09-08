"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/client/api";

/**
 * 経験詳細を開いたら、その経験を既読として登録する (指示書 3 / 11)。
 * - マウント時に 1 回だけ POST する。
 * - 失敗しても何もしない (既読は補助機能。経験の表示を妨げない)。
 * - 未ログイン / 自分の経験のときは呼び出し側でこのコンポーネント自体を描画しない。
 */
export function MarkRead({ attemptId }: { attemptId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api.post(`/api/v1/attempts/${attemptId}/read`).catch(() => {
      /* 既読登録の失敗は無視する */
    });
  }, [attemptId]);
  return null;
}
