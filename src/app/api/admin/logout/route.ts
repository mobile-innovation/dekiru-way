import { handle, noContent } from "@/lib/api";
import { clearAdminSessionCookie } from "@/lib/admin/auth";

// POST /api/admin/logout — 管理セッション cookie を破棄。
export const POST = handle(async () => {
  await clearAdminSessionCookie();
  return noContent();
});
