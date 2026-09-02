import { prisma } from "@/lib/db";
import { handle, ok, noContent, parseJson, ApiError } from "@/lib/api";
import { requireUserId, assertAttemptOwner } from "@/lib/authz";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { attemptUpdateSchema } from "@/lib/validation";
import { serializeAttempt } from "@/lib/serializers";
import { toDbDate } from "@/lib/dates";
import { deleteByUrl } from "@/lib/storage";
import { assertValidPreviousAttempt } from "@/lib/attempts";

// GET /api/v1/attempts/{attemptId} — 本人のみ (編集用ビュー)。公開閲覧は /experiences 経由。
export const GET = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { attemptId } = await ctx.params;
  await assertAttemptOwner(attemptId, userId);
  const attempt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    include: { photos: true },
  });
  return ok(serializeAttempt(attempt));
});

// PATCH /api/v1/attempts/{attemptId} — 本人のみ。公開/非公開の切替もここ。
export const PATCH = handle(async (req, ctx) => {
  const userId = await requireUserId();
  const { attemptId } = await ctx.params;
  const { roadId } = await assertAttemptOwner(attemptId, userId);
  enforceRateLimit({ key: `attempt:update:${userId}`, ...RATE_PRESETS.write });

  const input = await parseJson(req, attemptUpdateSchema);
  if (Object.keys(input).length === 0) {
    throw new ApiError("bad_request", "更新する項目がありません");
  }
  if (input.previousAttemptId !== undefined) {
    await assertValidPreviousAttempt(input.previousAttemptId, roadId, attemptId);
  }

  const attempt = await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.result !== undefined ? { result: input.result } : {}),
      ...(input.triedAt !== undefined ? { triedAt: toDbDate(input.triedAt) } : {}),
      ...(input.memo !== undefined ? { memo: input.memo } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      ...(input.achievementPercent !== undefined
        ? { achievementPercent: input.achievementPercent }
        : {}),
      ...(input.feeling !== undefined ? { feeling: input.feeling } : {}),
      ...(input.stateAfter !== undefined ? { stateAfter: input.stateAfter } : {}),
      ...(input.nextAction !== undefined ? { nextAction: input.nextAction } : {}),
      ...(input.previousAttemptId !== undefined
        ? { previousAttemptId: input.previousAttemptId }
        : {}),
    },
    include: { photos: true },
  });
  return ok(serializeAttempt(attempt));
});

// DELETE /api/v1/attempts/{attemptId} — 本人のみ。
// 「失敗した Attempt を自動削除しない」規定は本人の明示操作を妨げない (指示書 2)。
export const DELETE = handle(async (_req, ctx) => {
  const userId = await requireUserId();
  const { attemptId } = await ctx.params;
  await assertAttemptOwner(attemptId, userId);
  enforceRateLimit({ key: `attempt:delete:${userId}`, ...RATE_PRESETS.write });

  const photos = await prisma.attemptPhoto.findMany({
    where: { attemptId },
    select: { storageUrl: true },
  });
  await prisma.attempt.delete({ where: { id: attemptId } });
  await Promise.allSettled(photos.map((p) => deleteByUrl(p.storageUrl)));
  return noContent();
});
