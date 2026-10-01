import { describe, it, expect, vi } from "vitest";

// layout.tsx のヘッダー等は next-auth を読み込むため、metadata だけを見るこのテストでは空にする
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/site-chrome", () => ({ SiteChrome: () => null }));
import { existsSync } from "node:fs";
import { join } from "node:path";
import { OGP_IMAGE } from "@/lib/ogp";
import { metadata as rootMetadata } from "@/app/layout";
import { metadata as tryMetadata } from "@/app/try/page";

/** 全ページ共通の OGP 画像（2026-10-02）。ルートレイアウトの既定と /try が同じ画像を使う。 */
describe("OGP 画像", () => {
  it("共通画像は ogp20261002.png（1726×911）で、public にある", () => {
    expect(OGP_IMAGE).toEqual({
      url: "/ogp20261002.png",
      width: 1726,
      height: 911,
      alt: "できる道",
    });
    expect(existsSync(join(process.cwd(), "public", "ogp20261002.png"))).toBe(true);
  });

  it("ルートレイアウトの既定（全ページ）: og:image / twitter:image が共通画像、大きいカード", () => {
    const og = rootMetadata.openGraph as { images: unknown[]; siteName: string; locale: string };
    expect(og.images).toEqual([OGP_IMAGE]);
    expect(og.siteName).toBe("できる道");
    expect(og.locale).toBe("ja_JP");
    const tw = rootMetadata.twitter as { card: string; images: string[] };
    expect(tw.card).toBe("summary_large_image");
    expect(tw.images).toEqual([OGP_IMAGE.url]);
  });

  it("/try も同じ共通画像を使う", () => {
    expect((tryMetadata.openGraph as { images: unknown[] }).images).toEqual([OGP_IMAGE]);
    expect((tryMetadata.twitter as { images: string[] }).images).toEqual([OGP_IMAGE.url]);
  });
});
