import { z } from "zod";
import { handle, ok, created, parseJson, parseQuery } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { seedCreateSchema } from "@/lib/validation";
import { listSeedData, persistSeedDrafts } from "@/lib/admin/seed-data";

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
export const POST = handle(async (req) => {
  const admin = await requireAdminApi();
  const { keyword, items } = await parseJson(req, seedCreateSchema);
  const saved = await persistSeedDrafts(items, keyword);
  await writeAudit(admin.id, "seed_create", {
    detail: { count: saved.length, keyword: keyword ?? null },
  });
  return created({ items: saved });
});
