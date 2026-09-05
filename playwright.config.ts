import { defineConfig, devices } from "@playwright/test";

// E2E は専用ポートでクリーンな本番ビルドを起動する (dev サーバや他アプリと衝突しない)
const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    // スイート全体が共有クライアントとして扱われ、Bot ガードで自己スロットリングしないよう
    // テスト専用の識別子を付ける (E2E_TEST_LOGIN=true のときのみ有効な仕組み)。
    // レート制限を検証するテストは、この値をリクエスト個別に上書きする。
    extraHTTPHeaders: { "x-dekiru-client": "e2e-default" },
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // E2E ではモックログインを有効にしてクリーンな本番ビルドを専用ポートで起動する
    command: `E2E_TEST_LOGIN=true npm run build && E2E_TEST_LOGIN=true npx next start -p ${PORT}`,
    url: baseURL,
    timeout: 180_000,
    // 常に自前のサーバを起動する (他アプリが 3000 を専有していても影響を受けない)
    reuseExistingServer: false,
    env: {
      E2E_TEST_LOGIN: "true",
      // E2E はローカル LLM に依存しない（CI・本番未設定と同じ挙動＝タイトル自動生成オフ）
      LOCAL_AI_MODEL: "",
      // 公開のたびに Claude を呼ばない（課金・遅延・不安定さを避ける）。公開は即 approved。
      AI_MODERATION_ENABLED: "false",
    },
  },
});
