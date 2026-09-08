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
