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

  /**
   * サービスの公開 URL。OGP の og:image / og:url / canonical など「絶対 URL」を組み立てる基点。
   * 本番では必ず https の本番ドメインを `SITE_URL` に設定する。
   * 未設定時はローカル開発用の http://localhost:3000 にフォールバックする。
   */
  site: {
    get url() {
      return optional("SITE_URL", "http://localhost:3000").replace(/\/+$/, "");
    },
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

  ads: {
    /**
     * 広告表示の ON / OFF。既定 false（広告プロバイダ未接続の MVP は無効）。
     * `ADS_ENABLED=true` のときだけ、検索一覧と道詳細の 2 枠に広告スロットを描画する。
     * 無効時は `<AdSlot>` は何も描画しない（レイアウトに影響を残さない）。
     */
    get enabled() {
      return process.env.ADS_ENABLED === "true";
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
   * E2E / ローカル開発用モックログインを許可するか。
   * `E2E_TEST_LOGIN=true` を明示的に設定したときのみ有効。
   * 本番デプロイでは絶対にこの変数を設定しないこと (README に明記)。
   * Playwright は prod ビルドを起動するため NODE_ENV では判定できない。
   */
  get e2eTestLogin() {
    return process.env.E2E_TEST_LOGIN === "true";
  },
};
