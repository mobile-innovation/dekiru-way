import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SiteChrome } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: {
    default: "できる道 — 誰かの試行錯誤を、誰かの次の一歩へ",
    template: "%s | できる道",
  },
  description:
    "「できない」を終点にしない。できなくなったことを一つ入力したら、同じことで困った誰かの経験が見つかります。",
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
      </body>
    </html>
  );
}
