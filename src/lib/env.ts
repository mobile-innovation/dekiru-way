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
     * 広告表示の ON / OFF。既定 false（無効時は `<AdSlot>` は何も描画しない）。
     * `ADS_ENABLED=true` のときだけ、検索一覧と道詳細の 2 枠に広告を描画する。
     */
    get enabled() {
      return process.env.ADS_ENABLED === "true";
    },
    /**
     * Google AdSense のパブリッシャ ID (`ca-pub-XXXXXXXXXXXXXXXX`)。
     * 空なら実広告は出さずプレースホルダのまま（dev / E2E / 審査前）。
     * `NEXT_PUBLIC_` = ローダ script と `<ins data-ad-client>` でクライアント側からも読むため。
     * 広告は **非パーソナライズ（文脈のみ・行動追跡なし）** で配信する（広告方針の制約）。
     */
    get adsenseClient() {
      return optional("NEXT_PUBLIC_ADSENSE_CLIENT");
    },
    /** 検索一覧枠 (`search_after_2`) の広告ユニット slot ID。 */
    get adsenseSlotSearch() {
      return optional("NEXT_PUBLIC_ADSENSE_SLOT_SEARCH");
    },
    /** 道詳細枠 (`road_detail_mid`) の広告ユニット slot ID。 */
    get adsenseSlotRoad() {
      return optional("NEXT_PUBLIC_ADSENSE_SLOT_ROAD");
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
   * 管理者への「新しい登録があります」通知メール (Resend API 経由)。
   * 3 つすべて揃わない限り送信しない (configured=false のときはログに残すだけで実送信しない)。
   */
  mail: {
    /** Resend の API キー。クライアントには絶対に渡さない。 */
    get apiKey() {
      return optional("MAIL_PROVIDER_API_KEY");
    },
    /** 通知の送り先 (管理者本人のメールアドレス)。公開 API レスポンスには出さない。 */
    get adminEmail() {
      return optional("ADMIN_NOTIFICATION_EMAIL");
    },
    /** 送信元アドレス。Resend 側でドメイン認証済みである必要がある。 */
    get fromAddress() {
      return optional("MAIL_FROM_ADDRESS");
    },
    get configured() {
      return Boolean(
        process.env.MAIL_PROVIDER_API_KEY &&
          process.env.ADMIN_NOTIFICATION_EMAIL &&
          process.env.MAIL_FROM_ADDRESS,
      );
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
