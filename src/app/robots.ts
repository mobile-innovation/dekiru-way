import type { MetadataRoute } from "next";

/**
 * robots.txt (追加指示書 v1 §8)。
 *   - 一般クローラー: 公開ページの巡回は許可、ただし /api/ と本人用ページは不可
 *   - 収集目的が明確な AI クローラー: サイト全体を不可
 *
 * robots.txt は「お願い」であり、これだけを防御にしない (§8)。
 * 実際の制限は middleware + bot-guard + Rate Limit が担う。
 * 対象 Bot 名はサービス公開時点の状況で更新すること。
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
        disallow: ["/api/", "/me/", "/me", "/login", "/admin/", "/admin", "/try"],
      },
      ...AI_CRAWLERS.map((ua) => ({ userAgent: ua, disallow: "/" })),
    ],
  };
}
