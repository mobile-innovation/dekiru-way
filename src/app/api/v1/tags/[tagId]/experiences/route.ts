import { prisma } from "@/lib/db";
import { ok, parseQuery, ApiError, assertUuid } from "@/lib/api";
import { handlePublicRead } from "@/lib/public-api";
import { experienceQuerySchema, MAX_RESULT_WINDOW } from "@/lib/validation";
import { buildExperienceWhere, buildExperienceOrderBy, experienceInclude } from "@/lib/search";
import { serializeExperience } from "@/lib/serializers";

/**
 * GET /api/v1/tags/{tagId}/experiences — 指定タグの公開経験一覧 (指示書 11)。
 * 認証不要だが Bot / 大量取得ガード + 深いページング上限あり (追加指示書 v1)。
 */
export const GET = handlePublicRead(async (req, ctx) => {
  const { tagId } = await ctx.params;
  assertUuid(tagId, "タグ");
  const tag = await prisma.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw new ApiError("not_found", "タグが見つかりません");

  const q = parseQuery(req.url, experienceQuerySchema);
  if ((q.page - 1) * q.limit >= MAX_RESULT_WINDOW) {
    throw new ApiError("bad_request", "結果が多すぎます。ことばや結果でさらに絞り込んでください。");
  }

  const where = buildExperienceWhere({ q: q.q, result: q.result, tag: tag.name });
  const skip = (q.page - 1) * q.limit;

  const [total, rows] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      include: experienceInclude,
      orderBy: buildExperienceOrderBy(q.sort),
      skip,
      take: q.limit,
    }),
  ]);

  return ok({
    tag: { id: tag.id, name: tag.name },
    items: rows.map((r) => serializeExperience(r)),
    page: q.page,
    limit: q.limit,
    total,
    hasMore: skip + rows.length < total && q.page < 100,
  });
});
