import { test, expect } from "@playwright/test";

/**
 * 「道を編集」画面の編集可否修正指示:
 *   - 「できなくなったこと」の「一度設定したため、変更できません。」制限を廃止し、
 *     通常の必須テキスト欄として編集できるようにする。
 *   - 空にして保存しようとするとエラーになる（サーバーへ送られない）。
 *   - 変更後は再表示でも新しい内容が見える。
 *   - 「以前できていたこと」は任意のまま。
 */

async function loginAndCreateRoad(page: import("@playwright/test").Page, difficulty: string) {
  const sub = `road-edit-e2e-${Date.now()}`;
  await page.request.post("/api/test/login", { data: { sub, name: "RoadEdit" } });
  const res = await page.request.post("/api/v1/roads", {
    data: { difficulty, goal: "編集テスト用の目標" },
  });
  const road = await res.json();
  return road.id as string;
}

test("「できなくなったこと」に変更不可の表示が出ず、通常の入力欄として編集できる", async ({
  page,
}) => {
  const original = `編集前 ${Date.now()}`;
  const roadId = await loginAndCreateRoad(page, original);

  await page.goto(`/me/roads/${roadId}/edit`);
  await expect(page.getByText("一度設定したため、変更できません")).toHaveCount(0);

  const field = page.getByLabel("できなくなったこと");
  await expect(field).toBeEditable();
  await expect(field).toHaveValue(original);

  const updated = `編集後 ${Date.now()}`;
  await field.fill(updated);
  await page.getByRole("button", { name: "変更を保存" }).click();

  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}$`));
  // 見出し（h1）と本文の両方に出るため、いずれかが見えることだけ確認する
  await expect(page.getByText(updated).first()).toBeVisible();

  // 再度編集画面を開いても、変更後の内容が表示される
  await page.goto(`/me/roads/${roadId}/edit`);
  await expect(page.getByLabel("できなくなったこと")).toHaveValue(updated);
});

test("「できなくなったこと」を空にして保存しようとするとエラーになり、遷移しない", async ({
  page,
}) => {
  const original = `空にできないテスト ${Date.now()}`;
  const roadId = await loginAndCreateRoad(page, original);

  await page.goto(`/me/roads/${roadId}/edit`);
  await page.getByLabel("できなくなったこと").fill("");
  await page.getByRole("button", { name: "変更を保存" }).click();

  // 画面にとどまり、エラーが表示される
  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}/edit$`));
  await expect(page.getByText(/できなくなったこと」を書いてください/)).toBeVisible();

  // DB 上の値も変わっていない
  const res = await page.request.get(`/api/v1/roads/${roadId}`);
  const dto = await res.json();
  expect(dto.difficulty).toBe(original);
});

test("「以前できていたこと」は空のままでも保存できる", async ({ page }) => {
  const roadId = await loginAndCreateRoad(page, `任意項目テスト ${Date.now()}`);

  await page.goto(`/me/roads/${roadId}/edit`);
  await expect(page.getByLabel("以前できていたこと")).toHaveValue("");
  await page.getByRole("button", { name: "変更を保存" }).click();

  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}$`));
});
