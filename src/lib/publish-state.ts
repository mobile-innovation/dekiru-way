import { ModerationStatus } from "@prisma/client";

/**
 * 本人ビューで「試したこと」の公開状態を表す 4 値。
 *   private    = 非公開 (isPublished=false)
 *   reviewing  = 公開申請したが運営レビュー待ち (AI が NG/不明)
 *   published  = 公開中 (承認済み)
 *   rejected   = 運営が公開を見送った
 *
 * 依存を持たないリーフモジュール (serializer から安全に import できるよう AI SDK を挟まない)。
 */
export type PublishState = "private" | "reviewing" | "published" | "rejected";

export function publishStateOf(a: {
  isPublished: boolean;
  moderationStatus: ModerationStatus;
}): PublishState {
  if (!a.isPublished) return "private";
  if (a.moderationStatus === ModerationStatus.approved) return "published";
  if (a.moderationStatus === ModerationStatus.rejected) return "rejected";
  return "reviewing";
}

export const PUBLISH_STATE_LABEL: Record<PublishState, string> = {
  private: "自分だけに表示",
  reviewing: "確認中",
  published: "経験として公開中",
  rejected: "公開が見送られました",
};
