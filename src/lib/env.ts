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
    /** 管理画面セッション署名にも AUTH_SECRET を流用する。 */
    get adminSessionTtlHours() {
      const n = Number(optional("ADMIN_SESSION_TTL_HOURS", "8"));
      return Number.isFinite(n) && n > 0 ? n : 8;
    },
    /** 初期管理者ブートストラップ用 (create-admin スクリプト / dev seed のみ参照)。 */
    get adminEmail() {
      return optional("ADMIN_EMAIL");
    },
    get adminPassword() {
      return optional("ADMIN_PASSWORD");
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
    /**
     * 公開投稿の AI モデレーションを有効にするか。既定 true。
     * `AI_MODERATION_ENABLED=false` で無効化すると、公開時は AI を呼ばず即 approved にする
     * (E2E / ローカルで AI 課金・遅延を避ける運用スイッチ)。
     */
    get moderationEnabled() {
      return process.env.AI_MODERATION_ENABLED !== "false";
    },
  },

  /**
   * 自ホストのローカル LLM (Ollama 互換 HTTP API)。Road タイトル自動生成に使う補助レイヤー。
   * - 内部ネットワーク限定。外部から到達可能にしない (指示書 ローカルAI v1 §10)。
   * - `LOCAL_AI_MODEL` 未設定なら丸ごと無効 = 生成をスキップ (アプリは従来どおり動く)。
   * - 認証情報・個人情報は一切渡さない。呼び出しは difficulty など「本文」のみ。
   */
  localAi: {
    get url() {
      return optional("LOCAL_AI_URL", "http://127.0.0.1:11434");
    },
    get model() {
      return optional("LOCAL_AI_MODEL");
    },
    get timeoutMs() {
      const n = Number(optional("LOCAL_AI_TIMEOUT_MS", "3500"));
      return Number.isFinite(n) && n > 0 ? n : 3500;
    },
    get enabled() {
      return Boolean(process.env.LOCAL_AI_MODEL);
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
