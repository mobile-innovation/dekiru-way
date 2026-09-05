import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * 管理者パスワードのハッシュ。Node 標準の scrypt のみ (新規依存なし)。
 * 形式: `scrypt$<saltBase64url>$<hashBase64url>`
 *
 * next/headers 等を import しないリーフモジュール。seed / CLI スクリプトからも安全に使える。
 */

const KEYLEN = 64;

/** `scrypt$<salt>$<hash>` を返す。 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[1], "base64url");
    const expected = Buffer.from(parts[2], "base64url");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
