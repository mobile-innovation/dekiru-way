import { prisma } from "@/lib/db";
import { ok, ApiError, assertUuid } from "@/lib/api";
import { handlePublicRead } from "@/lib/public-api";
import { experienceInclude, PUBLIC_ATTEMPT_WHERE } from "@/lib/search";
import { serializeExperience } from "@/lib/serializers";

/**
 * GET /api/v1/experiences/{id} — 経験詳細 (ログイン不要, 指示書 6-③)。
 * id は公開 Attempt の id。
 * 同じ Road の「他の公開 Attempt」も siblings として返す (指示書 6-④ 道の見える化)。
 * 非公開 Attempt は絶対に含めない。内部 ID (user_id / road_id) は返さない (追加指示書 §6)。
 */
export const GET = handlePublicRead(async (_req, ctx) => {
  const { id } = await ctx.params;
  assertUuid(id, "経験");

  const row = await prisma.attempt.findFirst({
    where: { id, ...PUBLIC_ATTEMPT_WHERE },
    include: experienceInclude,
  });
  if (!row) {
    throw new ApiError("not_found", "経験が見つかりません（非公開かもしれません）");
  }

  const siblings = await prisma.attempt.findMany({
    where: { roadId: row.roadId, ...PUBLIC_ATTEMPT_WHERE },
    include: experienceInclude,
  });

  return ok(serializeExperience(row, { siblings }));
});
