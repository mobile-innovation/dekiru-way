"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * 「経験を探す」の検索状態を、他ページから戻ってきたときに復元する。
 *
 * 検索条件はすべて URL クエリに乗っている（リロードもブラウザの戻るもそのまま効く）。
 * ヘッダーの「経験を探す」リンクや詳細画面の「戻る」リンクは素の `/experiences` を指すため、
 * そこからだと前回の検索が失われる。それだけを補う:
 *   - クエリ付きで開かれたら、その検索文字列と時刻を sessionStorage に覚える。
 *   - クエリ「無し」で開かれ、かつ覚えている検索が新しければ、そこへ `replace` して復元する。
 *
 * URL の有無は `window.location.search` で直接見る（`useSearchParams()` はハイドレーション直後に
 * 一瞬空になることがあり、それを信じるとリロード時に現在の条件を消してしまうため）。
 *
 * scope は sessionStorage（同じタブのセッション内のみ。タブを閉じれば消える）。さらに保険として、
 * 記憶から一定時間（RESTORE_MAX_AGE_MS）経っていたら復元しない（タブを開きっぱなしで日をまたいだ
 * ときに古い条件を引きずらない）。「条件をクリア」は即時に忘れる。
 */

const KEY = "experiences:lastSearch";

/** これより古い記憶は復元しない。検索意図は「ひと座り」で完結する前提。 */
const RESTORE_MAX_AGE_MS = 60 * 60 * 1000; // 60 分

export function clearStoredSearch() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* private mode などで使えなくても支障なし */
  }
}

export function RestoreSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const restored = useRef(false);
  const key = searchParams.toString(); // 検索が変わったら effect を回すためのトリガ

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== "/experiences") return;

    const current = window.location.search.replace(/^\?/, "");

    if (current) {
      // いま検索状態にいる（リロード直後もここに来る）→ 記憶するだけ。復元はしない。
      restored.current = true;
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ s: current, t: Date.now() }));
      } catch {
        /* noop */
      }
      return;
    }

    // クエリ無しで開かれた。この訪問で一度だけ復元を試みる。
    if (restored.current) return;
    restored.current = true;

    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(KEY);
    } catch {
      /* noop */
    }
    if (!raw) return;

    let stored = "";
    let savedAt = 0;
    try {
      const parsed = JSON.parse(raw) as { s?: unknown; t?: unknown };
      if (typeof parsed.s === "string") stored = parsed.s;
      if (typeof parsed.t === "number") savedAt = parsed.t;
    } catch {
      /* 壊れた値 */
    }

    if (!stored || Date.now() - savedAt > RESTORE_MAX_AGE_MS) {
      clearStoredSearch();
      return;
    }
    router.replace(`/experiences?${stored}`);
  }, [key, router]);

  return null;
}
