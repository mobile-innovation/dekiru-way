import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  moderateAttemptContent,
  moderateRoadContent,
  type ModerationVerdict,
} from "@/lib/ai/moderation";

export { publishStateOf, PUBLISH_STATE_LABEL, type PublishState } from "@/lib/publish-state";

/** 道の内容モデレーションで見る項目。編集でこれらが変わったら再審査する。 */
export const ROAD_MODERATED_FIELDS = [
  "title",
  "difficulty",
  "goal",
  "situation",
  "previouslyAble",
  "progress",
  "nextAction",
  "memo",
  "status",
] as const;

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
    await prisma.attempt.update({
      where: { id: attemptId },
      data: { moderationStatus: ModerationStatus.approved },
    });
    return { verdict: "ok", reason: "モデレーションは無効化されています", categories: [] };
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: {
      method: true,
      memo: true,
      feeling: true,
      stateAfter: true,
      nextAction: true,
      road: {
        select: { difficulty: true, goal: true, situation: true, previouslyAble: true },
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
    road: attempt.road,
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
  return result;
}

/**
 * 道 (Road) を登録 / 編集したタイミングで AI 審査を走らせ、結果を Road に反映する。
 * ng/unknown なら moderationStatus = pending。承認済みでない道の経験は公開面に出さない
 * (`PUBLIC_ATTEMPT_WHERE` が親 Road の承認も要求する)。
 */
export async function applyRoadModeration(roadId: string): Promise<ModerationVerdict> {
  if (!env.ai.moderationEnabled) {
    await prisma.road.update({
      where: { id: roadId },
      data: { moderationStatus: ModerationStatus.approved },
    });
    return { verdict: "ok", reason: "モデレーションは無効化されています", categories: [] };
  }

  const road = await prisma.road.findUnique({
    where: { id: roadId },
    select: {
      title: true,
      difficulty: true,
      goal: true,
      situation: true,
      previouslyAble: true,
      progress: true,
      nextAction: true,
      memo: true,
      status: true,
      roadTags: { select: { tag: { select: { name: true } } } },
    },
  });
  if (!road) {
    return { verdict: "unknown", reason: "対象の道が見つかりませんでした。", categories: [] };
  }

  // タグも公開面 (経験のタグ一覧・タグ検索) に出るため、他の記述項目と同じく審査対象に含める。
  const result = await moderateRoadContent({
    ...road,
    tags: road.roadTags.map((rt) => rt.tag.name),
  });

  await prisma.road.update({
    where: { id: roadId },
    data: {
      aiVerdict: result.verdict,
      aiReason: result.reason,
      aiCategories: result.categories,
      aiCheckedAt: new Date(),
      moderationStatus:
        result.verdict === "ok" ? ModerationStatus.approved : ModerationStatus.pending,
      moderatedByAdmin: { disconnect: true },
      moderatedAt: null,
    } satisfies Prisma.RoadUpdateInput,
  });
  return result;
}
