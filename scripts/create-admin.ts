/**
 * 管理画面にログインできる運営者を作成 / パスワード再設定する。
 *
 *   tsx scripts/create-admin.ts <email> <password> [表示名]
 *   npm run admin:create -- <email> <password> [表示名]
 *
 * 既存の同じメールがあればパスワード (と表示名) を上書きし、is_active を true に戻す。
 */
try {
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  /* .env が無くても続行 */
}

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/admin/password";

const prisma = new PrismaClient();

async function main() {
  const [email, password, displayName] = process.argv.slice(2);
  if (!email || !password) {
    console.error("usage: tsx scripts/create-admin.ts <email> <password> [表示名]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("パスワードは 8 文字以上にしてください");
    process.exit(1);
  }

  const passwordHash = hashPassword(password);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: { email, passwordHash, displayName: displayName ?? null },
    update: { passwordHash, isActive: true, ...(displayName ? { displayName } : {}) },
  });
  console.log(`admin ready: ${admin.email} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
