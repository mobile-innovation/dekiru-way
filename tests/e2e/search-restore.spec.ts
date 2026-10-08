import { test, expect } from "@playwright/test";

/**
 * 検索状態の復元。
 * 検索条件は URL クエリに乗っており、他ページから素の /experiences に戻ってくると失われる。
 * RestoreSearch がセッション内で前回の検索を覚えて復元する。「条件をクリア」で忘れる。
 */

test("経験詳細 → ヘッダーの「経験を探す」で戻ると前回の検索条件が復元される", async ({ page }) => {
  // 1. 条件を付けて検索
  await page.goto("/experiences?q=" + encodeURIComponent("階段") + "&kind=both");
  await expect(page.getByRole("searchbox")).toHaveValue("階段");
  const card = page.locator("article").first();
  await expect(card).toBeVisible();

  // 2. 経験詳細へ
  await card.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}/);
  const detailUrl = page.url();

  // 3. ヘッダーの「経験を探す」で素の /experiences へ戻る
  await page.getByRole("link", { name: "経験を探す", exact: true }).click();

  // 4. 前回の検索が復元される（URL もフォームも）
  await expect(page).toHaveURL(/[?&]q=%E9%9A%8E%E6%AE%B5/);
  await expect(page).toHaveURL(/[?&]kind=both/);
  await expect(page.getByRole("searchbox")).toHaveValue("階段");

  // 5. 「条件をクリア」すると忘れ、戻ってきても復元しない
  await page.getByRole("button", { name: "条件をクリア" }).click();
  await expect(page).toHaveURL(/\/experiences$/);

  // 検索前の画面には一覧を出さない（検索欄だけ）。詳細へは直接移動して戻りを確かめる。
  await expect(page.locator("article")).toHaveCount(0);
  await page.goto(detailUrl);
  await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}/);
  await page.getByRole("link", { name: "経験を探す", exact: true }).click();
  await expect(page).toHaveURL(/\/experiences$/);
  await expect(page.getByRole("searchbox")).toHaveValue("");
});

test("素の /experiences を直接開いたときは復元しない（セッションに記録が無い）", async ({ page }) => {
  await page.goto("/experiences");
  await expect(page).toHaveURL(/\/experiences$/);
  await expect(page.getByRole("searchbox")).toHaveValue("");
});

test("記憶が古い（60分超）ときは復元せず掃除する", async ({ page }) => {
  await page.goto("/experiences?q=" + encodeURIComponent("階段"));
  await expect(page.getByRole("searchbox")).toHaveValue("階段");

  // 記憶の時刻を 2 時間前に書き換える（＝期限切れ）
  await page.evaluate(() => {
    const raw = sessionStorage.getItem("experiences:lastSearch");
    const parsed = raw ? JSON.parse(raw) : { s: "q=%E9%9A%8E%E6%AE%B5" };
    parsed.t = Date.now() - 2 * 60 * 60 * 1000;
    sessionStorage.setItem("experiences:lastSearch", JSON.stringify(parsed));
  });

  await page.goto("/experiences"); // 素のページ
  await expect(page).toHaveURL(/\/experiences$/);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  // 期限切れの記憶は掃除される
  const left = await page.evaluate(() => sessionStorage.getItem("experiences:lastSearch"));
  expect(left).toBeNull();
});

test("検索条件はページを再読み込みしても消えない", async ({ page }) => {
  await page.goto("/experiences?q=" + encodeURIComponent("階段") + "&kind=both&sort=helpful");
  await expect(page.getByRole("searchbox")).toHaveValue("階段");

  await page.reload();
  await expect(page).toHaveURL(/[?&]q=%E9%9A%8E%E6%AE%B5/);
  await expect(page).toHaveURL(/[?&]kind=both/);
  await expect(page).toHaveURL(/[?&]sort=helpful/);
  await expect(page.getByRole("searchbox")).toHaveValue("階段");

  // さらにもう一度リロードしても保持される
  await page.reload();
  await expect(page).toHaveURL(/[?&]q=%E9%9A%8E%E6%AE%B5/);
  await expect(page.getByRole("searchbox")).toHaveValue("階段");
});
