import { handle, ok, noContent, parseJson, ApiError, assertUuid } from "@/lib/api";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { seedUpdateSchema } from "@/lib/validation";
import { deleteSeedData, getSeedData, updateSeedData } from "@/lib/admin/seed-data";

// GET /api/admin/seed-data/{roadId} — 仮データ 1 件。
export const GET = handle(async (_req, ctx) => {
  await requireAdminApi();
  const { roadId } = await ctx.params;
  assertUuid(roadId, "仮データ");
  const data = await getSeedData(roadId);
  if (!data) throw new ApiError("not_found", "仮データが見つかりません");
  return ok(data);
});

// PATCH /api/admin/seed-data/{roadId} — 仮データ 1 件を編集 (指示書 4 / 8)。
export const PATCH = handle(async (req, ctx) => {
  const admin = await requireAdminApi();
  const { roadId } = await ctx.params;
  assertUuid(roadId, "仮データ");
  const input = await parseJson(req, seedUpdateSchema);
  const updated = await updateSeedData(roadId, input);
  await writeAudit(admin.id, "seed_edit", { detail: { roadId } });
  return ok(updated);
});

// DELETE /api/admin/seed-data/{roadId} — 仮データ 1 件を削除 (指示書 12)。
// 対象が仮データでなければ updateSeedData/deleteSeedData 側で not_found。実ユーザーデータは消せない。
export const DELETE = handle(async (_req, ctx) => {
  const admin = await requireAdminApi();
  const { roadId } = await ctx.params;
  assertUuid(roadId, "仮データ");
  await deleteSeedData(roadId);
  await writeAudit(admin.id, "seed_delete", { detail: { roadId } });
  return noContent();
});
