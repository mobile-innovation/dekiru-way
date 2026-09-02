import { prisma } from "@/lib/db";
import { ok, parseQuery, ApiError } from "@/lib/api";
import { handlePublicRead } from "@/lib/public-api";
import { experienceQuerySchema, MAX_RESULT_WINDOW } from "@/lib/validation";
import { buildExperienceWhere, buildExperienceOrderBy, experienceInclude } from "@/lib/search";
import { serializeExperience } from "@/lib/serializers";

/**
 * GET /api/v1/experiences — 公開経験の検索 (ログイン不要, 指示書 10/13)。
 * 返すのは attempts.is_published = true のものだけ。
 * 認証不要だが無制限ではない: Bot / 大量取得ガード + 深いページングの上限 (追加指示書 v1)。
 */
export const GET = handlePublicRead(async (req) => {
  const q = parseQuery(req.url, experienceQuerySchema);

  if ((q.page - 1) * q.limit >= MAX_RESULT_WINDOW) {
    throw new ApiError(
      "bad_request",
      "検索結果が多すぎます。ことばやタグ、結果でもう少し絞り込んでください。",
    );
  }

  const where = buildExperienceWhere(q);
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
    items: rows.map((r) => serializeExperience(r)),
    page: q.page,
    limit: q.limit,
    total,
    hasMore: skip + rows.length < total && q.page < 100,
  });
});
