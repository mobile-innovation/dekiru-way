/**
 * 環境変数の集約とバリデーション。
 * 認証情報そのものはここで参照するだけで、ログには出さない (指示書 15)。
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  get databaseUrl() {
    return required("DATABASE_URL");
  },

  auth: {
    get secret() {
      return optional("AUTH_SECRET");
    },
    get googleId() {
      return optional("AUTH_GOOGLE_ID");
    },
    get googleSecret() {
      return optional("AUTH_GOOGLE_SECRET");
    },
    /** Google クレデンシャルが揃っているか */
    get googleConfigured() {
      return Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
    },
  },

  storage: {
    get endpoint() {
      return optional("STORAGE_ENDPOINT", "http://localhost:9000");
    },
    get region() {
      return optional("STORAGE_REGION", "us-east-1");
    },
    get bucket() {
      return optional("STORAGE_BUCKET", "dekiru-photos");
    },
    get accessKeyId() {
      return optional("STORAGE_ACCESS_KEY_ID", "dekiru");
    },
    get secretAccessKey() {
      return optional("STORAGE_SECRET_ACCESS_KEY", "dekiru-secret");
    },
    get publicBaseUrl() {
      return optional(
        "STORAGE_PUBLIC_BASE_URL",
        `${optional("STORAGE_ENDPOINT", "http://localhost:9000")}/${optional("STORAGE_BUCKET", "dekiru-photos")}`,
      );
    },
    get forcePathStyle() {
      return optional("STORAGE_FORCE_PATH_STYLE", "true") === "true";
    },
  },

  ai: {
    get apiKey() {
      return optional("ANTHROPIC_API_KEY");
    },
    get model() {
      return optional("ANTHROPIC_MODEL", "claude-sonnet-5");
    },
    get configured() {
      return Boolean(process.env.ANTHROPIC_API_KEY);
    },
  },

  /**
   * E2E / ローカル開発用モックログインを許可するか。
   * `E2E_TEST_LOGIN=true` を明示的に設定したときのみ有効。
   * 本番デプロイでは絶対にこの変数を設定しないこと (README に明記)。
   * Playwright は prod ビルドを起動するため NODE_ENV では判定できない。
   */
  get e2eTestLogin() {
    return process.env.E2E_TEST_LOGIN === "true";
  },
};
