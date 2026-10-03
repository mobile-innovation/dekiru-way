import { test, expect } from "@playwright/test";

/**
 * 簡易登録 /try へのサイト内導線と、ログイン後の戻り先 (2026-10-03)。
 */

test("検索 0 件画面のボタンで、検索語が入った /try に行ける", async ({ page }) => {
  const word = `存在しないことば${Date.now()}`;
  await page.goto(`/experiences?q=${encodeURIComponent(word)}`);
  await page.getByRole("link", { name: "この困りごとで試したことを教える（ログイン不要）" }).click();
  await page.waitForURL(/\/try\?problem=/);
  await expect(page.getByLabel("困っていたこと")).toHaveValue(word);
});

test("ヘッダーの「経験を教える」で /try に行ける（スマホ幅でも横スクロールが出ない）", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await page
    .getByRole("navigation", { name: "メインナビゲーション" })
    .getByRole("link", { name: "経験を教える" })
    .click();
  await page.waitForURL(/\/try$/);
});

test("ログイン画面から、ログインせずに /try へ切り替えられる", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "ログインせずに経験を教える" }).click();
  await page.waitForURL(/\/try$/);
});

test("未ログインで /me/roads/new を開くと、ログイン後に作成画面へ戻る", async ({ page }) => {
  await page.goto("/me/roads/new");
  await page.waitForURL(/\/login\?next=%2Fme%2Froads%2Fnew$/);
  await page.getByLabel("表示名").fill(`E2E ${Date.now()}`);
  await page.getByRole("button", { name: "入る" }).click();
  await page.waitForURL(/\/me\/roads\/new$/);
});
