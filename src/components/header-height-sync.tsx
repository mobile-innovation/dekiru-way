"use client";

import { useEffect } from "react";

/**
 * 上部固定ヘッダーの実際の高さを html の CSS 変数 --header-height に入れ続ける（表示は無い）。
 * globals.css の scroll-padding-top がこれを使い、アンカー移動（#main 等）やフォームのエラー欄へのフォーカス移動で
 * 見出し・入力欄がヘッダーの裏に隠れないようにする。
 * ヘッダーの高さは画面幅（スマホは 2 段に折り返す）と文字サイズ（標準・大・特大）で変わるので固定値にしない。
 */
export function HeaderHeightSync() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>("[data-site-header]");
    const root = document.documentElement;
    if (!header) return;
    const update = () =>
      root.style.setProperty("--header-height", `${header.getBoundingClientRect().height}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--header-height");
    };
  }, []);
  return null;
}
