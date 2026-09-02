import { test, expect } from "@playwright/test";

/**
 * 指示書 18「重要なシナリオ」:
 *   未ログイン → 公開経験検索 → 経験詳細 → ログイン → Road作成
 *   → Attempt(failed) → Attempt(success) → 自分の道に両方表示
 * failed が正常な経験として保存されることを必ず確認する。
 */

test("困りごと入力 → 誰かの経験 → 自分の道に failed と success を残す", async ({ page }) => {
  // --- 未ログインでトップから検索 ---
  await page.goto("/");
  await page.getByRole("searchbox", { name: "何ができなくて困っていますか？" }).fill("ボタン");
  await page.getByRole("button", { name: "似た経験を探す" }).click();

  await expect(page).toHaveURL(/\/experiences\?q=/);
  const firstCard = page.locator("article").filter({ hasText: "試したこと" }).first();
  await expect(firstCard).toBeVisible();

  // --- 経験詳細へ ---
  await firstCard.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();

  // --- モックログイン (そのまま道作成へ) ---
  await page.goto("/login?next=/me/roads/new");
  await page.getByLabel("表示名").fill(`E2E ${Date.now()}`);
  await page.getByRole("button", { name: "入る" }).click();
  await page.waitForURL(/\/me\/roads\/new$/);

  // --- 道を作る (1 画面のフォーム) ---
  await page
    .getByLabel("何ができなくなりましたか？")
    .fill("エコバッグの結び目がほどけない");
  await page.getByLabel("何ができるようになりたいですか？").fill("買い物のあと自分で片付けたい");
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
  const roadUrl = page.url();

  // 作成直後は Attempt が無い（この画面では道だけ作る）
  await expect(page.getByText("まだ記録がありません。")).toBeVisible();

  // --- Attempt: failed ---
  await page.getByRole("link", { name: "試したことを記録" }).click();
  await page.getByLabel("何を試しましたか？").fill("片手で結ぼうとした");
  await page.getByRole("radio", { name: /^うまくいかなかった/ }).click();
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(page).toHaveURL(roadUrl);

  // --- Attempt: success ---
  await page.getByRole("link", { name: "試したことを記録" }).click();
  await page.getByLabel("何を試しましたか？").fill("マグネット式のバッグ留めに替えた");
  await page.getByRole("radio", { name: /^できるようになった/ }).click();
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(page).toHaveURL(roadUrl);

  // --- 自分の道に両方表示され、failed も残っている ---
  await expect(page.getByText("片手で結ぼうとした")).toBeVisible();
  await expect(page.getByText("マグネット式のバッグ留めに替えた")).toBeVisible();
  await expect(page.getByText("うまくいかなかった").first()).toBeVisible();
  await expect(page.getByText("できるようになった").first()).toBeVisible();
});
