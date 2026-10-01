import { test, expect } from "@playwright/test";

/**
 * 「自分の道を作る」→「この道を作る」→「自分の道が表示される」を確実に通す
 * (再作成指示書「作成エラー対策」／登録画面・登録項目 更新指示書／
 * Road登録・編集画面 必須項目修正指示)。
 *
 * 必須は difficulty（今、困っていること）／goal（できるようになりたいこと）の 2 つだけ。
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
  // 先頭の必須項目（困っていること）から埋まっていない旨が出る
  // (バナーとフィールド直下の両方に同文言が出るため、先頭の一致だけ確認する)
  await expect(page.getByText(/困っていること」を書いてください/).first()).toBeVisible();
});

test("2 番目の必須（できるようになりたいこと）が空でもエラーになる", async ({ page }) => {
  await login(page);
  await page.getByLabel("今、どんなことで困っていますか？").fill("できなくなった");
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page.getByText(/できるようになりたいこと」を書いてください/).first()).toBeVisible();
});

test("「以前は、どうしていましたか？」に必須マークが出ない。未入力でも道を作成できる", async ({
  page,
}) => {
  await login(page);
  // 必須項目は label 内に "*"（aria-hidden）＋ sr-only「（必須）」が付く（form.tsx の Field 実装）。
  // 「以前は、どうしていましたか？」のラベルにはどちらも付かないことを確認する。
  const previouslyAbleLabel = page.locator("label", {
    hasText: "以前は、どうしていましたか？（任意）",
  });
  await expect(previouslyAbleLabel).not.toContainText("必須");
  await expect(previouslyAbleLabel.getByText("*", { exact: true })).toHaveCount(0);
  // 対照: 「困っていること」（必須）には付いている
  const difficultyLabel = page.locator("label", { hasText: "今、どんなことで困っていますか？" });
  await expect(difficultyLabel).toContainText("必須");

  const marker = `以前任意テスト ${Date.now()}`;
  await page.getByLabel("今、どんなことで困っていますか？").fill(marker);
  await page.getByLabel("これから、何ができるようになりたいですか？").fill("できるようになりたい");
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
});

test("入力欄に最大文字数と残り文字数が出る", async ({ page }) => {
  await login(page);
  await expect(page.getByText("最大 2000 文字").first()).toBeVisible();
  await expect(page.getByText("0 / 2000 文字").first()).toBeVisible();
  await page.getByLabel("今、どんなことで困っていますか？").fill("あいう");
  await expect(page.getByText("3 / 2000 文字")).toBeVisible();
});

test("長い「困っていること」でも道を作成でき、作った道へ遷移する", async ({ page }) => {
  await login(page);
  // 120 文字を超える自由記述（title を派生させていた頃はここで 400 になっていた）
  const long =
    "指先に力が入りにくく、シャツやブラウスの小さいボタンを自分でとめられない。" +
    "特に急いでいる朝や、寒くて手がかじかんでいるときは、何度やってもボタンが穴を通らず、" +
    "家族に頼むことになってしまうのが申し訳ないし、自分でも情けなく感じてつらい。" +
    "できれば、道具を使ってでもいいので、自分のペースで身支度を整えられるようになりたい。";
  expect(long.length).toBeGreaterThan(120);

  await page
    .getByLabel("以前は、どうしていましたか？（任意）")
    .fill("以前は自分でボタンを留められていた");
  await page.getByLabel("今、どんなことで困っていますか？").fill(long);
  await page
    .getByLabel("これから、何ができるようになりたいですか？")
    .fill("朝、自分で着替えを済ませたい");
  await page.getByRole("button", { name: "この道を作る" }).click();

  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
  await expect(page.getByText("まだ記録がありません")).toBeVisible();
  await expect(page.getByText(long).first()).toBeVisible();

  // 試したことが無い道があると、「自分の道」に公開されない旨のカードが出る
  await page.goto("/me");
  await expect(page.getByText("試したことを記録すると、経験として公開されます")).toBeVisible();
  await expect(page.getByRole("link", { name: /試したことを記録する →/ })).toBeVisible();

  // 公開中の経験がまだ無いので、カード右上の「公開表示」はリンクにならず押せない
  const card = page.locator("article").filter({ hasText: long });
  await expect(card.getByText("公開表示")).toBeVisible();
  await expect(card.getByRole("link", { name: "公開表示" })).toHaveCount(0);
});

test("送信ボタンは連打しても道は 1 件しか作られない", async ({ page }) => {
  await login(page);
  const marker = `二重送信テスト ${Date.now()}`;
  await page.getByLabel("以前は、どうしていましたか？（任意）").fill("以前はできていた");
  await page.getByLabel("今、どんなことで困っていますか？").fill(marker);
  await page.getByLabel("これから、何ができるようになりたいですか？").fill("できるようになりたい");

  const btn = page.getByRole("button", { name: /この道を作る|作成しています/ });
  await Promise.all([btn.click(), btn.click().catch(() => {}), btn.click().catch(() => {})]);
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);

  const res = await page.request.get("/api/v1/roads");
  const { items } = await res.json();
  const mine = items.filter((r: { difficulty: string | null }) => r.difficulty === marker);
  expect(mine).toHaveLength(1);
});

test("入力欄は「困っていること → なりたい姿 → 以前（任意）→ メモ・気づき」の 4 つだけ", async ({
  page,
}) => {
  await login(page);
  // allInnerTexts は自動待機しないので、フォームの描画を待ってから読む
  await expect(page.getByLabel("メモ・気づき")).toBeVisible();
  const labels = await page.locator("fieldset label").allInnerTexts();
  const order = [
    "今、どんなことで困っていますか？",
    "これから、何ができるようになりたいですか？",
    "以前は、どうしていましたか？（任意）",
    "メモ・気づき",
  ].map((t) => labels.findIndex((l) => l.includes(t)));
  expect(order.every((i) => i >= 0)).toBe(true);
  // 登録は軽く: 日付・場面などは編集画面で追加する（2026-10-01 役割整理）
  expect(labels).toHaveLength(4);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  await expect(page.getByPlaceholder("例：シャツのボタンを自分で留めるのが難しい")).toBeVisible();
});

test("4 欄すべてに音声入力ボタンがあり、入力欄のすぐ下に出る", async ({ page }) => {
  await login(page);
  const voice = page.getByRole("button", { name: "音声で入力" });
  await expect(page.getByLabel("メモ・気づき")).toBeVisible();
  // Web Speech API が無いブラウザではボタン自体を出さない仕様なので、その場合は確認しない
  test.skip((await voice.count()) === 0, "このブラウザは Web Speech API 非対応");
  await expect(voice).toHaveCount(4);

  const fields = [
    "今、どんなことで困っていますか？",
    "これから、何ができるようになりたいですか？",
    "以前は、どうしていましたか？（任意）",
    "メモ・気づき",
  ];
  for (const [i, label] of fields.entries()) {
    const a = (await page.getByLabel(label).boundingBox())!;
    const b = (await voice.nth(i).boundingBox())!;
    const gap = b.y - (a.y + a.height);
    // 入力欄の直下（2026-10-01 に 10px 超 → 4px → 8px）
    expect(gap, label).toBeGreaterThanOrEqual(0);
    expect(gap, label).toBeLessThanOrEqual(8);
  }
});

test("「自分の道」の「道を作る」と作成画面の「この道を作る」はアイコン付き", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("button", { name: "この道を作る" }).locator("svg")).toHaveCount(1);

  await page.goto("/me");
  const create = page.getByRole("link", { name: "道を作る", exact: true });
  await expect(create).toBeVisible();
  await expect(create.locator("svg")).toHaveCount(1);
  await create.click();
  await expect(page).toHaveURL(/\/me\/roads\/new$/);
});
