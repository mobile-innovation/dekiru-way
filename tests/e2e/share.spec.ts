import { test, expect, type Page } from "@playwright/test";

/**
 * 経験詳細の「この道をSNSで紹介」(SNS共有機能追加指示書)。
 *   - 「参考になった」と別のボタンとして、見出し付近に出る（mobile / desktop 両 project で実行）
 *   - 押すと共有文が開き、X の投稿画面 (intent) へのリンクに本文と正規 URL が入る
 *   - 共有文に非公開の方法・メモ・投稿者情報が入らない
 */

async function loginAs(page: Page, name: string) {
  await page.context().clearCookies();
  const res = await page.request.post("/api/test/login", { data: { sub: name, name } });
  expect(res.ok()).toBeTruthy();
}

test("共有ボタンから X の投稿画面へ、公開内容だけの共有文と正規 URL を渡す", async ({
  page,
  baseURL,
}) => {
  const word = `キョウユウ${Date.now()}`;
  const owner = `share-owner-${Date.now()}`;

  await loginAs(page, owner);
  const road = await (
    await page.request.post("/api/v1/roads", {
      data: {
        previouslyAble: "以前はできていた",
        difficulty: `${word} で困っている`,
        goal: "できるように",
      },
    })
  ).json();
  const pub = await (
    await page.request.post(`/api/v1/roads/${road.id}/attempts`, {
      data: {
        method: `${word} 公開の方法`,
        result: "failed",
        memo: "ひみつのメモ",
        isPublished: true,
      },
    })
  ).json();
  await page.request.post(`/api/v1/roads/${road.id}/attempts`, {
    data: { method: `${word} 非公開の方法`, result: "success", isPublished: false },
  });

  try {
    await page.context().clearCookies(); // 未ログインの閲覧者として見る
    await page.goto(`/experiences/${pub.id}`);

    const like = page.getByRole("button", { name: "この経験をいいねする" });
    const share = page.getByRole("button", { name: "この道をSNSで紹介" });
    await expect(like).toBeVisible();
    await expect(share).toBeVisible();
    // 2 つのボタンが重ならない（誤タップしにくい）
    const [a, b] = [await like.boundingBox(), await share.boundingBox()];
    expect(a && b).toBeTruthy();
    const overlap =
      a!.x < b!.x + b!.width &&
      b!.x < a!.x + a!.width &&
      a!.y < b!.y + b!.height &&
      b!.y < a!.y + a!.height;
    expect(overlap).toBe(false);
    expect(b!.height).toBeGreaterThanOrEqual(40);

    // 共有パネルは初期状態で閉じている（道の表示を邪魔しない）
    const xLink = page.getByRole("link", { name: "Xで紹介する" });
    await expect(xLink).toHaveCount(0);
    await expect(share).toHaveAttribute("aria-expanded", "false");
    // canonical はページ送りを含まない経験詳細の URL
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `${baseURL}/experiences/${pub.id}`,
    );

    await share.click();
    await expect(xLink).toBeVisible();
    // パネルを開いても横にはみ出さない（長い URL を含むプレビューでも）
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBe(0);
    const href = new URL((await xLink.getAttribute("href"))!);
    expect(href.origin + href.pathname).toBe("https://x.com/intent/post");
    expect(href.searchParams.get("url")).toBe(`${baseURL}/experiences/${pub.id}`);
    const text = href.searchParams.get("text")!;
    expect(text).toContain(`${word} で困っている`);
    // 方法は SNS 向けに 20 字程度で切るので、先頭（固有の語）で確認する
    expect(text).toContain(`・${word}`);
    expect(text).toContain("うまくいかなかった");
    for (const secret of ["非公開の方法", "ひみつのメモ", owner, road.id]) {
      expect(text).not.toContain(secret);
    }

    // 「閉じる」で閉じられる
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(xLink).toHaveCount(0);
    await expect(share).toHaveAttribute("aria-expanded", "false");

    // 「参考になった」の動作はそのまま（未ログインはログイン案内）
    await like.click();
    await expect(page.getByRole("link", { name: "ログインする" })).toBeVisible();
  } finally {
    await loginAs(page, owner);
    await page.request.delete(`/api/v1/roads/${road.id}`);
    await page.context().clearCookies();
  }
});
