import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";

/**
 * `previous_attempt_id` の整合性チェック (追加指示書 v6 §14/§29)。
 *   - 同じ Road の Attempt であること
 *   - 自分自身でないこと
 *   - 存在すること
 *   - つながりが循環しないこと（日付や並びからの推測はここでは扱わない。呼び出し側の責務）
 *
 * @param previousAttemptId 検証対象（null/undefined はスキップ = 関係なし）
 * @param roadId            この Attempt が属する Road
 * @param selfId            編集中の Attempt の id（作成時は未指定）
 */
export async function assertValidPreviousAttempt(
  previousAttemptId: string | null | undefined,
  roadId: string,
  selfId?: string,
): Promise<void> {
  if (!previousAttemptId) return;

  if (selfId && previousAttemptId === selfId) {
    throw new ApiError("bad_request", "「前に試した方法」に自分自身は選べません");
  }

  const prev = await prisma.attempt.findUnique({
    where: { id: previousAttemptId },
    select: { id: true, roadId: true, previousAttemptId: true },
  });
  if (!prev) {
    throw new ApiError("bad_request", "「前に試した方法」が見つかりません");
  }
  if (prev.roadId !== roadId) {
    throw new ApiError("bad_request", "「前に試した方法」は同じ道の中から選んでください");
  }

  // 循環検出: previousAttemptId をたどって selfId に戻らないか
  if (selfId) {
    let cursor: string | null = prev.previousAttemptId;
    for (let i = 0; cursor && i < 100; i++) {
      if (cursor === selfId) {
        throw new ApiError("bad_request", "方法のつながりが循環しています");
      }
      const node: { previousAttemptId: string | null } | null = await prisma.attempt.findUnique({
        where: { id: cursor },
        select: { previousAttemptId: true },
      });
      cursor = node?.previousAttemptId ?? null;
    }
  }
}
