import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * アクセシビリティ (指示書 9): 主要画面で重大な違反がないこと。
 * WCAG 2.1 A/AA の serious/critical のみを対象にする。
 */

async function scan(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test("トップ", async ({ page }) => {
  await page.goto("/");
  expect(await scan(page)).toEqual([]);
});

test("経験を探す", async ({ page }) => {
  await page.goto("/experiences?q=つめ");
  await expect(page.getByRole("heading", { name: /誰かが試した道/ })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("経験詳細", async ({ page, request }) => {
  const res = await request.get("/api/v1/experiences?limit=1");
  const { items } = await res.json();
  await page.goto(`/experiences/${items[0].id}`);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("ログイン", async ({ page }) => {
  await page.goto("/login");
  expect(await scan(page)).toEqual([]);
});

test("利用について", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "利用について", level: 1 })).toBeVisible();
  expect(await scan(page)).toEqual([]);
});

test("自分の道を作る (ログイン後)", async ({ page }) => {
  await page.goto("/login?next=/me/roads/new");
  await page.getByLabel("表示名").fill("A11y ユーザー");
  await page.getByRole("button", { name: "入る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/new$/);
  expect(await scan(page)).toEqual([]);
});
