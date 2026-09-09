"use client";

import { useEffect, useRef } from "react";

/**
 * Google AdSense の 1 広告ユニット（`<ins class="adsbygoogle">`）。
 *
 * - パブリッシャ ID / slot ID は props で受け取る（`env` を client に import しない）。
 * - **非パーソナライズ配信**を強制する: push の前に
 *   `window.adsbygoogle.requestNonPersonalizedAds = 1` を立てる（行動追跡なし・文脈広告のみ）。
 * - ローダ (`adsbygoogle.js`) は `app/layout.tsx` が client 設定時のみ読み込む。
 *   未ロードでも push はただの配列 push なので画面は壊れない。
 */
export function AdSenseUnit({ client, slot }: { client: string; slot: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    pushed.current = true;
    try {
      const w = window as unknown as {
        adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number };
      };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.requestNonPersonalizedAds = 1;
      w.adsbygoogle.push({});
    } catch {
      /* 配信タグ未ロード等でも画面は壊さない */
    }
  }, []);

  return (
    <ins
      className="adsbygoogle"
      style={{ display: "block" }}
      data-ad-client={client}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
