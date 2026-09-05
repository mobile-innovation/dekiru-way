import { prisma } from "@/lib/db";
import { handle, ok, parseJson, ApiError } from "@/lib/api";
import { enforceRateLimit, clientKey } from "@/lib/ratelimit";
import { verifyPassword, setAdminSessionCookie } from "@/lib/admin/auth";
import { writeAudit } from "@/lib/admin/audit";
import { adminLoginSchema } from "@/lib/admin/validation";

// POST /api/admin/login — 管理者ログイン (メール + パスワード)。
export const POST = handle(async (req) => {
  enforceRateLimit({ key: `admin:login:${clientKey(req)}`, limit: 10, windowMs: 60_000 });
  const { email, password } = await parseJson(req, adminLoginSchema);

  const admin = await prisma.adminUser.findUnique({ where: { email } });
  const fail = () => new ApiError("unauthorized", "メールアドレスまたはパスワードが違います");

  // ユーザーの有無で分岐せず、常にハッシュ検証を通す (存在判定の情報漏れ・タイミング差を抑える)。
  const DUMMY = "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const okPw = verifyPassword(password, admin?.passwordHash ?? DUMMY);
  if (!admin || !admin.isActive || !okPw) {
    throw fail();
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  await setAdminSessionCookie(admin);
  await writeAudit(admin.id, "login");

  return ok({ id: admin.id, email: admin.email, displayName: admin.displayName });
});
