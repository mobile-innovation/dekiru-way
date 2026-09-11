import { test, expect, type Page } from "@playwright/test";

/**
 * 検索結果カードの「既読 / 未読」(既読指示書)。
 *   - 検索結果に出ただけでは既読にならない
 *   - 経験詳細を開くと既読になり、検索に戻るとカードが既読表示になる
 *   - 未読/既読は色だけでなく「未読」「既読」の文字＋アイコンで判別できる
 *   - 既読数などの数字は出さない
 *   - 自分の経験は既読登録されない
 */

async function loginAs(page: Page, name: string) {
  await page.context().clearCookies();
  const res = await page.request.post("/api/test/login", { data: { sub: name, name } });
  expect(res.ok()).toBeTruthy();
}

async function createPublicExperience(page: Page, word: string) {
  const road = await (
    await page.request.post("/api/v1/roads", {
      data: { previouslyAble: "以前はできていた", difficulty: `${word} で困っている`, goal: "できるように" },
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

test("検索結果カードは詳細を開くまで未読、開くと既読になる", async ({ page }) => {
  const word = `キドク${Date.now()}`;
  const owner = `read-owner-${Date.now()}`;
  const reader = `read-reader-${Date.now()}`;

  await loginAs(page, owner);
  const { roadId } = await createPublicExperience(page, word);

  try {
    await loginAs(page, reader);

    // 検索結果に出ただけでは未読
    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const card = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card).toBeVisible();
    await expect(card.getByText("未読", { exact: true })).toBeVisible();
    await expect(card.getByText("既読", { exact: true })).toHaveCount(0);
    // 数字（既読数/閲覧数）は出さない
    await expect(card.getByText(/\d+\s*(人|回|件)/)).toHaveCount(0);

    // 一覧を見ただけでは既読 API は呼ばれない → リロードしても未読のまま
    await page.reload();
    await expect(
      page.locator("article").filter({ hasText: `${word} を試した` }).getByText("未読", { exact: true }),
    ).toBeVisible();

    // カードから詳細へ。詳細表示で既読 API が呼ばれる
    await Promise.all([
      page.waitForResponse(
        (r) => /\/api\/v1\/attempts\/[0-9a-f-]{36}\/read$/.test(r.url()) && r.request().method() === "POST",
      ),
      card.getByRole("link", { name: /この道を見る/ }).click(),
    ]);
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();

    // 検索に戻ると既読表示
    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const card2 = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card2.getByText("既読", { exact: true })).toBeVisible();
    await expect(card2.getByText("未読", { exact: true })).toHaveCount(0);

    // --- 自分の経験は既読にならない ---
    await loginAs(page, owner);
    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const ownCard = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(ownCard.getByText("未読", { exact: true })).toBeVisible();
    await ownCard.getByRole("link", { name: /この道を見る/ }).click();
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    await expect(
      page.locator("article").filter({ hasText: `${word} を試した` }).getByText("未読", { exact: true }),
    ).toBeVisible();
  } finally {
    await loginAs(page, owner);
    await page.request.delete(`/api/v1/roads/${roadId}`);
    await page.context().clearCookies();
  }
});

test("未ログインでは既読表示が付かず（すべて未読扱い）、既読 API も呼ばれない", async ({ page }) => {
  const word = `ミログイン${Date.now()}`;
  const owner = `read-anon-owner-${Date.now()}`;

  await loginAs(page, owner);
  const { roadId } = await createPublicExperience(page, word);

  try {
    await page.context().clearCookies();
    let readCalled = false;
    page.on("request", (r) => {
      if (/\/api\/v1\/attempts\/[0-9a-f-]{36}\/read$/.test(r.url())) readCalled = true;
    });

    await page.goto(`/experiences?q=${encodeURIComponent(word)}&kind=road`);
    const card = page.locator("article").filter({ hasText: `${word} を試した` });
    await expect(card.getByText("未読", { exact: true })).toBeVisible();

    await card.getByRole("link", { name: /この道を見る/ }).click();
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
    await page.waitForTimeout(300);
    expect(readCalled).toBe(false);
  } finally {
    await loginAs(page, owner);
    await page.request.delete(`/api/v1/roads/${roadId}`);
    await page.context().clearCookies();
  }
});

test("検索を「既読だけ / 未読だけ」で絞り込める（ログイン中のみ）", async ({ page }) => {
  const wordA = `シボリA${Date.now()}`;
  const wordB = `シボリB${Date.now()}`;
  const owner = `filter-owner-${Date.now()}`;
  const reader = `filter-reader-${Date.now()}`;

  await loginAs(page, owner);
  const a = await createPublicExperience(page, wordA);
  const b = await createPublicExperience(page, wordB);

  try {
    await loginAs(page, reader);

    // A だけ詳細を開いて既読にする
    await page.goto(`/experiences/${a.attemptId}`);
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
    await page.waitForResponse(
      (r) => /\/api\/v1\/attempts\/[0-9a-f-]{36}\/read$/.test(r.url()) && r.request().method() === "POST",
    );

    // 既読/未読セレクトがある（ログイン中）
    await page.goto("/experiences?kind=road");
    const readSelect = page.getByRole("combobox", { name: "既読 / 未読" });
    await expect(readSelect).toBeVisible();

    // 未読だけ: A（既読）は出ない、B（未読）は出る
    await page.goto(`/experiences?kind=road&read=unread`);
    await expect(
      page.locator("article").filter({ hasText: `${wordA} を試した` }),
    ).toHaveCount(0);
    await expect(
      page.locator("article").filter({ hasText: `${wordB} を試した` }),
    ).toBeVisible();

    // 既読だけ: 逆
    await page.goto(`/experiences?kind=road&read=read`);
    await expect(
      page.locator("article").filter({ hasText: `${wordA} を試した` }),
    ).toBeVisible();
    await expect(
      page.locator("article").filter({ hasText: `${wordB} を試した` }),
    ).toHaveCount(0);

    // 未ログインではセレクト自体が無い
    await page.context().clearCookies();
    await page.goto("/experiences?kind=road");
    await expect(page.getByRole("combobox", { name: "既読 / 未読" })).toHaveCount(0);
  } finally {
    await loginAs(page, owner);
    await page.request.delete(`/api/v1/roads/${a.roadId}`);
    await page.request.delete(`/api/v1/roads/${b.roadId}`);
    await page.context().clearCookies();
  }
});
