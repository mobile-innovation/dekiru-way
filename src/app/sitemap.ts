import type { MetadataRoute } from "next";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { PUBLIC_ATTEMPT_WHERE } from "@/lib/search";

/**
 * sitemap.xml。露出方針: トップページ＋公開経験の詳細ページ (`/experiences/[id]`) を載せる
 * (2026-09-20 検索エンジン露出方針の改定。検索一覧・タグ・道の見える化などの一覧系ページは
 * 引き続き `noindex` のまま載せない)。管理系は載せない。
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const attempts = await prisma.attempt.findMany({
    where: PUBLIC_ATTEMPT_WHERE,
    select: { id: true, updatedAt: true },
  });

  return [
    {
      url: `${env.site.url}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...attempts.map(
      (a): MetadataRoute.Sitemap[number] => ({
        url: `${env.site.url}/experiences/${a.id}`,
        lastModified: a.updatedAt,
        changeFrequency: "monthly",
        priority: 0.5,
      }),
    ),
  ];
}
