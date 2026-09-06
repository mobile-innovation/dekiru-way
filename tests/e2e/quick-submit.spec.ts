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
    page.getByRole("heading", { name: "あなたが試したことを教えてください" }),
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
});

test("試したことが空だと、具体的な文言でエラーが出る", async ({ page }) => {
  await page.goto("/try");
  await page.getByLabel("困っていたこと").fill("つめが切りにくい");
  await page.getByRole("button", { name: "試したことを登録する" }).click();
  await expect(page.getByText("試したことを入力してください。")).toBeVisible();
});
