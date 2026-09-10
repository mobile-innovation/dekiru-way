import { handle, ok, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { publishSeedData } from "@/lib/admin/seed-data";

// POST /api/admin/seed-data/{roadId}/publish — 仮データを 1 件だけ公開する (指示書 10)。
export const POST = handle(async (_req, ctx) => {
  const admin = await requireAdminApi();
  const { roadId } = await ctx.params;
  assertUuid(roadId, "仮データ");
  const updated = await publishSeedData(roadId);
  await writeAudit(admin.id, "seed_publish", { detail: { roadId } });
  return ok(updated);
});
