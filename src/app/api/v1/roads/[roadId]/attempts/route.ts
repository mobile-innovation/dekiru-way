import { prisma } from "@/lib/db";
import { handle, ok, created, parseJson } from "@/lib/api";
import { requireUserId, assertRoadOwner } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { attemptCreateSchema } from "@/lib/validation";
import { serializeAttempt, sortAttemptsChronologically } from "@/lib/serializers";
import { toDbDate } from "@/lib/dates";
import { assertValidPreviousAttempt } from "@/lib/attempts";
import { applyModerationOnPublish } from "@/lib/moderation";

// GET /api/v1/roads/{roadId}/attempts — 本人のみ。時系列順。
export const GET = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { roadId } = await ctx.params;
  await assertRoadOwner(roadId, userId);
  const attempts = await prisma.attempt.findMany({
    where: { roadId },
    include: { photos: true },
  });
  return ok({ items: attempts.sort(sortAttemptsChronologically).map(serializeAttempt) });
});

// POST /api/v1/roads/{roadId}/attempts — 試したことを記録 (指示書 6-⑥)。
// failed も success と同じ経路で保存される (指示書 2/23)。
export const POST = handle(async (req, ctx) => {
  const userId = await requireUserId();
  const { roadId } = await ctx.params;
  await assertRoadOwner(roadId, userId);
  enforceRateLimit({ key: `attempt:create:${userId}`, ...RATE_PRESETS.write });

  const input = await parseJson(req, attemptCreateSchema);
  await assertValidPreviousAttempt(input.previousAttemptId, roadId);

  const attempt = await prisma.attempt.create({
    data: {
      roadId,
      method: input.method,
      result: input.result,
      triedAt: toDbDate(input.triedAt) ?? null,
      memo: input.memo ?? null,
      isPublished: input.isPublished ?? false,
      achievementPercent: input.achievementPercent ?? null,
      feeling: input.feeling ?? null,
      stateAfter: input.stateAfter ?? null,
      nextAction: input.nextAction ?? null,
      previousAttemptId: input.previousAttemptId ?? null,
    },
    include: { photos: true },
  });

  // 公開して作成された場合は AI 審査を走らせる (OK なら即公開 / NG・不明は運営レビュー待ち)。
  if (attempt.isPublished) {
    await applyModerationOnPublish(attempt.id);
    const fresh = await prisma.attempt.findUniqueOrThrow({
      where: { id: attempt.id },
      include: { photos: true },
    });
    return created(serializeAttempt(fresh));
  }

  return created(serializeAttempt(attempt));
});
