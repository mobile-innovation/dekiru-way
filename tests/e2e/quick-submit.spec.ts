import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * SNS からの「試したことを教えてください」簡易登録 (/try)。
 *   - ログイン不要・1 画面・最小入力
 *   - ?problem= で「困っていたこと」を先に埋められる（編集可能）
 *   - 登録すると「確認待ち」で保存され、その場でお礼メッセージに変わる
 *   - 未ログイン投稿なので、承認前は公開検索に出ない
 */

test("SNS から困りごと付きで開き、試したことを登録できる", async ({ page }) => {
  const problem = `ボタンがとめにくい ${Date.now()}`;
  const method = `E2E かぶせるボタンエイドを使った ${Date.now()}`;

  await page.goto(`/try?problem=${encodeURIComponent(problem)}`);

  await expect(
    page.getByRole("heading", { name: "あなたの経験を教えてください" }),
  ).toBeVisible();

  // 「困っていたこと」は URL パラメータで先に入っていて、編集もできる
  const difficulty = page.getByLabel("困っていたこと");
  await expect(difficulty).toHaveValue(problem);

  await page.getByLabel("試したこと").fill(method);
  await page.getByRole("radio", { name: "できるようになった" }).click();

  // 重大なアクセシビリティ違反がない
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
  ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(violations).toEqual([]);

  await page.getByRole("button", { name: "試したことを登録する" }).click();

  // お礼メッセージと次の導線
  await expect(
    page.getByText("あなたの「試したこと」が、誰かの次の一歩につながります"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "できる道のトップへ" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "ほかの人が試した方法を見る" }),
  ).toBeVisible();

  // 承認前なので公開検索には出ない
  await page.goto(`/experiences?q=${encodeURIComponent(method)}&kind=method`);
  await expect(page.getByText(method)).toHaveCount(0);

  // 後片付け: 運営として確認キューに現れることを確かめ、「公開しない」で pending から外す
  // （このスペックが確認待ちを溜め続けて他テストの 1 ページ目を埋めないように）。
  await page.context().clearCookies();
  await page.goto("/admin/login");
  await page.getByLabel("メールアドレス").fill(process.env.ADMIN_EMAIL || "admin@example.com");
  await page.getByLabel("パスワード").fill(process.env.ADMIN_PASSWORD || "dekiru-admin");
  await page.getByRole("button", { name: "ログイン" }).click();
  await page.waitForURL(/\/admin$/);

  page.on("dialog", (d) => d.accept());
  await page.goto("/admin/moderation");
  const row = page.locator("li").filter({ hasText: method });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "公開しない" }).click();
  await expect(row).toHaveCount(0);
});

test("試したことが空だと、具体的な文言でエラーが出る", async ({ page }) => {
  await page.goto("/try");
  await page.getByLabel("困っていたこと").fill("つめが切りにくい");
  await page.getByRole("button", { name: "試したことを登録する" }).click();
  await expect(page.getByText("試したことを入力してください。")).toBeVisible();
});

test("SNS 共有用の OGP / Twitter メタタグが絶対URLで設定されている", async ({ page, baseURL }) => {
  await page.goto("/try");

  const title = "あなたが試したことを教えてください｜できる道";
  await expect(page).toHaveTitle(title);

  const content = async (selector: string) =>
    page.locator(selector).first().getAttribute("content");

  expect(await content('meta[property="og:type"]')).toBe("website");
  expect(await content('meta[property="og:title"]')).toBe(title);
  expect(await content('meta[property="og:description"]')).toContain("うまくいかなかった方法も大切な経験");
  expect(await content('meta[property="og:site_name"]')).toBe("できる道");
  expect(await content('meta[property="og:locale"]')).toBe("ja_JP");
  expect(await content('meta[property="og:url"]')).toBe(`${baseURL}/try`);
  expect(await content('meta[property="og:image"]')).toBe(`${baseURL}/ogp.png`);

  expect(await content('meta[name="twitter:card"]')).toBe("summary_large_image");
  expect(await content('meta[name="twitter:title"]')).toBe(title);
  expect(await content('meta[name="twitter:image"]')).toBe(`${baseURL}/ogp.png`);

  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(`${baseURL}/try`);
  expect(await content('meta[name="description"]')).toContain("あなたが試したことを教えてください");

  // OGP 画像が本番同様に「画像として」200 で返る
  const res = await page.request.get("/ogp.png");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("image/");
});
