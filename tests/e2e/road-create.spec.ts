import { test, expect } from "@playwright/test";

/**
 * 「自分の道を作る」→「この道を作る」→「自分の道が表示される」を確実に通す
 * (再作成指示書「作成エラー対策」)。
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login?next=/me/roads/new");
  await page.getByLabel("表示名").fill(`E2E ${Date.now()}`);
  await page.getByRole("button", { name: "入る" }).click();
  await page.waitForURL(/\/me\/roads\/new$/);
}

test("必須が空なら送信せず、画面にエラーを出す", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/new$/);
  await expect(page.getByText(/どちらかは書いてください/)).toBeVisible();
});

test("入力欄に最大文字数と残り文字数が出る", async ({ page }) => {
  await login(page);
  await expect(page.getByText("最大 2000 文字").first()).toBeVisible();
  await expect(page.getByText("0 / 2000 文字").first()).toBeVisible();
  await page.getByLabel("何ができなくなりましたか？").fill("あいう");
  await expect(page.getByText("3 / 2000 文字")).toBeVisible();
});

test("長い「できなくなったこと」でも道を作成でき、作った道へ遷移する", async ({ page }) => {
  await login(page);
  // 120 文字を超える自由記述（title を派生させていた頃はここで 400 になっていた）
  const long =
    "指先に力が入りにくく、シャツやブラウスの小さいボタンを自分でとめられない。" +
    "特に急いでいる朝や、寒くて手がかじかんでいるときは、何度やってもボタンが穴を通らず、" +
    "家族に頼むことになってしまうのが申し訳ないし、自分でも情けなく感じてつらい。" +
    "できれば、道具を使ってでもいいので、自分のペースで身支度を整えられるようになりたい。";
  expect(long.length).toBeGreaterThan(120);

  await page.getByLabel("何ができなくなりましたか？").fill(long);
  await page.getByLabel("何ができるようになりたいですか？").fill("朝、自分で着替えを済ませたい");
  await page.getByRole("button", { name: "この道を作る" }).click();

  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
  await expect(page.getByText("まだ記録がありません")).toBeVisible();
  await expect(page.getByText(long).first()).toBeVisible();
});

test("送信ボタンは連打しても道は 1 件しか作られない", async ({ page }) => {
  await login(page);
  const marker = `二重送信テスト ${Date.now()}`;
  await page.getByLabel("何ができなくなりましたか？").fill(marker);

  const btn = page.getByRole("button", { name: /この道を作る|作成しています/ });
  await Promise.all([
    btn.click(),
    btn.click().catch(() => {}),
    btn.click().catch(() => {}),
  ]);
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);

  const res = await page.request.get("/api/v1/roads");
  const { items } = await res.json();
  const mine = items.filter((r: { difficulty: string | null }) => r.difficulty === marker);
  expect(mine).toHaveLength(1);
});
