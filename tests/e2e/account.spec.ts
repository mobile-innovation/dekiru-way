import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * アカウント設定・アカウント削除（アカウント設定指示書）。
 *   - ヘッダー右上はユーザーメニュー（アカウント設定 / ログアウト）。削除はメニューに置かない
 *   - アカウント設定: 自分の道 / 試したこと / 公開した経験 の件数を表示
 *   - アカウント削除: 確認パネル → 実行 → トップへ（ログアウト状態）。公開経験も検索から消える
 */

async function loginAs(page: Page, name: string) {
  await page.context().clearCookies();
  const res = await page.request.post("/api/test/login", { data: { sub: name, name } });
  expect(res.ok()).toBeTruthy();
}

test("ユーザーメニュー → アカウント設定で件数を確認 → アカウント削除でデータごと消える", async ({
  page,
}) => {
  const name = `acct-e2e-${Date.now()}`;
  const word = `アカウント${Date.now()}`;

  await loginAs(page, name);
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

  // --- ヘッダーのユーザーメニュー ---
  await page.goto("/");
  await page.getByRole("button", { name: "アカウントのメニュー" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "アカウント設定" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "ログアウト" })).toBeVisible();
  // 「アカウントを削除」はメニューに直接置かない
  await expect(menu.getByText("アカウントを削除", { exact: false })).toHaveCount(0);

  // --- アカウント設定画面 ---
  await menu.getByRole("menuitem", { name: "アカウント設定" }).click();
  await expect(page).toHaveURL(/\/me\/account$/);
  await expect(page.getByRole("heading", { name: "アカウント設定" })).toBeVisible();

  const dataCard = page.locator("section").filter({ hasText: "あなたのデータ" });
  await expect(dataCard.getByText("自分の道")).toBeVisible();
  await expect(dataCard.getByText("試したこと")).toBeVisible();
  await expect(dataCard.getByText("公開した経験")).toBeVisible();
  await expect(dataCard.getByText("1 件")).toHaveCount(3); // 道 1 / 試したこと 1 / 公開 1

  // プロフィール編集項目は無い
  await expect(page.getByLabel("名前")).toHaveCount(0);
  await expect(page.getByLabel("メールアドレス")).toHaveCount(0);

  // 重大なアクセシビリティ違反がない
  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
  ).violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(violations).toEqual([]);

  // --- 削除は確認パネルを挟む ---
  await page.getByRole("button", { name: "アカウントを削除" }).click();
  await expect(page.getByText("アカウントを削除しますか？")).toBeVisible();
  await expect(page.getByText("この操作は取り消せません。")).toBeVisible();

  // キャンセルで閉じる
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByText("アカウントを削除しますか？")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "アカウントを削除" })).toBeVisible();

  // --- 実行 → トップへ、ログアウト状態 ---
  await page.getByRole("button", { name: "アカウントを削除" }).click();
  await page.getByRole("button", { name: "アカウントを削除する" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "ログイン" })).toBeVisible();
  await expect(page.getByRole("button", { name: "アカウントのメニュー" })).toHaveCount(0);

  // 公開していた経験は検索に残らない
  await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
  await expect(page.getByText(`${word} を試した`)).toHaveCount(0);

  // 再訪しても /me はログインへ
  await page.goto("/me/account");
  await expect(page).toHaveURL(/\/login/);
});
