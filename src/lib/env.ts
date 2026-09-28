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
   * 意味検索（Embedding。試験導入）。既定は無効。
   * `SEMANTIC_SEARCH_ENABLED=true` かつ `EMBEDDING_MODEL` 設定時だけ、`/experiences?sem=1` で使える。
   * モデルはローカル（Transformers.js / CPU）で動かす。従量課金 API は使わない。
   * モデル名・接頭辞・pooling はモデルごとに違うので、コードに書かず環境変数で渡す（.env.example 参照）。
   */
  semantic: {
    get enabled() {
      return process.env.SEMANTIC_SEARCH_ENABLED === "true";
    },
    /** Transformers.js のモデル ID（例は .env.example）。 */
    get model() {
      return optional("EMBEDDING_MODEL");
    },
    /** モデルファイルを置くディレクトリ（`<dir>/<モデルID>/...`）。未設定なら Transformers.js の既定。 */
    get modelPath() {
      return optional("EMBEDDING_MODEL_PATH");
    },
    /** モデルを Hugging Face から取得してよいか。本番は false（事前に配置したファイルだけを使う）。 */
    get allowRemote() {
      return process.env.EMBEDDING_ALLOW_REMOTE === "true";
    },
    get dtype() {
      return optional("EMBEDDING_DTYPE", "q8");
    },
    get pooling(): "mean" | "cls" {
      return process.env.EMBEDDING_POOLING === "cls" ? "cls" : "mean";
    },
    /** 検索語に付ける接頭辞（e5 系は "query: "）。 */
    get queryPrefix() {
      return optional("EMBEDDING_QUERY_PREFIX");
    },
    /** 文書に付ける接頭辞（e5 系は "passage: "）。 */
    get passagePrefix() {
      return optional("EMBEDDING_PASSAGE_PREFIX");
    },
    /**
     * 推論スレッド数。既定 1。onnxruntime の既定（全コア）はコンテナの CPU 制限を無視して
     * スレッドを立て、同じマシンの Next.js の応答を遅くすることを PoC で確認している。
     */
    get threads() {
      const n = Number(optional("EMBEDDING_THREADS", "1"));
      return Number.isInteger(n) && n > 0 ? n : 1;
    },
    /** 意味検索で候補にする件数（道・試したことそれぞれ）。 */
    get topK() {
      const n = Number(optional("SEMANTIC_SEARCH_TOP_K", "20"));
      return Number.isInteger(n) && n > 0 ? Math.min(n, 500) : 20;
    },
    /**
     * 1 位との類似度の差がこの値以内の結果だけを出す（既定 0.02）。大きくすると件数が増え、
     * 関係の薄い結果も増える。検証データでは 0.02 で無関係な結果が約 6 割減り、関連する結果の
     * 取りこぼしは約 2 割だった。
     */
    get margin() {
      const raw = process.env.SEMANTIC_SEARCH_MARGIN;
      const n = raw ? Number(raw) : 0.02;
      return Number.isFinite(n) && n >= 0 ? n : 0.02;
    },
    get configured() {
      return process.env.SEMANTIC_SEARCH_ENABLED === "true" && Boolean(process.env.EMBEDDING_MODEL);
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
