import { test, expect } from "@playwright/test";

/**
 * 「経験を探す」の道カードと経験詳細の整合（一覧カード「困っていたこと」表示のデータ確認・修正指示）。
 *   - カードの「困っていたこと」= Road.difficulty（入力フォームの「困っていること」）。詳細ページのタイトルと同じ値
 *   - 検索語が困りごとに当たったカードには、その困りごとがそのまま出る
 *   - 方法数・結果の内訳は経験ごとの実データ（固定値ではない）
 */

test("カードの困っていたこと・方法数・結果が実データどおりで、詳細ページのタイトルと一致する", async ({
  page,
}) => {
  const word = `コマリゴト${Date.now()}`;
  const difficulty = `${word} 字が読みづらい`;
  const owner = `card-${Date.now()}`;
  await page.request.post("/api/test/login", { data: { sub: owner, name: "Card" } });
  const road = await (
    await page.request.post("/api/v1/roads", {
      data: { difficulty, goal: "本を自分で読みたい" },
    })
  ).json();
  try {
    for (const result of ["success", "failed", "failed"]) {
      await page.request.post(`/api/v1/roads/${road.id}/attempts`, {
        data: { method: `${word} の方法`, result, isPublished: true },
      });
    }
    await page.context().clearCookies();

    // 困りごとの語で検索 → そのカードに困りごとがそのまま出る
    await page.goto(`/experiences?q=${encodeURIComponent(word)}`);
    const card = page.locator("article").filter({ hasText: difficulty });
    await expect(card).toHaveCount(1);
    await expect(card.getByText("困っていたこと", { exact: true })).toBeVisible();
    await expect(card.getByText(difficulty, { exact: true })).toBeVisible();
    await expect(card.getByText("3つの方法を試した")).toBeVisible();
    const summary = card.getByRole("list", { name: "結果の内訳" });
    await expect(summary.getByRole("listitem")).toHaveText([
      "できるようになった",
      "うまくいかなかった2件",
    ]);

    // 「この道を見る」→ 詳細のタイトル（困っていたこと）が同じ文
    await card.getByRole("link", { name: /この道を見る/ }).click();
    await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(difficulty);
  } finally {
    // 一覧に残らないよう、作成者で道ごと削除する
    await page.request.post("/api/test/login", { data: { sub: owner, name: "Card" } });
    await page.request.delete(`/api/v1/roads/${road.id}`);
    await page.context().clearCookies();
  }
});
