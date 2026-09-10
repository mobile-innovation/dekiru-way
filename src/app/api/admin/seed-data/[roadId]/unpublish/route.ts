import { handle, ok, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { unpublishSeedData } from "@/lib/admin/seed-data";

// POST /api/admin/seed-data/{roadId}/unpublish — 公開済みの仮データを 1 件だけ非公開に戻す (指示書 11)。
export const POST = handle(async (_req, ctx) => {
  const admin = await requireAdminApi();
  const { roadId } = await ctx.params;
  assertUuid(roadId, "仮データ");
  const updated = await unpublishSeedData(roadId);
  await writeAudit(admin.id, "seed_unpublish", { detail: { roadId } });
  return ok(updated);
});
