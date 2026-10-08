import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  moderateAttemptContent,
  type AttemptModerationInput,
  type ModerationVerdict,
} from "@/lib/ai/moderation";
import { notifyAdminOfNewPending } from "@/lib/admin-notify";

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
 * AI 審査本文に使う Attempt と道の項目。公開・編集時の審査 ({@link applyModerationOnPublish}) と
 * 管理画面の AI 再チェックで審査対象をそろえるため、両方がこの select を使う。
 * 道は審査状態を持たないが、公開経験と一緒に公開面へ出る記述 (進捗・道の次に試すこと・タグを含む)
 * は試したことの審査本文に含める。
 */
export const ATTEMPT_MODERATION_SELECT = {
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
      progress: true,
      nextAction: true,
      roadTags: { select: { tag: { select: { name: true } } } },
    },
  },
} as const satisfies Prisma.AttemptSelect;

type AttemptModerationRow = Prisma.AttemptGetPayload<{ select: typeof ATTEMPT_MODERATION_SELECT }>;

/** {@link ATTEMPT_MODERATION_SELECT} で読んだ行を AI 審査の入力に変換する。 */
export function toAttemptModerationInput(a: AttemptModerationRow): AttemptModerationInput {
  return {
    method: a.method,
    memo: a.memo,
    feeling: a.feeling,
    stateAfter: a.stateAfter,
    nextAction: a.nextAction,
    road: {
      difficulty: a.road.difficulty,
      goal: a.road.goal,
      situation: a.road.situation,
      previouslyAble: a.road.previouslyAble,
      progress: a.road.progress,
      nextAction: a.road.nextAction,
      tags: a.road.roadTags.map((rt) => rt.tag.name),
    },
  };
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
      data: { moderationStatus: ModerationStatus.approved, pendingNotifiedAt: null },
      select: { roadId: true },
    });
    await bumpRoadUpdatedAt(roadId);
    return { verdict: "ok", reason: "モデレーションは無効化されています", categories: [] };
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { roadId: true, createdAt: true, ...ATTEMPT_MODERATION_SELECT },
  });
  if (!attempt) {
    return { verdict: "unknown", reason: "対象の投稿が見つかりませんでした。", categories: [] };
  }

  const result = await moderateAttemptContent(toAttemptModerationInput(attempt));

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
    ...(result.verdict === "ok" ? { pendingNotifiedAt: null } : {}),
  };

  await prisma.attempt.update({ where: { id: attemptId }, data });
  if (result.verdict === "ok") {
    // approved になった = その道の公開経験が増えた / 更新された → 道を浮上させる。
    await bumpRoadUpdatedAt(attempt.roadId);
  } else {
    // 運営レビュー待ちになった → 管理者へ通知 (二重送信対策は notifyAdminOfNewPending 側)。
    await notifyAdminOfNewPending(attemptId, attempt.createdAt);
  }
  return result;
}
