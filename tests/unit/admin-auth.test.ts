import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/admin/password";
import {
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "@/lib/admin/session-token";

describe("admin password", () => {
  it("ハッシュ → 検証がラウンドトリップする", () => {
    const stored = hashPassword("Sup3r-Secret!");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Sup3r-Secret!", stored)).toBe(true);
  });

  it("違うパスワードは弾く", () => {
    const stored = hashPassword("correct horse");
    expect(verifyPassword("wrong horse", stored)).toBe(false);
  });

  it("毎回ソルトが変わるので同じ平文でもハッシュは異なる", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("壊れた形式は false", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$onlytwo")).toBe(false);
  });
});

describe("admin session token", () => {
  const admin = { id: "11111111-1111-1111-1111-111111111111", email: "a@example.com" };

  it("署名 → 検証で payload が戻る", () => {
    const token = createAdminSessionToken(admin);
    const payload = verifyAdminSessionToken(token);
    expect(payload?.sub).toBe(admin.id);
    expect(payload?.email).toBe(admin.email);
  });

  it("署名を改ざんすると null", () => {
    const token = createAdminSessionToken(admin);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyAdminSessionToken(tampered)).toBeNull();
  });

  it("本文を差し替えると署名が合わず null", () => {
    const token = createAdminSessionToken(admin);
    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "evil", email: "e", exp: 9999999999 }),
    ).toString("base64url");
    expect(verifyAdminSessionToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("ゴミ文字列は null", () => {
    expect(verifyAdminSessionToken("garbage")).toBeNull();
    expect(verifyAdminSessionToken("")).toBeNull();
  });

  it("期限切れトークン (正しい署名) は null", () => {
    const secret = process.env.AUTH_SECRET as string;
    const body = Buffer.from(
      JSON.stringify({ sub: admin.id, email: admin.email, exp: Math.floor(Date.now() / 1000) - 10 }),
    ).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    expect(verifyAdminSessionToken(`${body}.${sig}`)).toBeNull();
  });

  it("AUTH_SECRET 未設定時、検証は例外を投げず null (fail closed)", () => {
    const token = createAdminSessionToken(admin);
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      expect(() => verifyAdminSessionToken(token)).not.toThrow();
      expect(verifyAdminSessionToken(token)).toBeNull();
    } finally {
      if (saved !== undefined) process.env.AUTH_SECRET = saved;
    }
  });

  it("AUTH_SECRET 未設定時、発行 (createAdminSessionToken) は例外を投げる", () => {
    const saved = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      expect(() => createAdminSessionToken(admin)).toThrow();
    } finally {
      if (saved !== undefined) process.env.AUTH_SECRET = saved;
    }
  });
});
