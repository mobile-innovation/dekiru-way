import { test, expect, type Page } from "@playwright/test";

/**
 * 経験への「いいね」(いいね指示書)。
 *   - 他人の公開経験に灰色ハート → 押すと赤 → もう一度で灰色
 *   - いいね数はどこにも出さない
 *   - 自分の経験にはハートを出さない
 *   - 未ログインで押すとログインへ誘導
 *   - いいねを受けた投稿者のログイン後トップに通知ボックスが出て、閉じられる
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

/** このスペックが単一方法の公開道を残して他の一覧テストに影響しないよう、owner で道ごと削除する。 */
async function cleanup(page: Page, owner: string, roadId: string) {
  await loginAs(page, owner);
  await page.request.delete(`/api/v1/roads/${roadId}`);
  await page.context().clearCookies();
}

test("他人の経験のハートを付けて外せる／数は出ない／自分の経験には出ない／未ログインは誘導", async ({
  page,
}) => {
  const word = `イイネ${Date.now()}`;
  const owner = `like-owner-${Date.now()}`;
  const liker = `like-liker-${Date.now()}`;

  await loginAs(page, owner);
  const { attemptId, roadId } = await createPublicExperience(page, word);

  try {
    // --- 他人（liker）として ---
    await loginAs(page, liker);
    await page.goto(`/experiences/${attemptId}`);

    // 「参考になった」は「この人がたどった道」見出しの右に置いている
    await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();

    const heart = page.getByRole("button", { name: "この経験をいいねする" });
    await expect(heart).toBeVisible();
    // カウント表示が無い（ボタンの文字は文言のみ、数字を含まない）
    await expect(heart).toHaveText("参考になった");

    await heart.click();
    const liked = page.getByRole("button", { name: "いいねを取り消す" });
    await expect(liked).toBeVisible();
    await expect(liked).toHaveText("参考になりました");
    await expect(liked).toHaveAttribute("aria-pressed", "true");

    // リロードしても状態が残る
    await page.reload();
    await expect(page.getByRole("button", { name: "いいねを取り消す" })).toBeVisible();

    // もう一度押すと未評価に戻る
    await page.getByRole("button", { name: "いいねを取り消す" }).click();
    await expect(page.getByRole("button", { name: "この経験をいいねする" })).toBeVisible();

    // --- 投稿者本人にはハートを出さない ---
    await loginAs(page, owner);
    await page.goto(`/experiences/${attemptId}`);
    await expect(page.getByText("これはあなたの経験です。")).toBeVisible();
    await expect(page.getByRole("button", { name: "この経験をいいねする" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "いいねを取り消す" })).toHaveCount(0);

    // --- 未ログインは押すとログイン案内 ---
    await page.context().clearCookies();
    await page.goto(`/experiences/${attemptId}`);
    await page.getByRole("button", { name: "この経験をいいねする" }).click();
    await expect(
      page.getByText("この経験にいいねを送るにはログインが必要です。"),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "ログインする" })).toHaveAttribute(
      "href",
      `/login?next=${encodeURIComponent(`/experiences/${attemptId}`)}`,
    );
  } finally {
    await cleanup(page, owner, roadId);
  }
});

test("いいねを受けた投稿者のトップに通知が出て、閉じると消える", async ({ page }) => {
  const word = `ツウチ${Date.now()}`;
  const owner = `notif-owner-${Date.now()}`;
  const liker = `notif-liker-${Date.now()}`;

  await loginAs(page, owner);
  const { attemptId, roadId } = await createPublicExperience(page, word);

  try {
    // liker がいいね（API 経由）
    await loginAs(page, liker);
    const likeRes = await page.request.post(`/api/v1/attempts/${attemptId}/like`);
    expect(likeRes.status()).toBe(200);

    // owner でトップを開くと通知ボックス
    await loginAs(page, owner);
    await page.goto("/");
    const box = page.getByText("あなたの経験が、誰かの次の一歩になりました");
    await expect(box).toBeVisible();
    // 誰がいいねしたか・件数は出さない
    await expect(page.getByText(liker)).toHaveCount(0);
    await expect(page.getByText(/\d+\s*件/)).toHaveCount(0);

    // 閉じると消え、再訪しても出ない（既読化の完了を待ってから再訪する）
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/v1/notifications/read") && r.request().method() === "POST",
      ),
      page.getByRole("button", { name: "閉じる" }).click(),
    ]);
    await expect(box).toHaveCount(0);
    await page.goto("/");
    await expect(
      page.getByText("あなたの経験が、誰かの次の一歩になりました"),
    ).toHaveCount(0);
  } finally {
    await cleanup(page, owner, roadId);
  }
});
