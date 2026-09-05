import { prisma } from "@/lib/db";
import { ok } from "@/lib/api";
import { handlePublicRead } from "@/lib/public-api";
import { PUBLIC_ATTEMPT_WHERE } from "@/lib/search";

/**
 * GET /api/v1/tags — タグ一覧 (ログイン不要)。
 * 公開経験 (公開 Attempt) がひも付くタグを、件数の多い順で返す。
 * 一度に大量取得させないため上限を設ける (追加指示書 §3/§15)。
 */
const MAX_TAGS = 100;

export const GET = handlePublicRead(async () => {
  const tags = await prisma.tag.findMany({
    where: { roadTags: { some: { road: { attempts: { some: PUBLIC_ATTEMPT_WHERE } } } } },
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          roadTags: { where: { road: { attempts: { some: PUBLIC_ATTEMPT_WHERE } } } },
        },
      },
    },
  });

  const items = tags
    .map((t) => ({ id: t.id, name: t.name, roadCount: t._count.roadTags }))
    .sort((a, b) => b.roadCount - a.roadCount || a.name.localeCompare(b.name, "ja"))
    .slice(0, MAX_TAGS);

  return ok({ items });
});
