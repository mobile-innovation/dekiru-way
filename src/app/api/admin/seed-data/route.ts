import { z } from "zod";
import { handle, ok, created, parseJson, parseQuery } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { seedCreateSchema, type SeedDraftInput, type SeedRoadWithAttemptsInput } from "@/lib/validation";
import { listSeedData, persistSeedRoads } from "@/lib/admin/seed-data";

/** 既存の 1 Road=1 Attempt 形式 (AI 生成) を、Road+複数 Attempt の形式へそろえる。 */
function flatDraftToRoad(d: SeedDraftInput): SeedRoadWithAttemptsInput {
  const { method, result, triedAt, attemptMemo, ...roadFields } = d;
  return { ...roadFields, attempts: [{ method, result, triedAt, attemptMemo }] };
}

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  // 表示する仮データ: "private"（既定）/ "published" / "all"。
  state: z.enum(["private", "published", "all"]).default("private"),
});

// GET /api/admin/seed-data — 仮データ一覧 (指示書 4-1)。既定は非公開ぶんのみ。
export const GET = handle(async (req) => {
  await requireAdminApi();
  const { page, state } = parseQuery(req.url, listQuerySchema);
  const published = state === "all" ? undefined : state === "published";
  return ok(await listSeedData({ page, published }));
});

// POST /api/admin/seed-data — 生成した仮データを「すべて非公開」で保存する (指示書 9)。
// `items` は AI 生成 (1 Road=1 Attempt)、`roads` は Markdown取り込み (1 Road=複数 Attempt)。
// どちらも同じ保存処理 (`persistSeedRoads`) を通す（管理画面更新指示書 §13「既存の保存処理を再利用」）。
export const POST = handle(async (req) => {
  const admin = await requireAdminApi();
  const { keyword, items, roads } = await parseJson(req, seedCreateSchema);
  const allRoads: SeedRoadWithAttemptsInput[] = [
    ...(items ?? []).map(flatDraftToRoad),
    ...(roads ?? []),
  ];
  const saved = await persistSeedRoads(allRoads, keyword);
  await writeAudit(admin.id, "seed_create", {
    detail: { count: saved.length, keyword: keyword ?? null },
  });
  return created({ items: saved });
});
