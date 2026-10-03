import { describe, it, expect } from "vitest";
import { loginNextFor, safeNextPath } from "@/lib/login-next";

/**
 * 未ログインで /me/* を開いたとき、ログイン後に元の画面へ戻す (2026-10-03)。
 * オープンリダイレクトを防ぐため、/me 以外は next に入れない。
 */

describe("loginNextFor (/me layout の戻り先)", () => {
  it("/me 配下のパスはそのまま next に入れる (エンコード済み)", () => {
    expect(loginNextFor("/me/roads/new")).toBe("/login?next=%2Fme%2Froads%2Fnew");
    expect(loginNextFor("/me")).toBe("/login?next=%2Fme");
    expect(loginNextFor("/me/roads/new?x=1")).toBe("/login?next=%2Fme%2Froads%2Fnew%3Fx%3D1");
  });

  it("無い・外部 URL・プロトコル相対・/me 以外は /login?next=/me", () => {
    for (const p of [
      null,
      undefined,
      "",
      "https://evil.example",
      "//evil",
      "//evil/me",
      "/\\evil",
      "/experiences",
      "/meeting",
      "me/roads",
    ]) {
      expect(loginNextFor(p)).toBe("/login?next=/me");
    }
  });
});

describe("safeNextPath (ログイン画面の callbackUrl)", () => {
  it("サイト内パスはそのまま使う", () => {
    expect(safeNextPath("/me/roads/new")).toBe("/me/roads/new");
    expect(safeNextPath("/experiences?q=a")).toBe("/experiences?q=a");
  });

  it("無い・外部・// で始まるものは /me", () => {
    for (const p of [null, "", "https://evil.example", "//evil", "/\\evil", "evil"]) {
      expect(safeNextPath(p)).toBe("/me");
    }
  });
});
