import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * robots.txt。
 *   - 一般クローラー: ページの巡回は許可（`/api/` と管理系だけ Disallow）。
 *     検索結果からの除外は robots.txt ではなく各ページの `noindex`（meta ＋ X-Robots-Tag）で行う。
 *     robots.txt でページをブロックすると、クローラーが `noindex` を読めず登録が残ることがあるため
 *     本人ページ・ログインは *あえて* Disallow しない（露出制御指示書 §10 / §13）。
 *   - 収集目的が明確な AI クローラー: サイト全体を不可。
 *
 * robots.txt は「お願い」であり、これだけを防御にしない。
 * 実際の制限は middleware + bot-guard + Rate Limit + 各ページの認証・認可 が担う。
 */

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "CCBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "PerplexityBot",
  "Perplexity-User",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Omgili",
  "FacebookBot",
  "meta-externalagent",
  "meta-externalfetcher",
  "YouBot",
  "AI2Bot",
  "Timpibot",
  "Webzio-Extended",
  "DataForSeoBot",
  "magpie-crawler",
  "PetalBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // ページ (HTML) は巡回可 → 各ページの noindex を読ませる。
        // JSON API と管理系だけ Disallow（管理系は別途 BASIC 認証＋noindex）。
        disallow: ["/api/", "/admin/", "/admin"],
      },
      ...AI_CRAWLERS.map((ua) => ({ userAgent: ua, disallow: "/" })),
    ],
    sitemap: `${env.site.url}/sitemap.xml`,
  };
}
