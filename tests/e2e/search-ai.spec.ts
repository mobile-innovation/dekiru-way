import { test, expect } from "@playwright/test";

/**
 * AIアシスト検索（検索AI Phase 1）。
 * 「AIで探す」を入れて検索すると ?ai=1 が付き、結果の上に AIアシストパネルが出る。
 * AI キー未設定でも決定的なローカル展開で動き、通常のキーワード検索としても機能する。
 */

test("「AIで探す」で検索すると ai=1 とアシストパネルが出て、やめると外れる", async ({ page }) => {
  await page.goto("/experiences");

  await page.getByRole("searchbox").fill("階段");
  await page.getByRole("checkbox", { name: "AIで探す" }).check();
  await page.getByRole("button", { name: "この条件で探す" }).click();

  await expect(page).toHaveURL(/[?&]ai=1/);
  await expect(page).toHaveURL(/[?&]q=%E9%9A%8E%E6%AE%B5/);

  const panel = page.getByRole("region", { name: "AIアシスト検索" });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("AIは答えを作りません。あなたの言葉を、みんなの経験に結びつけています。"),
  ).toBeVisible();

  // 「AIアシストをやめて検索する」で ai=1 が外れ、パネルも消える
  await panel.getByRole("link", { name: "AIアシストをやめて検索する" }).click();
  await expect(page).not.toHaveURL(/[?&]ai=1/);
  await expect(page).toHaveURL(/[?&]q=%E9%9A%8E%E6%AE%B5/);
  await expect(page.getByRole("region", { name: "AIアシスト検索" })).toHaveCount(0);
});
