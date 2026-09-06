import { handle, created, parseJson } from "@/lib/api";
import { enforceRateLimit, clientKey } from "@/lib/ratelimit";
import { quickExperienceSchema } from "@/lib/validation";
import { createQuickSubmission } from "@/lib/quick-submit";

/**
 * POST /api/v1/quick-experiences
 *
 * SNS からの「試したことを教えてください」簡易登録 (/try) の受け口。
 *   - ログイン不要。氏名・連絡先などの個人情報は受け取らない。
 *   - 入力は困っていたこと / 試したこと / 結果 の 3 つだけ (quickExperienceSchema で検証・無害化)。
 *   - 未ログインなので、通常の書き込み (60/分) より厳しめのレート制限をかける。
 *   - 保存結果は必ず「確認待ち」。ここでは公開しない (createQuickSubmission 参照)。
 */
export const POST = handle(async (req) => {
  enforceRateLimit({ key: `quick:submit:${clientKey(req)}`, limit: 6, windowMs: 60_000 });

  const input = await parseJson(req, quickExperienceSchema);
  await createQuickSubmission(input);

  // 内部 ID は返さない。フォーム側は成功したことだけ分かれば良い。
  return created({ ok: true });
});
