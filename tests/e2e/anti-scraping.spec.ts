import { test, expect } from "@playwright/test";

/**
 * 公開API・AIクローラー・データ取得対策 (追加指示書 v1 §19/§20)。
 * 通常利用は妨げず、機械的な大量取得・自動巡回・既知クローラーを制限する。
 */

test.afterAll(async ({ request }) => {
  // Bot ガードの状態を戻す (他スペックへ影響させない)
  await request.delete("/api/test/login").catch(() => {});
});

test("robots.txt が /api/ と AI クローラーを拒否している", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.ok()).toBeTruthy();
  const body = await res.text();
  expect(body).toMatch(/User-Agent:\s*\*/i);
  expect(body).toMatch(/Disallow:\s*\/api\//i);
  expect(body).toMatch(/User-Agent:\s*GPTBot/i);
  expect(body).toMatch(/User-Agent:\s*ClaudeBot/i);
  // AI クローラーにはサイト全体を Disallow
  const gptSection = body.split(/User-Agent:\s*GPTBot/i)[1] ?? "";
  expect(gptSection).toMatch(/Disallow:\s*\/\s*/);
});

test("X-Robots-Tag: noai がレスポンスに付く", async ({ request }) => {
  const res = await request.get("/experiences");
  expect((res.headers()["x-robots-tag"] ?? "").toLowerCase()).toContain("noai");
});

test("通常利用: 未ログインの検索・詳細は妨げられない", async ({ page }) => {
  await page.goto("/experiences?q=つめ");
  await expect(page.getByRole("heading", { name: /いろいろな道/ })).toBeVisible();
  await page.locator("article a").first().click();
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
});

test("既知の AI クローラー UA は 403 (API もページも)", async ({ request }) => {
  const api = await request.get("/api/v1/experiences?limit=2", {
    headers: { "user-agent": "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)" },
  });
  expect(api.status()).toBe(403);

  const pageRes = await request.get("/experiences", { headers: { "user-agent": "ClaudeBot/1.0" } });
  expect(pageRes.status()).toBe(403);
});

test("ページサイズ・深いページングに上限がある", async ({ request }) => {
  expect((await request.get("/api/v1/experiences?limit=10000")).status()).toBe(400);
  expect((await request.get("/api/v1/experiences?page=50&limit=20")).status()).toBe(400);
  expect((await request.get("/api/v1/experiences?page=200")).status()).toBe(400);
});

test("全件取得 API は存在しない", async ({ request }) => {
  for (const path of [
    "/api/v1/experiences/all",
    "/api/v1/export/experiences",
    "/api/v1/experiences/export",
  ]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("短時間の大量リクエストは Rate Limit される", async ({ request }) => {
  const client = `e2e-scrape-${Date.now()}`;
  const statuses: number[] = [];
  for (let i = 0; i < 40; i++) {
    const res = await request.get(`/api/v1/experiences?limit=5&i=${i}`, {
      headers: { "x-dekiru-client": client },
    });
    statuses.push(res.status());
  }
  expect(statuses[0]).toBe(200); // 最初は通る
  expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0); // 途中から 429
  // 別クライアントは影響を受けない
  const other = await request.get("/api/v1/experiences?limit=2", {
    headers: { "x-dekiru-client": `e2e-innocent-${Date.now()}` },
  });
  expect(other.status()).toBe(200);
});
