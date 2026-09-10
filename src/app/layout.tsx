import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteChrome } from "@/components/site-chrome";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  // 各ページの metadata が持つ相対URL (og:image / canonical など) を絶対URLへ解決する基点。
  // 本番は SITE_URL、未設定時は http://localhost:3000。
  metadataBase: new URL(env.site.url),
  title: {
    default: "できる道 — 誰かの試行錯誤を、誰かの次の一歩へ",
    template: "%s | できる道",
  },
  description:
    "「できない」を終点にしない。できなくなったことを一つ入力したら、同じことで困った誰かの経験が見つかります。",
  // 既定は「検索エンジンに登録しない」。トップページ (app/page.tsx) だけが index を許可する。
  // リンクの追跡自体は塞がない (noindex, follow)。本人ページ・ログイン・管理は各所で nofollow も付ける。
  robots: { index: false, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // ユーザーによる拡大を禁止しない (アクセシビリティ)
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <a href="#main" className="skip-link">
          本文へスキップ
        </a>
        <SiteChrome>
          <SiteHeader />
        </SiteChrome>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
          {children}
        </main>
        <SiteChrome>
          <SiteFooter />
        </SiteChrome>
        {/* Google AdSense のローダ。パブリッシャ ID 設定時のみ。
            配信は各 <AdSenseUnit> が push 前に requestNonPersonalizedAds=1 を立てて非パーソナライズに固定。 */}
        {env.ads.enabled && env.ads.adsenseClient && (
          <Script
            id="adsbygoogle-loader"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${env.ads.adsenseClient}`}
          />
        )}
      </body>
    </html>
  );
}
