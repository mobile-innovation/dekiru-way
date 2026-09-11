import { test, expect, type Page } from "@playwright/test";

/**
 * 既読引き継ぎ (既読引き継ぎ指示書)。
 *   - 未ログインでもブラウザ (localStorage) で既読を管理できる
 *   - ログアウト時、アカウントの既読がブラウザ側へ引き継がれる（消えない）
 *   - 再ログイン時、ブラウザに溜まった既読がアカウント側へ統合される
 */

const STORAGE_KEY = "dekiru:localReads";

async function loginAs(page: Page, name: string) {
  await page.context().clearCookies();
  const res = await page.request.post("/api/test/login", { data: { sub: name, name } });
  expect(res.ok()).toBeTruthy();
}

async function createPublicExperience(page: Page, word: string) {
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
  return { attemptId: attempt.id as string, roadId: road.id as string };
}

function getLocalReads(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  }, STORAGE_KEY);
}

test("未ログインでも詳細を開くと既読になる（localStorage）。既読 API は呼ばれない", async ({ page }) => {
  const word = `ミログインキドク${Date.now()}`;
  const owner = `carry-owner-${Date.now()}`;

  await loginAs(page, owner);
  const { attemptId, roadId } = await createPublicExperience(page, word);

  try {
    await page.context().clearCookies(); // 未ログインへ
    let readCalled = false;
    page.on("request", (r) => {
      if (/\/api\/v1\/attempts\/[0-9a-f-]{36}\/read$/.test(r.url())) readCalled = true;
    });

    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const card = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card.getByText("未読", { exact: true })).toBeVisible();
    await expect(card).toHaveClass(/bg-\[var\(--color-primary-tint\)\]/); // 未読の背景色

    await card.getByRole("link", { name: /この道を見る/ }).click();
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
    await page.waitForTimeout(300);
    expect(readCalled).toBe(false); // サーバーへは書かない

    const stored = await getLocalReads(page);
    expect(stored).toContain(attemptId); // ブラウザ側に記録される

    // 検索へ戻ると、localStorage を見てバッジだけでなく背景色も既読表示になる
    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const card2 = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card2.getByText("既読", { exact: true })).toBeVisible();
    await expect(card2).toHaveClass(/bg-\[var\(--color-surface\)\]/); // 既読の背景色（白）
    await expect(card2).not.toHaveClass(/bg-\[var\(--color-primary-tint\)\]/);
  } finally {
    await loginAs(page, owner);
    await page.request.delete(`/api/v1/roads/${roadId}`);
    await page.context().clearCookies();
  }
});

test("ログアウトすると、それまでの既読がブラウザ側へ引き継がれる（消えない）", async ({ page }) => {
  const word = `ログアウトヒキツギ${Date.now()}`;
  const owner = `carry-owner2-${Date.now()}`;
  const reader = `carry-reader-${Date.now()}`;

  await loginAs(page, owner);
  const { attemptId, roadId } = await createPublicExperience(page, word);

  try {
    await loginAs(page, reader);

    // ログイン中に詳細を開いて既読（サーバー側）にする
    await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/v1\/attempts\/[0-9a-f-]{36}\/read$/.test(r.url()) && r.request().method() === "POST",
      ),
      page.goto(`/experiences/${attemptId}`),
    ]);
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();

    // ヘッダーのユーザーメニューからログアウト
    await page.goto("/experiences");
    await page.getByRole("button", { name: "アカウントのメニュー" }).click();
    await page.getByRole("menuitem", { name: "ログアウト" }).click();
    await expect(page).toHaveURL(/\/$/);

    // ログアウト直後、既読はブラウザ側へ引き継がれている（消えていない）
    const stored = await getLocalReads(page);
    expect(stored).toContain(attemptId);

    // 未ログインの検索でも既読表示になる（バッジ・背景色とも）
    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const card = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card.getByText("既読", { exact: true })).toBeVisible();
    await expect(card).toHaveClass(/bg-\[var\(--color-surface\)\]/);
  } finally {
    await loginAs(page, owner);
    await page.request.delete(`/api/v1/roads/${roadId}`);
    await page.context().clearCookies();
  }
});

test("ログイン中、詳細の「← 経験を探すへ戻る」で戻ると、カードが既読表示になる", async ({ page }) => {
  // React が同じ道のカードを使い回す（コンポーネントを作り直さない）ケースでも
  // 既読バッジ・背景が固まって「未読のまま」にならないことを確かめる。
  const word = `モドルリンク${Date.now()}`;
  const owner = `carry-owner4-${Date.now()}`;
  const reader = `carry-reader3-${Date.now()}`;

  await loginAs(page, owner);
  const { roadId } = await createPublicExperience(page, word);

  try {
    await loginAs(page, reader);

    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const card = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card.getByText("未読", { exact: true })).toBeVisible();
    await expect(card).toHaveClass(/bg-\[var\(--color-primary-tint\)\]/);

    await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/v1\/attempts\/[0-9a-f-]{36}\/read$/.test(r.url()) && r.request().method() === "POST",
      ),
      card.getByRole("link", { name: /この道を見る/ }).click(),
    ]);
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();

    // 詳細画面の「← 経験を探すへ戻る」リンク（クライアント遷移。素の /experiences → RestoreSearch で復元）
    await page.getByRole("link", { name: "経験を探すへ戻る" }).click();
    // URL はエンコードされた文字列で比較する（toHaveURL は生のURL文字列と照合するため）
    await expect(page).toHaveURL(new RegExp(`q=${encodeURIComponent(word)}`));

    const card2 = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card2.getByText("既読", { exact: true })).toBeVisible();
    await expect(card2).toHaveClass(/bg-\[var\(--color-surface\)\]/);
    await expect(card2).not.toHaveClass(/bg-\[var\(--color-primary-tint\)\]/);
  } finally {
    await loginAs(page, owner);
    await page.request.delete(`/api/v1/roads/${roadId}`);
    await page.context().clearCookies();
  }
});

test("未ログイン中に付けた既読は、再ログイン時にアカウント側へ統合される", async ({ page }) => {
  const word = `サイログイントウゴウ${Date.now()}`;
  const owner = `carry-owner3-${Date.now()}`;
  const reader = `carry-reader2-${Date.now()}`;

  await loginAs(page, owner);
  const { attemptId, roadId } = await createPublicExperience(page, word);

  try {
    // 未ログインで詳細を開く（localStorage に記録される）
    await page.context().clearCookies();
    await page.goto(`/experiences/${attemptId}`);
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
    expect(await getLocalReads(page)).toContain(attemptId);

    // 再ログイン（クッキーは変わるが、同じブラウザなので localStorage は残る）
    await loginAs(page, reader);
    await page.goto("/experiences"); // ヘッダーがマウントされ、統合が走る
    await expect(page.getByRole("button", { name: "アカウントのメニュー" })).toBeVisible();

    // 統合が終わると localStorage は空になる
    await expect
      .poll(async () => getLocalReads(page), { timeout: 5000 })
      .toEqual([]);

    // アカウント側の既読として一覧に出る（サーバーの GET で確認）
    const res = await page.request.get("/api/v1/me/reads");
    expect(res.ok()).toBeTruthy();
    const { attemptIds } = (await res.json()) as { attemptIds: string[] };
    expect(attemptIds).toContain(attemptId);

    // ログイン中の検索でも既読表示になる
    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const card = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card.getByText("既読", { exact: true })).toBeVisible();
  } finally {
    await loginAs(page, owner);
    await page.request.delete(`/api/v1/roads/${roadId}`);
    await page.context().clearCookies();
  }
});
