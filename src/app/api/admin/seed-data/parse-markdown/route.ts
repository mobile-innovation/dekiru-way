import { handle, ok, parseJson } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { seedMarkdownParseSchema } from "@/lib/validation";
import { parseSeedMarkdown } from "@/lib/admin/seed-markdown";

/**
 * POST /api/admin/seed-data/parse-markdown — Markdown を構文解析するだけ（AI は呼ばない）。
 * DB へは保存しない (指示書 §9「解析しただけでDBへ保存しない」／§13「解析と保存を1回のAPIで
 * 同時に行わない」)。解析結果は常に 200 で返し、`errors` があれば呼び出し側（管理画面）が
 * 確認・編集画面へ進ませず、エラー内容を表示する。
 */
export const POST = handle(async (req) => {
  await requireAdminApi();
  const { markdown } = await parseJson(req, seedMarkdownParseSchema);
  const result = parseSeedMarkdown(markdown);
  return ok(result);
});
