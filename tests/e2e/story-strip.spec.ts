import { test, expect } from "@playwright/test";

/**
 * トップ「できる道って、こんな場所です」8 枚の表示（2026-10-01 スマホ表示変更指示）。
 * - desktop: 2 列 × 4 行のまま
 * - mobile: 1 枚ずつ大きく見せる横スクロール。次の画像が右に少し見える。ドット 8 個が追従。
 *   ページ全体は横にはみ出さない。自動では動かない。
 */

const list = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "できる道の紹介（8枚）" });

test("PC・タブレット幅では 2 列 × 4 行で ①〜⑧ の順に並ぶ", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "PC 幅のみ");
  await page.goto("/");
  const items = list(page).getByRole("listitem");
  await expect(items).toHaveCount(8);
  const boxes = await Promise.all(Array.from({ length: 8 }, (_, i) => items.nth(i).boundingBox()));
  // 2 列: 奇数番目は左、偶数番目は右。行ごとに同じ高さ
  for (let r = 0; r < 4; r++) {
    const [l, rt] = [boxes[r * 2]!, boxes[r * 2 + 1]!];
    expect(Math.abs(l.y - rt.y)).toBeLessThan(2);
    expect(rt.x).toBeGreaterThan(l.x + l.width - 1);
  }
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 1);
  // ドットと操作案内は出さない
  await expect(page.getByRole("button", { name: "1枚目を表示" })).toBeHidden();
  await expect(page.getByText("横にスワイプして続きを見る →")).toBeHidden();
});

test("スマホでは 1 枚ずつ大きい横スクロール。次の画像が少し見え、ドットが追従する", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "スマホ幅のみ");
  await page.goto("/");
  const ol = list(page);
  await ol.scrollIntoViewIfNeeded();
  const items = ol.getByRole("listitem");
  await expect(items).toHaveCount(8);

  const olBox = (await ol.boundingBox())!;
  const first = (await items.nth(0).boundingBox())!;
  const second = (await items.nth(1).boundingBox())!;
  // 1 枚目は領域幅の 8 割以上（十分大きい）、正方形のまま
  expect(first.width).toBeGreaterThan(olBox.width * 0.8);
  expect(Math.abs(first.width - first.height)).toBeLessThan(3);
  // 1 枚目と 2 枚目は同じ行（2 列にも縦積みにもならない）。2 枚目の左端が領域内に少し見える
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeLessThan(olBox.x + olBox.width);
  expect(second.x + second.width).toBeGreaterThan(olBox.x + olBox.width);

  // ページ全体は横にはみ出さない
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // ドット 8 個、最初は 1 枚目
  const dots = page.getByRole("button", { name: /枚目を表示$/ });
  await expect(dots).toHaveCount(8);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("横にスワイプして続きを見る →")).toBeVisible();

  // 自動では動かない（しばらく待っても 1 枚目のまま）
  await page.waitForTimeout(1500);
  expect(await ol.evaluate((e) => e.scrollLeft)).toBe(0);

  // 横にスクロール（スワイプ相当）すると 3 枚目でスナップし、ドットが追従、案内は消える
  await ol.evaluate((e) => {
    const items = e.children as HTMLCollectionOf<HTMLElement>;
    e.scrollTo({ left: items[2].offsetLeft - items[0].offsetLeft });
  });
  await expect(dots.nth(2)).toHaveAttribute("aria-current", "true");
  await expect(dots.nth(0)).not.toHaveAttribute("aria-current", "true");
  await expect(page.getByText("横にスワイプして続きを見る →")).toHaveCount(0);

  // ドットを押すと 8 枚目へ
  await dots.nth(7).click();
  await expect(dots.nth(7)).toHaveAttribute("aria-current", "true");

  // 再読み込みしても ① から始まる（ブラウザが横位置を復元しても戻す）
  await page.reload();
  await list(page).scrollIntoViewIfNeeded();
  expect(await list(page).evaluate((e) => e.scrollLeft)).toBe(0);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");

  // 縦スクロールは普通にできる（ページの下の方へ移動できる）
  await page.mouse.wheel(0, 800);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

/* ── 「いろいろな方法が試されています」（2026-10-01 スマホは横スライド） ── */

const paths = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "記録された道の例" });

test("いろいろな方法: PC は 3 列のまま", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "PC 幅のみ");
  await page.goto("/");
  test.skip((await paths(page).count()) === 0, "公開データが無くセクションが出ない");
  const items = paths(page).getByRole("listitem");
  const n = await items.count();
  test.skip(n < 3, "3 件そろっていない");
  const [a, b, c] = await Promise.all([0, 1, 2].map((i) => items.nth(i).boundingBox()));
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  expect(Math.abs(b!.y - c!.y)).toBeLessThan(2);
  expect(c!.x).toBeGreaterThan(b!.x);
  await expect(page.getByRole("button", { name: "1件目を表示" })).toBeHidden();
});

test("いろいろな方法: スマホは 1 件ずつ横スライド。次のカードが少し見え、ドットが追従し、リンクは使える", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "スマホ幅のみ");
  await page.goto("/");
  test.skip((await paths(page).count()) === 0, "公開データが無くセクションが出ない");
  const ol = paths(page);
  await ol.scrollIntoViewIfNeeded();
  const items = ol.getByRole("listitem");
  const n = await items.count();
  test.skip(n < 2, "2 件以上ない");

  const olBox = (await ol.boundingBox())!;
  const first = (await items.nth(0).boundingBox())!;
  const second = (await items.nth(1).boundingBox())!;
  expect(first.width).toBeGreaterThan(olBox.width * 0.8);
  expect(Math.abs(first.y - second.y)).toBeLessThan(2); // 縦に積まない
  expect(second.x).toBeLessThan(olBox.x + olBox.width); // 右に少しのぞく
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);

  const dots = page.getByRole("button", { name: /件目を表示$/ });
  await expect(dots).toHaveCount(n);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "true");
  await ol.evaluate((e) => {
    const els = e.children as HTMLCollectionOf<HTMLElement>;
    e.scrollTo({ left: els[1].offsetLeft - els[0].offsetLeft });
  });
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "true");

  // 「この道を見る」のリンクはそのまま使える
  await items.nth(1).getByRole("link").click();
  await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}$/);
});

test("ヒーロー: スマホは白い下地を濃くして見出し・検索欄を読みやすく、PC は従来の下地のまま", async ({
  page,
}, info) => {
  await page.goto("/");
  const overlay = page
    .locator("section[aria-labelledby=hero-heading] > div[aria-hidden=true]")
    .first();
  const bg = await overlay.evaluate((e) => getComputedStyle(e).backgroundColor);
  // rgba(255, 255, 255, a) の a を取り出す
  const alpha = Number(bg.match(/rgba?\([^)]*,\s*([\d.]+)\)$/)?.[1] ?? 1);
  if (info.project.name === "mobile") expect(alpha).toBeCloseTo(0.72, 2);
  else expect(alpha).toBeCloseTo(0.55, 2);
  await expect(page.getByRole("heading", { name: "できる道", level: 1 })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "あなたの困りごと" })).toBeVisible();
  await expect(page.getByRole("button", { name: "似た経験を探す" })).toBeVisible();
});
