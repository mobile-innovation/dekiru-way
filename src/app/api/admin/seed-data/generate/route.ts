import { handle, ok, parseJson } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { enforceRateLimit, RATE_PRESETS } from "@/lib/ratelimit";
import { seedGenerateSchema } from "@/lib/validation";
import { generateSeedDrafts } from "@/lib/ai/seed-data";
import { listSeedDataForTheme } from "@/lib/admin/seed-data";

/**
 * POST /api/admin/seed-data/generate — キーワードから仮データ候補を生成する。
 * ここでは DB に保存しない (指示書 3-1 / 8)。管理者が確認・編集してから
 * POST /api/admin/seed-data で「非公開」保存する。
 *
 * 同じテーマで過去に生成した仮データを渡し、実質的に重複しない別の切り口を返す
 * (「毎回結果を変える」指示書)。
 */
export const POST = handle(async (req) => {
  const admin = await requireAdminApi();
  enforceRateLimit({ key: `admin:seed:generate:${admin.id}`, ...RATE_PRESETS.ai });
  const { keyword, count, exclude } = await parseJson(req, seedGenerateSchema);

  // 保存済みの同テーマ仮データ ＋ 今回の再生成で「表示中／既に出した」候補を、
  // どちらも重複回避の対象にする。キーワードは変えず、押すたび別の候補が出るようにする。
  const saved = await listSeedDataForTheme(keyword);
  const existing = [
    ...saved,
    ...(exclude ?? []).map((e) => ({
      difficulty: e.difficulty ?? null,
      method: e.method ?? "",
      result: e.result ?? null,
    })),
  ];

  const drafts = await generateSeedDrafts(keyword, count, { existing });
  return ok({ drafts, count: drafts.length, priorCount: saved.length });
});
