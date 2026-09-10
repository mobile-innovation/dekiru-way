import { z } from "zod";
import { handle, ok, created, parseJson, parseQuery } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { seedCreateSchema } from "@/lib/validation";
import { listSeedData, persistSeedDrafts } from "@/lib/admin/seed-data";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

// GET /api/admin/seed-data — 仮データ一覧 (指示書 4-1)。
export const GET = handle(async (req) => {
  await requireAdminApi();
  const { page } = parseQuery(req.url, listQuerySchema);
  return ok(await listSeedData({ page }));
});

// POST /api/admin/seed-data — 生成した仮データを「すべて非公開」で保存する (指示書 9)。
export const POST = handle(async (req) => {
  const admin = await requireAdminApi();
  const { keyword, items } = await parseJson(req, seedCreateSchema);
  const saved = await persistSeedDrafts(items, keyword);
  await writeAudit(admin.id, "seed_create", {
    detail: { count: saved.length, keyword: keyword ?? null },
  });
  return created({ items: saved });
});
