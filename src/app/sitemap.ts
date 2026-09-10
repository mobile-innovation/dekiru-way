import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/**
 * sitemap.xml。露出方針: 検索エンジンに載せるのはトップページだけ (検索露出制御指示書 §11)。
 * トップ以外の公開ページは各ページの `noindex` で除外する。管理系は載せない。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${env.site.url}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
