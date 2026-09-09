import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { moderateAttemptContent, type ModerationVerdict } from "@/lib/ai/moderation";

export { publishStateOf, PUBLISH_STATE_LABEL, type PublishState } from "@/lib/publish-state";

/**
 * その道に「公開できる経験」が増えた / 内容が更新されたとき、道の `updatedAt` を進める。
 * 検索の既定並び順は `roads.updatedAt` desc なので、新しい公開経験が付いた道を上へ浮かせるため。
 * （`updatedAt` は「道の行の編集」に加えて「その道の公開経験が動いた」も意味するようになる。）
 */
export async function bumpRoadUpdatedAt(roadId: string): Promise<void> {
  await prisma.road.update({ where: { id: roadId }, data: { updatedAt: new Date() } });
}

/**
 * 投稿 (Attempt) を公開しようとしたタイミングで AI 審査を走らせ、結果を Attempt に反映する。
 *
 * - verdict "ok"      → moderationStatus = approved (そのまま公開)
 * - verdict "ng"/"unknown" → moderationStatus = pending (公開面から外し、運営レビューへ)
 *
 * すでに approved の投稿を本人が編集したケースでも呼ばれる。内容が ng/unknown に転じたら
 * pending に戻り、公開面から自動的に外れる。運営が手動で approved / rejected にした後は
 * この関数を通さない限り状態は変わらない。
 *
 * 返り値は呼び出し側 (API) が本人向けメッセージを出し分けるための verdict。
 */
export async function applyModerationOnPublish(attemptId: string): Promise<ModerationVerdict> {
  // 運用スイッチ: AI モデレーション無効時は AI を呼ばず即 approved にする。
  if (!env.ai.moderationEnabled) {
    const { roadId } = await prisma.attempt.update({
      where: { id: attemptId },
      data: { moderationStatus: ModerationStatus.approved },
      select: { roadId: true },
    });
    await bumpRoadUpdatedAt(roadId);
    return { verdict: "ok", reason: "モデレーションは無効化されています", categories: [] };
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: {
      roadId: true,
      method: true,
      memo: true,
      feeling: true,
      stateAfter: true,
      nextAction: true,
      road: {
        select: {
          difficulty: true,
          goal: true,
          situation: true,
          previouslyAble: true,
          roadTags: { select: { tag: { select: { name: true } } } },
        },
      },
    },
  });
  if (!attempt) {
    return { verdict: "unknown", reason: "対象の投稿が見つかりませんでした。", categories: [] };
  }

  const result = await moderateAttemptContent({
    method: attempt.method,
    memo: attempt.memo,
    feeling: attempt.feeling,
    stateAfter: attempt.stateAfter,
    nextAction: attempt.nextAction,
    road: attempt.road
      ? {
          difficulty: attempt.road.difficulty,
          goal: attempt.road.goal,
          situation: attempt.road.situation,
          previouslyAble: attempt.road.previouslyAble,
          tags: attempt.road.roadTags.map((rt) => rt.tag.name),
        }
      : null,
  });

  const data: Prisma.AttemptUpdateInput = {
    aiVerdict: result.verdict,
    aiReason: result.reason,
    aiCategories: result.categories,
    aiCheckedAt: new Date(),
    moderationStatus:
      result.verdict === "ok" ? ModerationStatus.approved : ModerationStatus.pending,
    // 自動再審査では手動判断の記録はクリアする (最新の状態は AI 由来)
    moderatedByAdmin: { disconnect: true },
    moderatedAt: null,
  };

  await prisma.attempt.update({ where: { id: attemptId }, data });
  // approved になった = その道の公開経験が増えた / 更新された → 道を浮上させる。
  if (result.verdict === "ok") {
    await bumpRoadUpdatedAt(attempt.roadId);
  }
  return result;
}
