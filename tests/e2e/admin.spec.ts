import { test, expect } from "@playwright/test";

/**
 * 管理画面（投稿モデレーション）のブラウザ E2E。
 *   - メール + パスワードでログイン（アプリの Google ログインとは別系統）
 *   - 公開済み投稿を「取り下げ」→ 確認待ち → キューから「許可」で再公開
 *   - 公開検索への反映を確認
 *
 * E2E では AI_MODERATION_ENABLED=false なので公開はまず approved になる。
 * ここでは管理者が手動で状態を動かす経路を検証する。
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "dekiru-admin";

test("管理者ログイン → 投稿の取り下げ・再許可が公開検索に反映される", async ({ page }) => {
  const word = `カンリガメン${Date.now()}`;
  const ownerSub = `admin-e2e-owner-${Date.now()}`;

  // --- アプリ利用者として公開投稿を用意 ---
  await page.request.post("/api/test/login", { data: { sub: ownerSub, name: "AdminE2E" } });
  const road = await (
    await page.request.post("/api/v1/roads", {
      data: { difficulty: `${word} で困っている`, goal: "できるように" },
    })
  ).json();
  const attempt = await (
    await page.request.post(`/api/v1/roads/${road.id}/attempts`, {
      data: { method: `${word} を試した`, result: "success", isPublished: true },
    })
  ).json();
  expect(attempt.moderationStatus).toBe("approved");

  await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=method`);
  await expect(page.getByText(`${word} を試した`)).toBeVisible();

  try {
    // --- 未ログインで /admin はログインへ ---
    await page.context().clearCookies();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);

    // --- 管理者ログイン ---
    await page.getByLabel("メールアドレス").fill(ADMIN_EMAIL);
    await page.getByLabel("パスワード").fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: "ログイン" }).click();
    await page.waitForURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "できる道 管理" })).toBeVisible();

    // --- 経験の詳細で「公開を停止」 ---
    page.on("dialog", (d) => d.accept());
    await page.goto(`/admin/posts/${attempt.id}`);
    await expect(page.getByText(`${word} を試した`)).toBeVisible();
    await page.getByRole("button", { name: "公開を停止" }).click();
    await expect(page.getByRole("button", { name: "公開する", exact: true })).toBeVisible();

    // 公開検索から消える
    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=method`);
    await expect(page.getByText(`${word} を試した`)).toHaveCount(0);

    // --- 「経験を確認」キューから「公開する」 ---
    await page.goto("/admin/moderation");
    const row = page.locator("li").filter({ hasText: `${word} を試した` });
    await expect(row).toBeVisible();

    // --- 「保留」に送る → 既定キューから消え、「保留している」で見える → 解除 ---
    await row.getByRole("button", { name: "保留", exact: true }).click();
    await expect(page.locator("li").filter({ hasText: `${word} を試した` })).toHaveCount(0);
    await page.goto("/admin/moderation?held=1");
    const heldRow = page.locator("li").filter({ hasText: `${word} を試した` });
    await expect(heldRow).toBeVisible();
    await heldRow.getByRole("button", { name: "保留を解除", exact: true }).click();
    // 解除が反映されると「保留している」一覧から消える（次の遷移前に待つ）
    await expect(page.locator("li").filter({ hasText: `${word} を試した` })).toHaveCount(0);

    // --- 既定キューに戻ったところで「公開する」 ---
    await expect(async () => {
      await page.goto("/admin/moderation");
      await expect(page.locator("li").filter({ hasText: `${word} を試した` })).toBeVisible();
    }).toPass();
    await page
      .locator("li")
      .filter({ hasText: `${word} を試した` })
      .getByRole("button", { name: "公開する", exact: true })
      .click();

    // 再び公開検索に出る
    await expect(async () => {
      await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=method`);
      await expect(page.getByText(`${word} を試した`)).toBeVisible();
    }).toPass();
  } finally {
    // 後片付け: このスペックが「最新の公開道」を残して他の一覧テストに影響しないよう削除。
    await page.context().clearCookies();
    await page.request.post("/api/test/login", { data: { sub: ownerSub, name: "AdminE2E" } });
    await page.request.delete(`/api/v1/roads/${road.id}`);
  }
});
