import { prisma } from "@/lib/db";
import { ok, parseQuery } from "@/lib/api";
import { handlePublicRead } from "@/lib/public-api";
import { pathsQuerySchema } from "@/lib/validation";
import { buildExperienceWhere } from "@/lib/search";
import { sortAttemptsChronologically } from "@/lib/serializers";

/**
 * GET /api/v1/experiences/paths — 「道の見える化」用データ (指示書 6-④, 11)。
 * 専用テーブルは持たず、Road + 公開 Attempt から画面用の「方法 → 結果」列を生成して返す。
 * 内部の road_id は返さない (追加指示書 §6/§7)。クラスタ識別は先頭経験の id を key にする。
 */
export const GET = handlePublicRead(async (req) => {
  const q = parseQuery(req.url, pathsQuerySchema);

  const rows = await prisma.attempt.findMany({
    where: buildExperienceWhere({ q: q.q, tag: q.tag }),
    select: {
      id: true,
      method: true,
      result: true,
      triedAt: true,
      createdAt: true,
      roadId: true,
      road: {
        select: {
          difficulty: true,
          goal: true,
          previouslyAble: true,
          roadTags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 400,
  });

  const byRoad = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byRoad.get(r.roadId) ?? [];
    list.push(r);
    byRoad.set(r.roadId, list);
  }

  const paths = [...byRoad.values()]
    .map((attempts) => {
      const first = attempts[0];
      const steps = attempts
        .slice()
        .sort(sortAttemptsChronologically)
        .map((a) => ({
          experienceId: a.id,
          method: a.method,
          result: a.result,
          triedAt: a.triedAt ? a.triedAt.toISOString().slice(0, 10) : null,
        }));
      return {
        key: steps[0]?.experienceId ?? first.id,
        difficulty: first.road.difficulty,
        goal: first.road.goal,
        previouslyAble: first.road.previouslyAble,
        tags: first.road.roadTags.map((rt) => rt.tag.name),
        steps,
      };
    })
    .sort((a, b) => b.steps.length - a.steps.length)
    .slice(0, q.limit);

  return ok({ items: paths });
});
