"use client";

import { useEffect, useRef } from "react";
import { addLocalRead } from "@/lib/client/local-reads";

/**
 * 未ログインで経験詳細を開いたときの既読登録 (既読引き継ぎ指示書)。
 * ログイン中の `MarkRead`（サーバーへ POST）と対になる、ブラウザだけで完結する版。
 * 通信は発生しない＝失敗しない。ログイン不要のまま既読を使えるようにする。
 */
export function MarkReadLocal({ attemptId }: { attemptId: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    addLocalRead(attemptId);
  }, [attemptId]);
  return null;
}
