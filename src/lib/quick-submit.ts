import { ModerationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { moderateAttemptContent } from "@/lib/ai/moderation";
import type { QuickExperienceInput } from "@/lib/validation";

/**
 * SNS からの「試したことを教えてください」簡易登録 (/try) のサーバ処理。
 *
 * 設計方針:
 *   - 新しいデータモデルは作らない。既存の Road + Attempt をそのまま使う
 *     (経験 = 公開された Attempt という既存仕様を踏襲)。
 *   - Road.userId は NOT NULL のため、匿名投稿の受け皿として専用のシステム利用者を 1 行だけ持つ。
 *     この利用者は Google ログインしないので、氏名・アバターは持たず、公開面にも一切出ない
 *     (シリアライザは経験に利用者情報を含めない)。
 *   - 未ログイン投稿を無条件で公開しない。Attempt は必ず pending で作り、
 *     既存の管理画面モデレーションキュー (/admin/moderation) で運営が確認してから公開する。
 */

/** 匿名簡易登録の受け皿となるシステム利用者の識別子 (Google の sub とは衝突しない形式)。 */
export const ANON_SUBMITTER_SUB = "system:anonymous-submissions";

/** 管理画面で「SNS 簡易登録由来」と分かるようにするための運営メモ。 */
export const QUICK_SUBMIT_NOTE = "SNSからの簡易登録（未ログイン）";

/** 匿名投稿の受け皿ユーザーを取得する (無ければ作成)。 */
export async function getOrCreateAnonSubmitter(): Promise<{ id: string }> {
  return prisma.user.upsert({
    where: { googleSub: ANON_SUBMITTER_SUB },
    update: {},
    create: { googleSub: ANON_SUBMITTER_SUB, displayName: "匿名（SNS簡易登録）" },
    select: { id: true },
  });
}

export interface QuickSubmitResult {
  attemptId: string;
  roadId: string;
}

/**
 * 簡易登録 1 件を保存する。
 *   - Road: 困っていたことだけを持つ。内容は Attempt 確認時に必ず一緒に表示されるため approved で作る
 *     (経験が公開されるかどうかは下の Attempt の承認が唯一のゲート)。
 *   - Attempt: 試したこと + 結果。isPublished=true だが moderationStatus は必ず pending。
 *     AI 判定は運営の参考情報として埋めるだけで、pending は覆さない (§15: 匿名投稿を自動公開しない)。
 */
export async function createQuickSubmission(
  input: QuickExperienceInput,
): Promise<QuickSubmitResult> {
  const submitter = await getOrCreateAnonSubmitter();

  const road = await prisma.road.create({
    data: {
      userId: submitter.id,
      difficulty: input.difficulty,
      moderationStatus: ModerationStatus.approved,
      // 匿名の受け皿の道。道ページとしての公開はしない (経験の公開ゲートは Attempt 承認のみ)。
      visibility: "private",
    },
    select: { id: true },
  });

  // AI 判定は「参考情報」。運営スイッチが無効なら呼ばない (E2E / ローカルの課金・遅延回避)。
  const ai = env.ai.moderationEnabled
    ? await moderateAttemptContent({ method: input.method, road: { difficulty: input.difficulty } })
    : null;

  const attempt = await prisma.attempt.create({
    data: {
      roadId: road.id,
      method: input.method,
      result: input.result,
      isPublished: true,
      // 必ず運営レビュー待ち。AI が ok でも自動公開しない。
      moderationStatus: ModerationStatus.pending,
      moderationNote: QUICK_SUBMIT_NOTE,
      aiVerdict: ai?.verdict ?? null,
      aiReason: ai?.reason ?? null,
      aiCategories: ai?.categories ?? [],
      aiCheckedAt: ai ? new Date() : null,
    },
    select: { id: true },
  });

  return { attemptId: attempt.id, roadId: road.id };
}
