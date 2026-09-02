import { test, expect } from "@playwright/test";

test("未ログインで /me は /login に誘導される", async ({ page }) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/login/);
});

test("未ログインでも公開経験の検索・閲覧はできる (指示書 10)", async ({ page }) => {
  await page.goto("/experiences");
  await expect(page.getByRole("heading", { name: "経験を探す" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /いろいろな道/ })).toBeVisible();
  // シードには公開 failed が含まれる
  await page.goto("/experiences?result=failed");
  await expect(page.locator("article").first()).toBeVisible();
});

test("非公開の記録は検索結果に出ない", async ({ page, request }) => {
  // シードの「階段」道には isPublished=false の failed 記録がある
  const res = await request.get(
    "/api/v1/experiences?q=" + encodeURIComponent("手すりのない側から上ろうとした") + "&limit=50",
  );
  const body = await res.json();
  expect(body.items).toHaveLength(0);
});
