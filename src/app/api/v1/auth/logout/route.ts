import { signOut } from "@/auth";
import { handle, noContent } from "@/lib/api";

// POST /api/v1/auth/logout — セッション Cookie を破棄する。
export const POST = handle(async () => {
  await signOut({ redirect: false });
  return noContent();
});
