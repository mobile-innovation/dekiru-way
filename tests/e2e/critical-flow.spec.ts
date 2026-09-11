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
  await page.getByRole("searchbox", { name: "あなたの困りごと" }).fill("ボタン");
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
  await page.getByLabel("以前は何ができていましたか？").fill("以前は自分で結べていた");
  await page
    .getByLabel("何ができなくなりましたか？")
    .fill("エコバッグの結び目がほどけない");
  await page.getByLabel("何ができるようになりたいですか？").fill("買い物のあと自分で片付けたい");
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
  const roadUrl = page.url();
  const roadId = roadUrl.match(/([0-9a-f-]{36})$/)![1];

  try {
    // 作成直後は Attempt が無い（この画面では道だけ作る）
    await expect(page.getByText("まだ記録がありません")).toBeVisible();

    // --- Attempt: failed ---
    await page.getByRole("link", { name: "試したことを記録" }).click();
    // 新規記録は「経験として公開」が既定 OFF（オプトイン。公開設定の初期値修正指示）
    const publishCheckbox1 = page.getByRole("checkbox", {
      name: /この記録を「経験」として公開する/,
    });
    await expect(publishCheckbox1).not.toBeChecked();
    await publishCheckbox1.check();
    await page.getByLabel("何を試しましたか？").fill("片手で結ぼうとした");
    await page.getByRole("radio", { name: /^うまくいかなかった/ }).click();
    await page.getByRole("button", { name: "記録する" }).click();
    await expect(page).toHaveURL(roadUrl);

    // --- Attempt: success ---
    await page.getByRole("link", { name: "試したことを記録" }).click();
    await expect(
      page.getByRole("checkbox", { name: /この記録を「経験」として公開する/ }),
    ).not.toBeChecked();
    await page.getByRole("checkbox", { name: /この記録を「経験」として公開する/ }).check();
    await page.getByLabel("何を試しましたか？").fill("マグネット式のバッグ留めに替えた");
    await page.getByRole("radio", { name: /^できるようになった/ }).click();
    await page.getByRole("button", { name: "記録する" }).click();
    await expect(page).toHaveURL(roadUrl);

    // --- 自分の道に両方表示され、failed も残っている ---
    await expect(page.getByText("片手で結ぼうとした")).toBeVisible();
    await expect(page.getByText("マグネット式のバッグ留めに替えた")).toBeVisible();
    await expect(page.getByText("うまくいかなかった").first()).toBeVisible();
    await expect(page.getByText("できるようになった").first()).toBeVisible();

    // --- 「自分の道」一覧のカード内にも、検索の道カードと同じく試したことのテキストが出る ---
    await page.goto("/me");
    const card = page.locator("article").filter({ hasText: "エコバッグの結び目がほどけない" });
    await expect(card).toBeVisible();
    await expect(card.getByText("試したこと 2 件")).toBeVisible();
    await expect(card.getByText("片手で結ぼうとした")).toBeVisible();
    await expect(card.getByText("マグネット式のバッグ留めに替えた")).toBeVisible();
    // 各方法の右に公開状態（E2E は AI 審査オフなので公開済み → 公開中）
    await expect(card.getByText("公開中", { exact: true })).toHaveCount(2);

    // 右上「公開表示」→ 検索での詳細（公開経験）へ。公開中の経験があるので押せる。
    const preview = card.getByRole("link", { name: "公開表示" });
    await expect(preview).toBeVisible();
    await preview.click();
    await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
  } finally {
    // 公開トグルを ON にして記録したため、この道の経験が公開一覧に残らないよう削除する。
    await page.request.delete(`/api/v1/roads/${roadId}`);
  }
});
