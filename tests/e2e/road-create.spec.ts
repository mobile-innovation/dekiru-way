import { test, expect } from "@playwright/test";

/**
 * 「自分の道を作る」→「この道を作る」→「自分の道が表示される」を確実に通す
 * (再作成指示書「作成エラー対策」／登録画面・登録項目 更新指示書／
 * Road登録・編集画面 必須項目修正指示)。
 *
 * 必須は difficulty（できなくなったこと）／goal（できるようになりたいこと）の 2 つだけ。
 * previouslyAble（以前できていたこと）は任意で、未入力でも作成できる。
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
  // 先頭の必須項目（できなくなったこと）から埋まっていない旨が出る
  // (バナーとフィールド直下の両方に同文言が出るため、先頭の一致だけ確認する)
  await expect(page.getByText(/できなくなったこと」を書いてください/).first()).toBeVisible();
});

test("2 番目の必須（できるようになりたいこと）が空でもエラーになる", async ({ page }) => {
  await login(page);
  await page.getByLabel("何ができなくなりましたか？").fill("できなくなった");
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page.getByText(/できるようになりたいこと」を書いてください/).first()).toBeVisible();
});

test("「以前は何ができていましたか？」に必須マークが出ない。未入力でも道を作成できる", async ({
  page,
}) => {
  await login(page);
  // 必須項目は label 内に "*"（aria-hidden）＋ sr-only「（必須）」が付く（form.tsx の Field 実装）。
  // 「以前は何ができていましたか？」のラベルにはどちらも付かないことを確認する。
  const previouslyAbleLabel = page.locator("label", { hasText: "以前は何ができていましたか？" });
  await expect(previouslyAbleLabel).not.toContainText("必須");
  await expect(previouslyAbleLabel.getByText("*", { exact: true })).toHaveCount(0);
  // 対照: 「できなくなったこと」（必須のまま）には付いている
  const difficultyLabel = page.locator("label", { hasText: "何ができなくなりましたか？" });
  await expect(difficultyLabel).toContainText("必須");

  const marker = `以前任意テスト ${Date.now()}`;
  await page.getByLabel("何ができなくなりましたか？").fill(marker);
  await page.getByLabel("何ができるようになりたいですか？").fill("できるようになりたい");
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
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

  await page.getByLabel("以前は何ができていましたか？").fill("以前は自分でボタンを留められていた");
  await page.getByLabel("何ができなくなりましたか？").fill(long);
  await page.getByLabel("何ができるようになりたいですか？").fill("朝、自分で着替えを済ませたい");
  await page.getByRole("button", { name: "この道を作る" }).click();

  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
  await expect(page.getByText("まだ記録がありません")).toBeVisible();
  await expect(page.getByText(long).first()).toBeVisible();

  // 試したことが無い道があると、「自分の道」に公開されない旨のカードが出る
  await page.goto("/me");
  await expect(
    page.getByText("試したことを記録すると、経験として公開されます"),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /試したことを記録する →/ })).toBeVisible();

  // 公開中の経験がまだ無いので、カード右上の「公開表示」はリンクにならず押せない
  const card = page.locator("article").filter({ hasText: long });
  await expect(card.getByText("公開表示")).toBeVisible();
  await expect(card.getByRole("link", { name: "公開表示" })).toHaveCount(0);
});

test("「いつ頃から難しくなりましたか？」に値を入れると「日付を消す」が出て、押すと空に戻る", async ({
  page,
}) => {
  // スマホ（特に iOS Safari）はネイティブの日付ダイアログに値を消す手段が無く、
  // 一度選ぶと OS 側の操作だけでは空に戻せないことがあるため、明示的な消すボタンを添えている。
  await login(page);
  const dateField = page.getByLabel("いつ頃から難しくなりましたか？（任意）");
  const clearBtn = page.getByRole("button", { name: "日付を消す" });

  await expect(clearBtn).toHaveCount(0);

  await dateField.fill("2020-01-01");
  await expect(dateField).toHaveValue("2020-01-01");
  await expect(clearBtn).toBeVisible();

  await clearBtn.click();
  await expect(dateField).toHaveValue("");
  await expect(clearBtn).toHaveCount(0);
});

test("送信ボタンは連打しても道は 1 件しか作られない", async ({ page }) => {
  await login(page);
  const marker = `二重送信テスト ${Date.now()}`;
  await page.getByLabel("以前は何ができていましたか？").fill("以前はできていた");
  await page.getByLabel("何ができなくなりましたか？").fill(marker);
  await page.getByLabel("何ができるようになりたいですか？").fill("できるようになりたい");

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
