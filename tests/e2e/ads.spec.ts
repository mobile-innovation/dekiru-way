import { test, expect, type Page } from "@playwright/test";

/**
 * 広告表示（広告表示方針 v1）。E2E は ADS_ENABLED=true（プレースホルダ表示）で動く。
 *   - 広告は「検索一覧」と「道詳細」の 2 画面だけ
 *   - トップ・自分の道・各フォーム・ログイン・アカウント画面には出さない
 *   - 検索結果は最初の 2 件のあとに広告 1 枠。経験カード（article）とは別物
 */

const adLoc = (page: Page) => page.locator('[aria-label="広告"]');

test("検索一覧: 最初の2件のあとに広告が1枠だけ出る（経験カードとは別物）", async ({ page }) => {
  await page.goto("/experiences");
  await expect(page.getByRole("heading", { name: /いろいろな道/ })).toBeVisible();

  // 道カードが 3 件以上ある前提（シードに十分ある）
  const cards = page.locator('section[aria-labelledby="results-heading"] article');
  expect(await cards.count()).toBeGreaterThanOrEqual(3);

  // 広告はちょうど 1 枠
  const ad = adLoc(page);
  await expect(ad).toHaveCount(1);
  await expect(ad).toBeVisible();
  await expect(ad).toContainText("広告");

  // AdSense クライアント未設定なので実配信タグ（ins.adsbygoogle）は読み込まない
  await expect(ad.locator("ins.adsbygoogle")).toHaveCount(0);

  // 経験カード（article）ではない
  expect(await ad.evaluate((el) => el.tagName.toLowerCase())).not.toBe("article");

  // 道結果リストの 3 番目の要素が広告（＝最初の 2 件のあと）
  const items = page.locator('section[aria-labelledby="results-heading"] > ul > li');
  await expect(items.nth(2).locator('[aria-label="広告"]')).toHaveCount(1);
  // 1・2 番目は経験カード
  await expect(items.nth(0).locator("article")).toHaveCount(1);
  await expect(items.nth(1).locator("article")).toHaveCount(1);
});

test("道詳細: 内容のあとに広告が1枠出る", async ({ page, request }) => {
  const res = await request.get("/api/v1/experiences?limit=1");
  const { items } = await res.json();
  await page.goto(`/experiences/${items[0].id}`);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();

  const ad = adLoc(page);
  await expect(ad).toHaveCount(1);
  await expect(ad).toContainText("広告");
});

test("広告を出さない画面には広告が無い", async ({ page }) => {
  await page.context().clearCookies();
  await page.request.post("/api/test/login", { data: { sub: "ads-e2e", name: "ads-e2e" } });

  for (const path of ["/", "/login", "/me", "/me/roads/new", "/me/account"]) {
    await page.goto(path);
    await expect(adLoc(page)).toHaveCount(0);
  }
});
