import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { moderateAttemptContent, type ModerationVerdict } from "@/lib/ai/moderation";
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
    select: {
      roadId: true,
      createdAt: true,
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
          progress: attempt.road.progress,
          nextAction: attempt.road.nextAction,
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

/**
 * 公開経験と一緒に公開面へ出る道の項目 (H-2)。これとタグのどれかが変わったら、
 * その道の公開中・承認済みの経験を再審査する。memo / status / startedAt は公開面に出ない
 * (日付のみの startedAt を除く) か審査対象外なので含めない。
 */
export const ROAD_PUBLIC_FIELDS = [
  "difficulty",
  "goal",
  "previouslyAble",
  "situation",
  "progress",
  "nextAction",
] as const;

export type RoadPublicSnapshot = Record<(typeof ROAD_PUBLIC_FIELDS)[number], string | null> & {
  tags: string[];
};

/** 道の公開項目とタグ名 (並び順を正規化) を DB から読む。比較用。 */
export async function readRoadPublicSnapshot(roadId: string): Promise<RoadPublicSnapshot> {
  const road = await prisma.road.findUniqueOrThrow({
    where: { id: roadId },
    select: {
      difficulty: true,
      goal: true,
      previouslyAble: true,
      situation: true,
      progress: true,
      nextAction: true,
      roadTags: { select: { tag: { select: { name: true } } } },
    },
  });
  const { roadTags, ...fields } = road;
  return { ...fields, tags: roadTags.map((rt) => rt.tag.name).sort() };
}

/** 保存後の値どうしで比べる (PATCH に含まれていても値が同じなら変更なし)。 */
export function roadPublicContentChanged(
  before: RoadPublicSnapshot,
  after: RoadPublicSnapshot,
): boolean {
  if (ROAD_PUBLIC_FIELDS.some((f) => before[f] !== after[f])) return true;
  return before.tags.join("\n") !== after.tags.join("\n");
}

/**
 * 道の公開項目が変わったとき、その道の公開中・承認済みの経験を既存の
 * {@link applyModerationOnPublish} で 1 件ずつ再審査する (H-2)。
 * 道自体は審査状態を持たない (2026-09-09 の方針を維持)。保留中 (pending) と
 * 却下済み (rejected) は対象にしない。件数上限は設けない (2026-10-08 時点の判断)。
 * 再審査した経験の id を返す。
 */
export async function remoderateApprovedAttemptsOfRoad(roadId: string): Promise<string[]> {
  const targets = await prisma.attempt.findMany({
    where: { roadId, isPublished: true, moderationStatus: ModerationStatus.approved },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  for (const { id } of targets) {
    await applyModerationOnPublish(id);
  }
  return targets.map((t) => t.id);
}
