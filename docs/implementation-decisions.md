# 実装上の決定記録 (implementation-decisions)

指示書 v1 で未確定だった技術項目・解釈が分かれる点について、採用した内容と理由を残す。
仕様と実装都合が衝突したときは「変更前 / 変更後 / 理由 / 影響範囲 / 将来への影響」の形で追記する。

---

## 0. 前提

- リポジトリは実質空（コミット 0）の状態から開始した。参照されている `.docx` 設計資料は
  リポジトリにもディスクにも存在しなかったため、**指示書 v1 を唯一の一次仕様**として実装した。

---

## 1. 技術スタック（未確定項目・ユーザー確認済み）

| 項目 | 採用 | 理由 |
| --- | --- | --- |
| Frontend / Backend | **Next.js 15 (App Router, TypeScript) フルスタック 1 リポジトリ** | 7 画面のうち公開検索・閲覧はログイン不要で、SSR / SEO と相性が良い。API Route Handlers で REST を同居でき、デプロイ・認証連携の手数が最小。 |
| DB | **PostgreSQL 16**（開発は docker compose） | 指示書 4 / 16 の DDL（UUID PK・enum・TIMESTAMP・部分インデックス）をそのまま表現でき、標準的で移行先の選択肢が広い。本番ホスティングは MVP 実装後に決定。 |
| ORM / Migration | **Prisma 6** | DDL とほぼ 1:1。`prisma migrate` で履歴管理。`@@map` / `@map` で指示書のスネークケース物理名を維持。 |
| 認証 | **Auth.js (NextAuth v5) + Google Provider、JWT セッション（HttpOnly Cookie）** | Google ログイン基本の要件に最短。DB アダプタは使わず `users` は指示書 4 のスキーマのまま自前 upsert。 |
| 画像・写真 | **扱わない（廃止済み）** | プライバシー保護のためユーザーによる画像投稿・添付をサービスで受け付けない。`attempt_photos` テーブル・写真 API・オブジェクトストレージ（旧 MinIO / `@aws-sdk/client-s3`）は撤去。 |
| AI | **Anthropic Claude（`@anthropic-ai/sdk`）／キー未設定時はスタブ** | 補助レイヤー（指示書 12）。キーが無くてもアプリは完全に動く。 |
| テスト | Vitest（unit / integration）、Playwright + axe-core（E2E / アクセシビリティ） | 指示書 18 の公開側・本人側・権限・重要シナリオを機械的に固定。 |

---

## 2. データモデルの解釈

### 2.1 「道」は生成物（指示書 21）
専用テーブル・グラフ DB を作らず、`roads` + `attempts` から API / UI で組み立てる。
- `GET /api/v1/roads/{roadId}/paths`（本人）
- `GET /api/v1/experiences/paths`（公開）
いずれも保存はせず、リクエスト時に「方法 → 結果」列を生成して返す。

### 2.2 Experience 独立テーブルは作らない（指示書 5）
「経験」= `attempts.is_published = true` の Attempt。
- `/api/v1/experiences/{id}` の `id` は **Attempt の id**。
- 一覧・詳細・タグ・paths はすべて公開 Attempt を起点に組み立てる。

### 2.3 公開単位は Attempt（指示書 14）
- 検索・経験詳細に出るのは **`is_published = true` かつ `moderation_status = approved` の Attempt だけ**。
  道 (Road) 自体はモデレーション状態を持たない（2026-09-09 に廃止）。道が公開面に出るかは
  「承認済みの公開 Attempt を 1 つ以上持つか」で決まる。
- 経験詳細では親 Road の記述フィールド（`previously_able` / `difficulty` / `goal` /
  `situation` / `progress` / `next_action` / タグ）を**文脈として一緒に表示する**。
  これは「困ったこと → 試したこと → 結果 → 現在 → 次」を追うために必要（指示書 6-③）。
- ただし **同じ Road の非公開 Attempt は一切露出しない**（`experiences/{id}` の `siblings` も
  `is_published = true` に限定）。
- **道そのものに公開 / 非公開の設定は無い（道は公開前提）**。`road.visibility` は 2026-09-09 に廃止。
  公開面に出るかどうかは Attempt の公開＋承認だけで決まる。

### 2.4 個人特定情報（指示書 14）
`users` は指示書 4 の通り氏名・年齢・病名等を必須にしていない（`display_name` は任意）。
公開経験には氏名・アバターを一切含めない（`serializeExperience` は user を参照しない）。
自由記述に個人情報を書いてしまうリスクは、⑥ の公開チェックボックス補足文で注意喚起する。

### 2.5 失敗 Attempt の非自動削除（指示書 2）
`failed` は他の結果と完全に同じ経路で保存・公開される（バリデーション・API・UI 共通）。
アプリ側で `failed` を自動削除・非表示にする処理は一切入れていない。
本人が明示的に行う Attempt 削除・Road 削除（cascade）は許可（指示書 10）。

---

## 3. API の解釈

### 3.1 認証エンドポイントのマッピング
実際の OAuth ダンスは Auth.js の `/api/auth/*`（`/api/auth/signin/google`、
`/api/auth/callback/google`、`/api/auth/signout`）が担当する。
指示書 11 の名前に合わせた薄い入口を用意した:

| 指示書の API | 実装 |
| --- | --- |
| `POST /api/v1/auth/google` | `{ url: "/api/auth/signin/google", googleConfigured }` を返すだけ。実遷移はフロントの `signIn("google")`。 |
| `POST /api/v1/auth/logout` | `signOut({ redirect:false })` を呼び 204。 |
| `GET /api/v1/me` | 現在ユーザー、未ログインは 401。 |

### 3.2 レスポンス形式
- キーは **camelCase**（指示書は JSON ペイロードのフィールド名を規定していないため）。物理カラム名の
  スネークケースは DB 層に閉じている。
- エラーは共通エンベロープ `{ "error": { "code", "message", "details?" } }`。
  `code` は `bad_request` / `unauthorized` / `forbidden` / `not_found` / `conflict` /
  `payload_too_large` / `unsupported_media_type` / `rate_limited` / `internal`。

### 3.3 検索（指示書 13）
MVP はキーワード**部分一致**（Postgres `ILIKE` 相当、Prisma `contains` + `mode:"insensitive"`）
＋ タグ ＋ 結果フィルタ。対象カラムは指示書 13 の通り。
`where` 生成を `src/lib/search.ts#buildExperienceWhere` に一元化し、将来 `pg_trgm` /
ベクトル類似検索へ差し替えやすくした。
`sort=helpful` は投票機能が無いため **enum 宣言順（success, partial, …）を「前向きな結果を先に」の
近似**として使用（ヒューリスティック）。

### 3.4 レート制限
単一プロセス前提の**メモリ内固定ウィンドウ**（`src/lib/ratelimit.ts`）。書き込み系・アップロード・
AI に適用。将来は Upstash 等の共有ストアに差し替え。

---

## 4. 画像・写真は扱わない（画像投稿廃止指示書）

プライバシー保護を最優先し、**ユーザーによる画像・写真の投稿／添付をサービスとして受け付けない**。
「公開時だけ非公開にする」ではなく、画像そのものを入口で持たない設計。

- `attempt_photos` テーブル・`storage_url` / `caption` / `sort_order` を撤去（マイグレーション
  `drop_attempt_photos`）。`attempts` に画像関連カラムは無い。
- 写真 API（`/api/v1/attempts/{id}/photos*`）・`src/lib/storage.ts`・オブジェクトストレージ
  （旧 MinIO）・`@aws-sdk/*` 依存・`STORAGE_*` 環境変数・`next.config` の `images.remotePatterns`
  を削除。`docker-compose.yml` は PostgreSQL のみ。
- 「試したことを記録」フォームの写真添付 UI、経験詳細・自分の道・管理画面の写真表示領域を削除。
  音声入力（画像とは別機能）は維持。
- 経験の中心は文章（困った / やりたい / 試した / 結果 / 現在 / 次）。検索対象も従来どおり
  文章・タグのみで、画像メタデータは対象にしない。

---

## 5. AI（指示書 12）

- 2 エンドポイント: `experience-search` / `summarize-experiences`。
  （`suggest-next-step` = 自分の道の「次に試す材料」提案は MVP で撤去。検索できる実体験に比べて
  一般論になりがちで価値が読めないため。復活させる場合は git 履歴から戻す。）
- `experience-search` は 2026-09-11 に「検索意図の展開」へ拡張（Phase 1）。困りごと文 → 検索語
  （関連語・言い換え・上位語）を返し、`/experiences?ai=1` がその語で既存キーワード検索を横断・
  関連度並べ替えする。AI は経験を生成しない。詳細は下記 2026-09-11 の変更ログと `spec.md` §5.2.1。
- システムプロンプトで **診断・治療方針・医療上の正解・「必ず成功する」等の断定を禁止**。
- `ANTHROPIC_API_KEY` 未設定時は決め打ちのスタブ（キーワード抽出等）を返す。UI からは
  「押したときだけ」呼び、常に非ブロッキング。免責文（`DISCLAIMER`）を必ず添える。
- AI 単独の「答えをもらう画面」は作っていない。②③⑦ の補助として差し込むだけ。

---

## 6. アクセシビリティ（指示書 9）

- ルート要素セレクタは必ず `@layer base`（Tailwind ユーティリティが勝つように）。
- 文字サイズ: `html[data-font-scale]` を切り替える「A 標準/大/特大」トグル、`localStorage` は
  try/catch。
- 結果 5 分類は `RESULT_META`（label + icon 絵文字 + description）で、**色 + アイコン + テキスト**を
  常に併用。
- 音声入力は Web Speech API。未対応・不許可・失敗時は黙って無効化し、テキストのみで完結。
- フォームエラーは文言で説明し `aria-describedby` で関連付け、`role="alert"` / `aria-live` で通知。
- スキップリンク、`lang="ja"`、`maximumScale: 5`（拡大禁止しない）。
- axe-core（serious / critical）を主要 6 画面で E2E チェック（`tests/e2e/a11y.spec.ts`）。

---

## 7. 開発 / E2E 用モックログイン

- `POST /api/test/login`（`DELETE` でログアウト）。`E2E_TEST_LOGIN=true` のときのみ有効、
  それ以外は 404。
- `next-auth/jwt` の `encode` で Auth.js 互換のセッション Cookie を発行し、通常の `auth()` が
  そのまま使える。
- **本番デプロイではこの環境変数を設定しないこと**（README に明記）。Playwright は prod ビルドを
  起動するため `NODE_ENV` では判定できず、フラグ単独で門を開けている。

---

## 7-bis. 公開API・AIクローラー・データ取得対策 (追加指示書 v1)

「公開」と「機械による大量取得」を分ける。人間の検索・閲覧は妨げず、全件取得 /
高速巡回 / データセット化 / 外部AI学習目的の収集を難しくする。100% の防止は目標にせず
複数層を組み合わせる (追加指示書 §1/§18)。

### 実装した層

| 層 | 実体 | 役割 |
| --- | --- | --- |
| Edge ミドルウェア | `src/middleware.ts` + `screenEdgeRequest()` | 環境変数 IP ブロックリスト / 既知 AI クローラー UA を 403 / `X-Robots-Tag` をパス別に付与（トップ `/` は `index,follow`、`/login`・`/me*` は `noindex,nofollow`、`/admin*` は `noindex,nofollow,noarchive` ＋ `Cache-Control: no-store`、その他は `noindex,follow`。すべて `noai, noimageai` を含む。2026-09-10 変更ログ参照） |
| アプリ層ガード (状態あり) | `src/lib/bot-guard.ts#inspectPublicRead` | IP 単位のレート (60s) とバースト (10s)、`page=1,2,3..` の高速連続巡回、同一クエリ連打を検知。段階的に 429 → 一時ブロック (10分)。UA プロファイル: 通常 / UAなし / スクリプト系 (`curl`, `python-requests` 等) で閾値を変える |
| 公開読み取りラッパ | `src/lib/public-api.ts#handlePublicRead` | 5 つの公開 GET (`experiences`, `experiences/{id}`, `experiences/paths`, `tags`, `tags/{id}/experiences`) を包み、ガード + アクセスログ + `X-Robots-Tag` |
| SSR ページガード | `src/lib/page-guard.ts#guardPublicPage` | `/`, `/experiences`, `/experiences/{id}`, `/experiences/paths` の SSR も同じ bot-guard 状態で判定。ブロック時は `RateLimitedNotice` を表示 |
| robots.txt | `src/app/robots.ts` | 一般クローラーは `/api/` と `/admin` のみ Disallow（他ページは巡回可＝`noindex` を読ませる。2026-09-10 に `/me/` `/login` を外した）。既知 AI クローラーはサイト全体を Disallow。`Sitemap:` 行あり。**これ単独は防御にしない** (§8) |
| sitemap.xml | `src/app/sitemap.ts` | トップページ (`/`) 1 件のみ。他の公開ページは各ページの `noindex` で検索除外する |
| ページング上限 | `experienceQuerySchema` (`page ≤ 100`, `limit ≤ 50`) + `MAX_RESULT_WINDOW = 500` | `limit=10000` や深い `page` は 400。`(page-1)*limit ≥ 500` は 400 で絞り込みを促す。SSR (`searchExperiences`) も同じ窓で頭打ち |
| レスポンス最小化 (§6) | `serializeExperience` / paths ルート | `user_id` / `google_sub` / `road_id` などの内部 ID を公開面に出さない。paths のクラスタ識別子は「先頭経験の id」を `key` にする |
| 全件取得 API を作らない (§5) | — | `/experiences/all`, `/export/*` は存在しない。不正 ID (非 UUID) は `assertUuid` で 404 (500 にしない) |
| アクセスログ (§16) | `src/lib/access-log.ts` | timestamp / endpoint / method / status / bytes / 匿名化クライアント (ソルト付き FNV ハッシュ) / UA / rate 状態。生 IP・認証情報は保存しない。直近 500 件をメモリ保持 (将来の管理画面用) |
| 運用フック (§17) | `bot-guard`: `blockClient` / `unblockClient` / `listBlocked` / `listRecentClients`、`access-log`: `recentAccess` | 管理画面は未実装だが、IP 制限・一時ブロック・異常確認を後から載せられる関数を用意 |
| 利用規約 (§12) | `src/app/terms/page.tsx` (`/terms`、フッターから導線) | 機械的大量取得の禁止、外部 AI の学習・FT・データセット化目的の収集の禁止を明示。できる道内部 AI は運営者が定めた目的の範囲内として区別。「正式な法的文書化の際は専門家確認」と注記 |
| CORS (§11) | — | フロントは同一オリジン (Next フルスタック)。公開 API に CORS ヘッダを一切付けない = ブラウザからのクロスオリジン読み取り不可。`Access-Control-Allow-Origin: *` は採用しない |
| AI API と公開 API の分離 (§14) | ルーティング上の分離 | `/api/v1/ai/*` はレート厳格 + スタブ。`GET /api/v1/experiences` の大量取得で学習データを作れる前提の設計にしない |

### 閾値 (暫定・負荷試験で調整前提)

- 通常 UA: 100 req/60s, 25 req/10s
- ページ SSR: 200 req/60s, 40 req/10s
- スクリプト系 UA (`curl`/`python-requests`/`scrapy` 等): 30/60s, 8/10s
- UA なし: 40/60s, 10/10s
- `page=N,N+1,...` を 3 秒以内間隔で 8 連続 → 即・一時ブロック
- 同一クエリを 3 秒以内間隔で 25 連続 → strike
- strike 3 回 (5 分窓) → 一時ブロック 10 分

### 限界 (§18)

- bot-guard / access-log はメモリ内・単一プロセス前提。水平スケール時は Redis 等へ。
- ミドルウェアは Edge でインスタンス間の状態共有ができないため、レート制限の主担当は
  Node ランタイムの `handlePublicRead` / `guardPublicPage` に置いた。ミドルウェアは
  ステートレスな UA / IP ブロックと `X-Robots-Tag` のみ。
- 人間に完全公開した情報の 100% の取得防止はできない。上記は「難しくする」ための多層防御。

### テスト時の隔離

`E2E_TEST_LOGIN=true` のとき、`x-dekiru-client` ヘッダでガードのクライアント識別子を
上書きできる (`resolveClientId` / `guardPublicPage`)。レート制限の E2E を他テストから隔離する用途。
`DELETE /api/test/login` で `resetBotGuard()` / `resetAccessLog()` も実行する。

---

## 7-quinquies. 「経験を探す」を「道の集合」として見せる (UI修正指示書「道の集合」)

`/experiences` を「件数・方法の一覧」から「この困りごとへのいろいろな**道**」へ再フレーム。
コピーとカードの見せ方のみ変更。検索ロジック・API・DB・ページング・並び順は不変。

- 見出し: 結果の上に `<h2>「{q}」への、いろいろな道</h2>`（q なしは「いろいろな道」）＋
  「同じことに困った人が、それぞれ違う方法を試しています。うまくいかなかった道も…含まれます。」
- 件数は主役から降格。`aria-live` の補足行で「{total} の経験から、それぞれの道を見られます。」
  （数は「経験」に付け、「N の道」と断定しない ＝ §10 のフォールバック）。
- `<h1>経験を探す</h1>` の下に「できなくなったことや困ったことから、いろいろな人の『道』を探せます。」
- `ExperienceCard`: 先頭に「だれかの道」、末尾に「この道を見る →」。カード＝方法一覧ではなく
  **一人の道の入口**（クリック先は v2 の枝分かれ詳細）。方法A/B の番号は付けない。
- 「道集合 / Road Collection / Path Group」等のシステム用語は UI に出さない（§13）。設計思想としてのみ。
- 5 分類すべてを「道」として対等表示（成功一覧にしない）。空/上限メッセージも「道」表現に統一。

### データ判断 (§14)

**当初は「1 カード＝公開 Attempt 1 件」のままとしたが、その後ユーザー指示で「道（困りごと）別」へ変更。**

- 「経験を探す」(`/experiences`) の**道カード**は **1 枚＝1 Road**（一人の困りごと＋その人が公開した
  複数の「試したこと」＋各結果）。`searchRoads()`（[src/lib/queries.ts](../src/lib/queries.ts)）+
  `buildRoadLevelSearchWhere()`（[src/lib/search.ts](../src/lib/search.ts)）+
  [src/components/road-card.tsx](../src/components/road-card.tsx)。方法本文に当たった記録は別途
  **方法カード**（`MethodCard`）で出す（下の「検索語の当たり場所で…出し分ける」追記を参照）。
- `roadId` によるグルーピングは推測ではない（`Attempt.roadId` は実 FK、1 Road = 1 人）。
  道カードの検索対象は「公開 Attempt を 1 つ以上持つ Road」で、road フィールド（difficulty /
  situation / goal / previouslyAble）/ タグ に検索語が当たるもの。`result` フィルタ =
  「その Road にその結果の公開 Attempt があるか」。
- **ページング・件数は「道」単位**（`total` = マッチした Road 数）。深いページング上限
  （`MAX_RESULT_WINDOW`）も踏襲。
- 並び順: DB は `road.updatedAt desc`。`helpful` は「最も前向きな結果を持つ道を先に」、
  `tried` は「最後に試した日が新しい道を先に」を **JS 側で** 再ソート（Road をまたぐ nested 集約が
  Prisma で難しいため）。
- カードのリンク先 (`entryId`) = その道の **最初に試したこと**（時系列先頭の公開 Attempt）。
  詳細ページ（v2 の枝分かれ）でその人の道全体（幹→枝→現在）を見せる。
- **`GET /api/v1/experiences`（Attempt 単位）は変更していない。** 道単位は SSR ページ専用
  (`searchRoads`)。REST で道単位が要るなら `?groupBy=road` 等を後から追加できる。
- E2E がスイート全体で 1 クライアント扱いになり Bot ガードで自己スロットリングするのを避けるため、
  `E2E_TEST_LOGIN=true` かつ `x-dekiru-client: e2e-default`（Playwright の `extraHTTPHeaders`）の
  ときはガードを通す。レート制限を検証するテストは `x-dekiru-client` を個別に上書きする。

### 追記：検索語の当たり場所で「道カード」と「方法カード」を出し分ける（指示）

検索語（`q`）がどこに当たったかで結果カードの種類を変える。両方に当たる道は両方出す。

- **ページ（Road）側に当たった**（difficulty=できなくなった / goal=やりたいこと / situation / previouslyAble
  / タグ）→ **道カード**（`RoadCard`）。従来どおり `/experiences/{entryId}` へ。
  `searchRoads()` の where を `buildRoadLevelSearchWhere()` に変更（method/memo マッチを外した）。
  `q` が無いときは従来と同じ（公開 Attempt を持つ道すべて）。旧 `buildRoadSearchWhere` は削除。
- **方法（Attempt）の中に当たった**（method=試したこと本文 / memo=気づき）→ **方法カード**
  （`MethodCard`。枠線・背景は道詳細ツリーの方法カードと同じ緑＝`--color-primary` /
  `--color-primary-soft`）。カードにはその方法の内容を出し、タップで **その方法が実際に見えるページ**の
  経験詳細へ。道詳細ツリーが 10 件ごとに分割されている場合は `?p=N` 付きで、その方法が載っている
  ページを開く（`searchMethods` が `treePageByAttempt()` で `buildRoadDetailRows` の並びから
  ページ番号を算出し `MethodCardDTO.treePage` に入れる）。`buildMethodSearchWhere()`（公開 Attempt のみ）。
- 方法カードも道カードと**独立にページ送り**する。クエリは `mp`（道は `page`）。
  1 ページ `limit` 件、深さ上限は道カードと同じ（`mp ≤ 100`、`(mp-1)*limit < MAX_RESULT_WINDOW`、
  超で「もう少し絞り込んでください」）。`Pagination` は `param: "page" | "mp"` で共用。
  `page`↔`mp` はリンクで相互に保持されるので、道を送っても方法のページは動かない（逆も同じ）。
- **表示する種類を選べる**：絞り込みフォームに `kind` を追加。表示順は `road` → `method` → `both`
  （道・方法・両方）。**既定は `road`（道だけ）**。方法カードは検索語を入れて `both` / `method` に切り替えたときだけ出る
  （方法カード＝検索語のマッチ結果なので、初期表示や語なしでは意味がない）。
  `road` なら方法セクション、`method` なら道セクションを出さない。検索語が無いあいだは種類セレクトを
  無効化して「道だけ」を表示（実際の結果と一致させる）。`EXPERIENCE_KINDS` /
  `EXPERIENCE_KIND_DEFAULT` / `EXPERIENCE_KIND_LABEL`（[src/lib/constants.ts](../src/lib/constants.ts)）。
- **検索ワードと絞り込みを 1 フォームに統合**：以前は `SearchBox`（別フォーム）＋ `<form method=get>`
  で分かれており、「この条件で探す」を押すと入力中の検索ワードが失われた。`/experiences` 用に
  `ExperienceSearchForm`（client、`src/components/experience-search-form.tsx`）を作り、検索欄＋
  種類/結果/タグ/並び順＋送信を 1 つに。送信で URL を組み立てて遷移（`page`/`mp` は付けない＝
  1 ページ目に戻す）。トップページの `SearchBox`（hero）はそのまま。
- 両セクションとも空なら従来の「まだ道が見つかりませんでした」。道側だけ 0 件で方法側にある場合は
  道セクションに「困りごと・目標に当てはまる道はありませんでした」と出す。
- API（`GET /api/v1/experiences`, Attempt 単位）は不変。出し分けは SSR ページ専用。

---

## 7-quater. 「この人がたどった道」カード内を枝分かれ化 (UI修正指示書 v2)

経験詳細を、v1 の「この人がたどった道（縦タイムライン）＋ 同じ困りごとへの道（別セクション）」から、
**「この人がたどった道」カード 1 つの中で、その人の試行錯誤が枝分かれして見える**構成へ変更。

- カード内: 幹（以前できていた → できなくなった → やりたいこと）→ その人が公開した各方法（枝: method + result + 日付）→ **現在**（`road.progress` / `road.nextAction`）へ合流。
- v1 の独立セクション「同じ困りごとへの道」は撤去（追加指示書 v2 §12）。他人の経験の補足枠は MVP では作らない。
- 縦タイムライン（`StepFlow`）は経験詳細から撤去。いま見ている方法の気づき（`memo`）は該当する枝カードの中に表示。
- コンポーネントは [src/components/branching-paths.tsx](../src/components/branching-paths.tsx) を拡張（`present` = 現在ノード、`Branch.note`、`heading: null` 可、`branchPointLabel`）。`/experiences/paths` は従来どおり `dense`。
- 経験詳細ページ幅を `max-w-6xl`（〜1150px）へ。読み物パート（戻る/見出し/写真/注意書き/CTA）は `max-w-3xl` を維持。

### データ上の制約と、実装した範囲 (追加指示書 v2 §15/§16)

- 現状の `Attempt` には **親子関係・試行順序の関係が無い**（あるのは `tried_at` / `created_at` のみ）。
  そのため「方法B の後に方法B-2 を試した」という**多段のネストは表示しない**。
  枝は「やりたいこと」から**並列に 1 段だけ**分岐し、並び順は `tried_at`（null は末尾）→ `created_at` の
  **時系列**（因果ではない。UI は「A が原因で B を試した」とは主張しない）。
- 「現在」への合流は、特定の 1 本の枝からではなく**枝グリッド全体から**線を引く
  （§9「無理に一本へ統合しない」）。
- **ネストを表現したい場合の変更案**（未実装）:
  `Attempt.parentAttemptId String? @db.Uuid`（自己参照 FK）を追加 → `serializeExperience` /
  `experiences/{id}` の `siblings` に `parentId` を含める → `BranchingPaths` を再帰描画に拡張。
  DB マイグレーション + API 追加 + UI 変更が必要なため MVP では見送り。
- 公開経験ページで見えるのは **公開 Attempt のみ**（非公開の試行は幹にも枝にも出さない）。

---

## 7-sexies. 枝分かれラインの視認性（＋レール型は撤回）

**経緯:**
1. 「ラインの視認性改善」指示 → 1px の border 線を **テーマ緑の太線**（通常 3px / 幹・分岐・合流 4px）＋
   分岐点・合流点のドット（8〜12px）＋水平バー（`ForkBar`）に変更。レイアウト（PC 横 grid `lg:grid-cols-3`、
   縦の線片、中央寄せ）は維持。プリミティブ: `Line` / `Dot` / `ForkBar`。
2. 「実際につながった道」指示 → 連続 `border-left` のレール型へ全面再構成（左縦一本＋各カードへ横接続、
   `RailItem` / CSS コーナー）。
3. **「レール型は指定外の変更。元の入れ方に戻し、太く・濃くだけ残す」指示** → #2 を全て撤回し
   #1 の状態（`Line`/`Dot`/`ForkBar` ＋ 横 grid ＋ 縦の線片）へ戻した。
4. **「元の方式のまま、途切れている隙間だけつなげる」指示** → 方式は変えずに:
   図全体を 1 つの隙間なし `flex flex-col` に入れて `space-y-4` の 16px 隙間を除去、
   `ForkBar` を `w-4/5 max-w-md` → `w-full`（左右の枝の縦線まで届くよう「延長」）、
   グリッドの `gap-y` を 0、枝カードを `h-full` → `w-full grow`（同じ行で高さをそろえる）。
5. **「完全接続」指示** → `ForkBar` を全幅化、各枝の上下に縦線を追加、`grow` で高さをそろえ端を接触。
6. **「縦型・樹形タイムライン」指示** → 横 3 列 grid をやめ、**縦の樹形（ファイルツリー型）** に変更:
   - `Guide`（連続 `border-left` 3px, テーマ緑）＝ level-0 の縦スパイン。
     以前できていた → できなくなった → やりたいこと → 現在 → 次に試すこと が `TreeItem` として
     横ティック＋接続ドットでぶら下がる。
   - 方法は「やりたいこと」`<li>` 内にネストした level-1 `Guide` に **縦に積む**（`TreeItem`）。
     件数が増えても横に広がらず下へ伸びるだけ（§6/§15）。3 列固定は廃止（§21）。
   - level-0 → level-1 は `BranchCorner`（CSS の `border-l`+`border-b`+`rounded-bl`）でつなぐ。
   - ティックはガイド〜カード左端まで届き、カード内部には入らない（§12/§13）。
   - カードのデザイン・文言・色・`ResultBadge`・「詳しく見る」・実装方式（CSS border、SVG/Canvas なし）は不変。
   - 方法B→方法B-2 のような多段ネストはデータに親子関係が無いので作らない（§10/§20）。全方法は
     「やりたいこと」直下の同階層。「現在」への合流も特定の 1 方法からは引かず、スパインが引き継ぐ。
7. **「一本の綺麗な道に整える」指示** → 樹形は維持しつつ線を整理:
   - 幹線を **1 本だけ**に（level-0＋level-1 の二重線を廃止 §13、`BranchCorner` 削除）。
   - 全項目（幹ノード・方法カード・現在）が **その 1 本の `Guide`** に `TreeItem` でぶら下がる。
     `variant="trunk"` は短いアーム（1.5rem）、`variant="branch"`（方法）は長いアーム（2.75rem）で
     幹から外側へ枝分かれして見える。方法は全て同アーム＝同一階層（順番に見えない §6）。
   - ティック＋円形ノードは全項目で 3px・緑・サイズ統一。`TreeItem` の `depth` を子階層用に用意
     （方法B-2 等。データに親子関係が無いので MVP 未使用）。
   カード・文言・色・実装方式（CSS border のみ、SVG/Canvas なし）は不変。**現状はこれ。**

- 線はテーマ緑 `--color-primary` のみ（新色なし）。通常 3px、幹・分岐・合流 4px、ドット 8〜12px。
- 分岐: `Line`(4px) → `Dot` → `ForkBar`（複数のとき）→ ラベル。枝は `grid ... lg:grid-cols-3`、
  各枝の上に `Line`(3px)+`Dot`。合流: `ForkBar` → `Dot` → `Line`(4px) → 「現在」→「次に試すこと」。
- すべて通常フローの `<span>`（`aria-hidden`）。意味は見出し・方法名・結果の文字で伝わる。
- データにない親子（方法B→方法B-2）や合流の統合は引かない（7-quater と同じ）。

---

## 7-ter. 「道の見える化」= 枝分かれ型フロー (UI修正指示書)

経験詳細 (`/experiences/[id]`) の「同じ困りごとへの方法」を、方法を選ぶと上のフローが
差し替わる方式から、**幹（困りごと）から枝（各方法）へ分かれる図**へ変更。

- コンポーネント: [src/components/branching-paths.tsx](../src/components/branching-paths.tsx)（サーバーコンポーネント、クライアント JS なし）
- 幹 = `previouslyAble → difficulty → goal`（共通文脈を 1 回だけ表示）
- 枝 = 各公開 Attempt（`method` + `ResultBadge`）。5 分類すべてを**同じ大きさ**で並べる（「正解」を作らない）。
  失敗・変化なしの枝も消さない。
- 枝クリック → `/experiences/{attemptId}` へ遷移（フロー全体は差し替えない）。
  現在表示中の枝はリンクにせず `aria-current` + チップ表示。
- 交差する線は描かず、幹の縦フロー＋「ここから道が分かれています」＋レスポンシブなカードグリッド
  （PC 横並び `sm:grid-cols-2 lg:grid-cols-3` / スマホ 1 列縦）で「枝」を表現。経験が増えても折り返すだけ。
- 将来の「方法からさらに方法へ」の入れ子に備え `BranchNode` は子を受け取れる構造だが MVP では未使用
  （Road/Attempt はフラットのまま。新しいグラフテーブルは追加しない）。
- `/experiences/paths`（一覧）も同じコンポーネントの `dense` 表示に統一。
- 経験詳細ページは枝分かれ表示のため `max-w-5xl` に拡張。読み物パート（③⑤⑥）は内側 `max-w-3xl` を維持。
- 「この人がたどった道」= 一人の時系列、「同じ困りごとへの道」= 複数人の比較、と役割を小見出し＋説明文で明示。
- API 変更なし（`experiences/{id}` の `siblings` と `experiences/paths` をそのまま利用）。

---

## 7-septies. できた％ / 気持ち / 方法のつながり (追加指示書 v6)

`User → Road → Attempt` の基本設計を維持したまま `Attempt` に 5 カラム追加。

- Migration `20260901020330_attempt_percent_feeling_chain`:
  `achievement_percent INT NULL` / `feeling TEXT NULL` / `state_after TEXT NULL` /
  `next_action TEXT NULL` / `previous_attempt_id UUID NULL`（自己参照 FK, `ON DELETE SET NULL`）。
  CHECK 制約を手書きで追記: `achievement_percent` は 0〜100、`previous_attempt_id <> id`。
- **できた％（`achievement_percent`）は本人入力のみ**。AI で推定・自動計算しない。`result` から機械的に
  決めない（`result=partial` × `percent=90` も有効）。ランキング等には使わない（§25）。
- **気持ち（`feeling`）も本人入力**。AI で生成・補完しない（§26）。5 分類すべてで入力可（失敗の気持ちも残す）。
- `previous_attempt_id` は **実際のつながりが確定しているものだけ**。日付や画面の並びから推測して
  設定しない（`src/lib/attempts.ts#assertValidPreviousAttempt`：同じ Road のみ / 自己参照不可 /
  存在必須 / 循環不可）。UI（`BranchingPaths`）は `previous_attempt_id` があるものだけ親の下へ
  インデントし、「方法B-2」のように入れ子ラベルを付ける。無ければ全て「やりたいこと」直下の同階層。
- 「その後の状態」の切り分け（§17）: Attempt ごと = `state_after`、Road 全体の現在状態 = 既存 `Road.status`。
  「次に試すこと」: Attempt 起点 = `Attempt.next_action`（カード内表示）、Road 全体 = 既存
  `Road.next_action`（幹の末尾ノード）。既存 Road 項目は削除しない。
- 検索条件には `achievement_percent` / `feeling` を **入れない**（§32）。
- 公開範囲: 公開 Attempt では v6 項目も経験の公開情報として返す。非公開 Attempt の v6 項目は
  API から一切出さない（`serializeExperience` は公開 Attempt のみ、`getExperience` の `siblings` も
  `isPublished: true` 限定 = 既存のまま §21/§33）。
- 記録フォーム（`attempt-form.tsx`）: できた度は「記録する」チェック + スライダー（0〜100, step 5）で
  未入力=NULL。気持ち/その後/次に試すこと/前に試した方法(select) はすべて任意（§23）。
- API `POST /roads/{id}/attempts` と `PATCH /attempts/{id}` を拡張（新規エンドポイントなし）。
- 別ユーザーの Attempt を同じ Road につながない（`previous_attempt_id` の Road 一致チェックで担保）。

---

## 7-octies. 道の詳細を再構築・「現在」を方法カードの中へ (再作成指示書「方法の中に現在を含める」)

7-septies 以前は「現在」「次に試すこと」を全方法の下の共通ノードに置いていた。部分修正の積み重ねで
枝判定が複雑化したため、道の詳細（`branching-paths.tsx`）の表示構造を一度整理して再構築した。
対象は `branching-paths.tsx` / `experiences/[id]/page.tsx` / 新規 `src/lib/road-detail.ts` のみ。
他画面・API・DB・色・フォントは変更しない。

- **基本構造**：以前できていた → できなくなった → やりたいこと（＝幹の読むだけノード）→
  各方法カード。1 枚のカードの中身は **方法 → 結果 → できた％ → そのときの気持ち → 現在 →
  次に試すこと**。値が無い項目は行ごと出さない（既存データが全部 null でも壊れない）。
- **「現在」を Road 全体の独立ノードにしない**。その方法を試した結果として、方法カードの中に
  「現在：」として置く。文面は原則その Attempt の `state_after`。`state_after` が無ければ
  「現在」を出さない。`Road.progress` を全カードにコピーしない。
- **`state_after` は道の詳細では「その後：」ではなく「現在：」に統一**（重複表示しない）。
  DB フィールドは削除しない。本人の道ページ（`/me/roads/[roadId]`）の「その後：」表示は対象外。
- **`Road.progress` の補完は 1 箇所だけ**：明示された「いまの経験」（`isCurrent`。URL で確定した
  経験。日付・成功率・登録順からの推測ではない）の枝の葉に `state_after` が無いとき、その葉の
  「現在」を `Road.progress` で補完する。他の方法には出さない。
- **親子は `previous_attempt_id` が同じ集合内を指すときだけ**接続し、`方法A-2` のように入れ子
  ラベル＋インデントで「次の方法」へ線をつなぐ。日付では接続しない。別 Road / 別ユーザーの
  Attempt はそもそも `siblings`（同 Road・公開のみ）に入らない＝接続されない。
- `tried_at` は行の**並び順**を決めるためだけ（因果や「いまの枝」の判定には使わない）。
- **ViewModel 化**：ツリー判定を UI から出し、`src/lib/road-detail.ts#buildRoadDetailRows(branches,
  progress?)` が描画順に並んだ行（`branch` / `label` / `depth` / `currentState` / `isLastRow`）を返す。
  `currentState` はここで解決済み。ユニットテスト `tests/unit/road-detail.test.ts`（ケース A〜G）。
- `BranchingPaths` の `present` prop は `{ progress }` のみ。`convergeLabel` / `hideStateAfter` は廃止。
  `dense`（道の見える化一覧）では `progress` 補完をしない（`state_after` があるときだけ「現在」）。
- AI で「現在」「できた％」「気持ち」を推測・生成しない（7-septies を踏襲）。

### 追記：経験詳細では全方法をそのまま表示（タップ選択・詳細遷移を挟まない）

指示「方法をタップで選択して表示とさせずに、全てそのまま表示させる」。

- 経験詳細（`dense=false`）では各方法カードをリンクにせず、「詳しく見る →」も出さない。
  中身（方法・結果・できた％・そのときの気持ち・気づき・現在・次に試すこと）を最初から全部表示。
- そのため `siblings` にも `note`（= `Attempt.memo` の気づき）を持たせ、全方法で表示できるようにした
  （`ExperienceSibling.note` / `serializeExperience`）。公開 Attempt のみなのは従来どおり。
- 道の見える化の**一覧**（`/experiences/paths`, `dense=true`）は情報を絞っているので、各カードは
  その経験の詳細への導線（リンク＋「詳しく見る →」）を残す。
- `BranchingPaths` の `linkCurrent` prop は廃止（詳細ではどのカードもリンクにしないため不要）。
- **「いま見ている道」のチップは廃止**。強調分けもしない：経験詳細の方法カードは**どれも同じ見た目**
  （緑の枠線＋淡い緑 `primary-soft` の下地）でそろえる（全部が同じ 1 本の道の一部なので）。
  読み上げ用に、開いている経験のカードにだけ `aria-current="true"` と
  sr-only「（この経験を表示中）」を残す（見た目の差は付けない）。一覧（`dense`）のカードは従来どおり。

### 追記：方法ブロックが 11 件以上のときは「表示上」10 件ごとにページ分割

指示「道の詳細：表示上の10ブロックごとのページ切り替え」。

- 1 ブロック = ツリー上の 1 方法（1 行）。幹ノードは数えず、どのページにも文脈として出す。
- `src/lib/road-detail.ts#paginateDetailRows(allRows, page)` が
  `buildRoadDetailRows` の**表示順のまま** `DETAIL_PAGE_SIZE=10` 件を目安に区切る。
  親子関係・並び・`state_after`＝現在・できた％・気持ち・次に試すことは一切変えない。
  （後述「枝分かれ（親子）をページ境界で分断しない」で、10 は絶対境界ではなく目安に変更。）
- チェーン（`previous_attempt_id`）がページ境界をまたぐと、次ページ先頭に
  「← 「方法X」からの続き」（親ラベル）と、前ページ末尾に「↓ この先は次のページに続きます」を出す。
  **表示上の補助だけで、新しい枝も親子関係の書き換えもしない。**
- ページは URL クエリ `?p=N`（`/experiences/[id]`）でサーバー描画。JS 不要・戻る操作可。
  DB にページ番号は持たない。API（`getExperience`）も変更なし＝まず道の全公開 Attempt を取得して
  ツリーを完成させてから 10 件ずつ表示（「先に 10 件だけ取得」はしない）。
- 10 件以下ならページ送り UI は出さない。`dense`（一覧）はページ分割しない。
- `BranchingPaths` に `page` / `pageHref` prop を追加（`pageHref` が無ければ分割しない）。
- テスト：`road-detail.test.ts`（10/11/20/21・クランプ・境界チェーン・値の保持）、
  `branching-paths.spec.ts`（12 方法の道で 1↔2 ページ遷移と続き表示）。

### 追記：枝分かれ（親子）をページ境界で分断しない

指示「道の見える化 ページング修正指示書 v1」。10 件で機械的に区切ると「方法J」と「方法J-2」の
ような枝分かれがページをまたぐ問題があったため、**ページ境界より枝のまとまりを優先**する方式へ変更。
データの並び順・sort・親子関係・DB・API・検索・結果 5 分類は不変。フロントの分割ロジックのみ。

- `buildRoadDetailRows` は root（`depth === 0`）ごとに、その部分木を表示順で連続させて返す。
  この「root の部分木」を **1 グループ**として扱う（親＋`previous_attempt_id` でつながる子孫は不可分）。
- `src/lib/road-detail.ts#splitDetailRowsIntoPages(all, pageSize=10)` を新設。グループ単位で
  ページへ詰める。優先順位は ① 親子・枝分かれの連続 → ② グループのまとまり → ③ 1 ページ ≒ 10 行。
  - ページに行があるうちは、次グループを足すと 10 を超えても、`pageSize` 未満なら詰める
    （→ 11・12 行などを許容）。ページが `pageSize` に達したら次グループは次ページ先頭へ。
  - 1 グループが `pageSize × 1.5`（＝ 15）を超える大きさになる場合は、そのグループ全体を
    次ページ先頭へ送る（ページが異常に長くならないように）。単独でも 10 を超えるグループは
    分割せずそのグループだけで 1 ページにする。
- `paginateDetailRows` は `splitDetailRowsIntoPages` の結果からページを 1 枚取り出すだけ。
  `pageCount` は実際に生成されたページ数。グループは分割しないので `continuesFromLabel` は
  通常付かない（保険として判定コードは残置）。
- `src/lib/queries.ts#treePageByAttempt`（方法カードの `treePage`）も同じ
  `splitDetailRowsIntoPages` を使い、リンク先ページと表示ページが一致するようにした。
- テスト追加：`road-detail.test.ts`（10 件目に親＋子 2＝同ページ／9 件目に親＝同ページ／
  次の独立グループは次ページ・先頭が子にならない／巨大な枝はグループごと次ページ）、
  `branching-paths.spec.ts`（12 方法・11 件目が 10 件目の子＝方法J と方法J-2 は同ページ、
  2 ページ目は方法K だけ・「続き」表示なし）。

### 追記：枝の接続点をカード左枠線の中央に「半円」で表示する

指示「枝の接続点をカード左側の枠線の真ん中に（丸の位置はほぼ変えず）」。線のルート・親子関係・
ページングは不変、`branching-paths.tsx` の `TreeItem` の**接続部の見た目だけ**変更。

- 幹線（`Spine`）は各行が自分の分（`left-0`。全行そろうので連続した 1 本に見える）を描く。
  `first` は最初のノード中央あたりから下へ、`last` はカード左枠中央（行の 50%）で止める。
- 各行：幹線 → 横線でカードの**左枠**へ → カード左枠線の**縦中央**に円を置く。円の右半分は
  後から描かれる不透明カードが隠すので「左枠線に食い込んだ半円」に見える（`z-index` ではなく
  DOM 順＋カードの不透明背景で実現）。「線の先に丸が付いている」表示ではなくなった。
- 線・接続点の色は幹線と同じ `--color-primary`、太さ 3px。カードの角丸・枠線はそのまま。
- インデントの深い子（方法B-2 等）は横線が長くなるだけで、幹線の位置は動かない。
- 幹ノード（以前できていた等）も方法カードも同じ接続表現。ページ 2 でも同じ。

**確認したエラーの実体**：`RoadWizard` は Road の `title` をフォームに出さず、`title` に
`difficulty || goal` の**全文**を送っていた。`roadCreateSchema.title` は 120 文字以内のため、
「できなくなったこと」を 120 文字より長く書くと `POST /api/v1/roads` が
`400 {field:"title"}` を返し、画面には見出しの無い `title` フィールドのエラーが割り当たって
「入力内容を確認してください」だけが出て直しようがなくなっていた。API / DB / 認証 / 遷移は
それ以外に不具合なし（クリーンビルドで一連のフロー成立を確認）。

- **`title` は送らない**。DB・スキーマとも任意（`title String?` / `trimmedOptional`）で、表示は
  すべて `road.title ?? road.difficulty ?? "（無題の道）"` にフォールバックする。短い見出しが
  欲しい人は道の編集で個別に付けられる（指示書「タイトルを何度も入力させない」）。
- 段階ウィザード（3 ステップ）を廃止し、`src/components/road-form.tsx` の **1 画面フォーム**へ。
  必須は「できなくなったこと」または「できるようになりたいこと」のどちらか。他は任意。
- 送信は `<form onSubmit>`。`submitting` ガード＋ボタン無効化＋`aria-busy` で二重送信を防ぐ
  （サーバ側の重複防止はスキーマ変更が要るため今回の範囲外。フロントで担保）。
- 失敗しても入力状態は保持。エラーは種別で文言を出し分け（`messageForError`）:
  `unauthorized` / `forbidden` / `not_found` / `rate_limited` / `bad_request` / その他 /
  非 `ClientApiError`（通信断）。alert に「入力内容は残っています」を併記し、alert へフォーカス。
- 成功時は `router.push(\`/me/roads/${road.id}\`)` で**作成した id を明示して**遷移（一覧から推測しない）。
- この画面では Road のみ作成。Attempt は作らない（方法・結果・できた％・気持ち・現在・
  次に試すことは以降の「試したことを記録」で入力）。
- 対象は `road-form.tsx`（新規）/ `me/roads/new/page.tsx` / `critical-flow.spec.ts` /
  新規 `tests/e2e/road-create.spec.ts`（必須空・長文・連打）。API・DB・バリデーション・他画面は変更なし。
- `RoadWizard`（`road-wizard.tsx`）は削除。

### 追記：もう 1 つの作成エラー（`roads_user_id_fkey` 違反）

利用者の環境で `prisma.road.create()` が `Foreign key constraint violated: roads_user_id_fkey`
（＝ `internal` 500 → 画面は「道を作成できませんでした」）になっていた。原因は
**セッション (JWT) が指す `user.id` が DB に存在しない**こと。JWT の `uid` は Google 初回
サインイン時（`auth.ts` の `jwt` コールバック）またはモックログイン時に一度だけ upsert される。
開発 DB の再シード / リセットや、別環境で発行された Cookie が残っていると、`uid` だけが生き残り、
`requireUserId()` はその id をそのまま返していた。

- 修正：`requireUserId()` で `prisma.user.findUnique({ id })` を確認し、無ければ
  `ApiError("unauthorized")`（＝ 401）。FK 違反の 500 ではなく再ログインを促す。
  `getOptionalUserId()`（公開・任意ログイン系）は DB を引かないまま（書き込みしないため）。
- `road-form.tsx` は `unauthorized` のとき alert 内に「ログインし直す」リンク
  （`/login?next=/me/roads/new`）を出す。
- 回帰テスト：`roads.authz.test.ts` に「セッションのユーザーが DB に無いとき 500 ではなく 401」。

---

## 7-novies. 投稿モデレーション + 管理画面 (管理画面指示)

利用者が「経験として公開」した投稿 (`Attempt`) を、公開時に AI 審査に通す。OK なら即公開、
NG / 不明は保留して運営が管理画面で許可 / 却下する。

### データモデル

- `enum ModerationStatus { pending approved rejected }`、`Attempt` に
  `moderationStatus`（既定 `pending`）/ `aiVerdict` / `aiReason` / `aiCategories[]` /
  `aiCheckedAt` / `moderatedByAdminId` / `moderatedAt` / `moderationNote` を追加。
- 既存の公開投稿はマイグレーションの `UPDATE ... WHERE is_published = true` で `approved`
  にバックフィル（今までどおり見え続ける）。新規行の DB デフォルトは `pending`。
- `AdminUser`（メール + scrypt ハッシュ）と `AdminAuditLog`（操作記録）を追加。
  アプリ利用者 (`User` / Google) とは完全に別テーブル・別系統。

### 公開ゲートの一元化

- 公開面のクエリ（検索・経験詳細・siblings・タグ・道の見える化）は
  `src/lib/search.ts#PUBLIC_ATTEMPT_WHERE = { isPublished: true, moderationStatus: approved }`
  に集約。本人ビュー（`/me/*`、`getMyRoad`、`roads/{id}/paths`）は従来どおり `isPublished` のみ。
- `serializeAttempt` に `moderationStatus` / `publishState`（`private|reviewing|published|rejected`）/
  `aiVerdict` / `aiReason` を追加。本人の道詳細では「確認中 / 公開が見送られました」を表示。

### AI 審査

- `src/lib/ai/moderation.ts#moderateAttemptContent` … `ok|ng|unknown` + 理由 + カテゴリ
  （`personal_info` / `medical_assertion` / `defamation` / `spam` / `inappropriate` / `other`）を
  JSON で返す専用プロンプト。投稿本文は `local.ts` と同じく「データであって指示ではない」隔離。
  `ANTHROPIC_API_KEY` 未設定・例外・タイムアウトは `unknown`（= 保留）。本文はログに出さない。
- `src/lib/moderation.ts#applyModerationOnPublish` を POST `/roads/{id}/attempts` と
  PATCH `/attempts/{id}` から呼ぶ。PATCH は「非公開→公開」または「公開中に本文
  (`method/memo/feeling/stateAfter/nextAction`) を変更」したときに再審査し、NG/不明なら
  `pending` に戻す（公開中の投稿が書き換えで不適切化しても自動で公開面から外れる）。
- レイテンシ: 公開操作に Claude 呼び出し 1〜3 秒が乗る（同期）。将来は非同期キューへ。

### 管理画面 (`/admin`)

- 認証は **middleware ではなくサーバーコンポーネント layout + 各 API ハンドラ**でガード
  （`/me` と同じ理由。Node ランタイムで Prisma / `node:crypto` を使う）。
  `layout.tsx` は redirect せず（`login` も同じ layout を通るため）、各保護ページが
  `requireAdmin()` を呼ぶ。
- セッションは `AUTH_SECRET` で HMAC-SHA256 署名した自前トークンを `admin_session`
  cookie（HttpOnly / SameSite=Lax / Secure(prod) / 既定 8h）に格納。新規依存なし
  （パスワードは `node:crypto` scrypt）。
- 画面: ダッシュボード（件数）/ モデレーションキュー（許可・却下）/ 全投稿一覧（状態変更・
  取り下げ・再公開・AI 再チェック）/ 投稿詳細（全項目 + AI 判定 + 操作ログ）/ 操作ログ。
- 操作はすべて `AdminAuditLog` に記録（`login` / `approve` / `reject` / `unpublish` /
  `republish` / `recheck`）。
- 初期管理者は `npm run admin:create -- <email> <password>` か、dev は `npm run db:seed`
  （`ADMIN_EMAIL` / `ADMIN_PASSWORD`、既定 `admin@example.com` / `dekiru-admin`）。
- `robots.ts` に `/admin/` を Disallow 追加。

### 道 (Road) の内容モデレーション（管理画面指示・追補）

> ⚠️ この節は 2026-09-09 に**撤回**した（§8 の変更ログ参照）。道はモデレーション状態を持たず、
> 道が公開面に出るかは「承認済みの公開経験を 1 つ以上持つか」だけで決まる。道のタイトル・タグは
> 経験公開時の AI 審査本文に含めて担保する。以下は当時の記録。

投稿だけでなく **道の登録・編集も公開チェック**する。道の記述（difficulty / goal / situation /
previouslyAble / progress / nextAction / memo / status / title）は公開経験詳細
(`/experiences/{id}`) に文脈として出るため、投稿と同じゲートに載せる。

- `Road` に `moderationStatus`（既定 `pending`）＋ AI/手動判断フィールド（Attempt と同じ 8 項目）
  を追加。既存の道はマイグレーションで全件 `approved` にバックフィル。
- `PUBLIC_ATTEMPT_WHERE` に `road: { is: { moderationStatus: approved } }` を追加。これで
  「投稿が承認済み **かつ** 親 Road も承認済み」でないと公開面に出ない（全経路一括）。
  道単位検索の `buildRoadLevelSearchWhere` にも `PUBLIC_ROAD_WHERE` を追加。
- `src/lib/ai/moderation.ts#moderateRoadContent` と `src/lib/moderation.ts#applyRoadModeration`。
  審査対象の本文が空なら AI を呼ばず `ok`。`AI_MODERATION_ENABLED=false` は道でも即 `approved`。
- 呼び出し: `POST /api/v1/roads`（作成時。ローカル AI のタイトル生成の後）、
  `PATCH /api/v1/roads/{id}`（`ROAD_MODERATED_FIELDS` のいずれかが変わったとき再審査）。
- `serializeRoad` に `moderationStatus` / `aiReason` を追加。自分の道詳細に「この道の内容を
  確認しています / 公開が見送られました」の Callout を表示（承認前はその道の経験も公開されない旨）。
- 管理画面: `/admin/roads`（キュー＋状態フィルタ）と `/admin/roads/{id}`（道の全項目＋AI判定＋
  この道の投稿一覧＋操作ログ）。API は `/api/admin/roads/{id}/moderate`（許可・却下）、
  `PATCH /api/admin/roads/{id}`（手動遷移）、`/api/admin/roads/{id}/recheck`。
  `AdminAuditLog` に `roadId` 列を追加し、`writeAudit` は `attemptId` / `roadId` の両対応。
- ダッシュボードに「道の審査」件数、ナビに「道の審査」を追加。

### 管理画面 UI 改善（管理画面 UI 改善指示書 v1）

「数字を見るダッシュボード」から「確認すべきことと次の操作がすぐ分かる画面」へ。
API/DB/認証/審査ロジックは変更せず、表示のみ改修。

- **ダッシュボード再構成**（[src/app/admin/page.tsx](../src/app/admin/page.tsx)）:
  「確認が必要」（件数＋意味＋「確認する →」の操作を1枚のカードに。0件は「今はありません」）→
  「現在の状況」（数字＋ラベルを必ずセット）→「最近の動き」→「管理メニュー」の順。
  すべて既存の `dashboardStats()` から。固定値・ダミーは使わない。
- **最近の動き**（`src/lib/admin/queries.ts#recentActivity`）: 道の作成 (`Road.createdAt`) と
  経験の公開/停止判断 (`Attempt.moderatedAt ?? aiCheckedAt ?? updatedAt`) を実データから合成。
  架空のイベントは作らない。長い本文は28文字で省略。
- **用語**: 管理画面の表示名だけ「投稿」→「経験」に統一（API/DB/コードの命名は変更しない）。
  操作ボタンも「許可して公開/却下」→「公開する/公開しない」、「取り下げる」→「公開を停止」、
  「やはり公開する」→「やっぱり公開する」に統一し、`post-card.tsx` の `ACTION_LABEL` /
  `STATUS_LABEL` / `RESULT_LABEL` に一元化（3画面で重複定義していたのを統合）。
- **経験カード**: 困ったこと → 試したこと → 結果 の順で読めるよう `AdminPostCard` を再構成。
- **利用者・通報対応**: 未実装のため、ダッシュボードの管理メニューに「準備中」として表示のみ
  （リンクにしない。ダミー画面は作らない）。
- **サイト共通枠の分離**（[src/components/site-chrome.tsx](../src/components/site-chrome.tsx)）:
  `/admin/*` では一般利用者向けの `SiteHeader` / `SiteFooter`（ログインボタン・文字サイズ切替・
  利用規約フッター等）を出さない。ルートの `layout.tsx` を分割する大掛かりな再構成は避け、
  `usePathname()` で出し分ける薄いラッパーのみ追加。
- **コントラスト**: 管理画面で `--color-accent` を小さい文字（バッジ・リンク）に使うと
  WCAG AA (4.5:1) を割る組み合わせがあったため、`--color-accent-strong`（#a83f22）を
  トークンに追加し管理画面のテキストのみ差し替え。既存の利用者向け UI の配色は変更していない。
  admin 主要 6 画面を axe-core (wcag2a/wcag2aa) で確認し違反 0 件。

### バグ修正（コードレビューで発見・全体点検）

- **監査ログの action 誤表示**: 手動 moderationStatus 遷移 (`PATCH .../posts/{id}`,
  `.../roads/{id}`) の action 判定が `pending→approved` を `republish`、`rejected→pending` を
  `approve` と誤ラベルしていた。`src/lib/admin/audit.ts#deriveManualModerationAction` に判定を
  一元化し、`rejected→pending` 用に `requeue`（確認待ちに戻す）を追加。
- **道のタグが AI 審査対象から漏れていた**: `syncRoadTags` で保存されるタグ（公開経験のタグ一覧・
  タグ検索に出る）が `moderateRoadContent` の審査本文に含まれておらず、`PATCH /roads/{id}` で
  タグだけを変えても再審査が走らなかった。`RoadModerationInput.tags` を追加し、
  `applyRoadModeration` はタグ込みで審査、PATCH ルートはタグの変更も `contentChanged` の判定に含める。
- **AUTH_SECRET 未設定時に管理画面全体がクラッシュ**: `verifyAdminSessionToken`（layout 等の
  Server Component から `handle()` を通さず呼ばれる）が `AUTH_SECRET` 未設定で例外を投げていた。
  検証側は例外を投げず null（未ログイン扱い）を返すよう変更し、発行側 (`createAdminSessionToken`、
  `handle()` 配下の `/api/admin/login` からのみ呼ばれる) だけ例外を投げるよう分離。
- **道のタイトル/できなくなったこと確定の競合**: 同じ未設定項目に対する同時 PATCH が
  read-then-write で両方チェックを通過し、後勝ちで片方の入力が黙って消えていた。
  `updateMany` に `title/difficulty IS NULL` の書き込み条件を付けて原子的に更新し、
  競合時は `409` を返す（scalar 更新項目が無い＝タグのみの更新のときは空 UPDATE を発行しない）。
- **公開スイッチの aria-checked が実態と矛盾**: `AttemptPublishToggle` が `role="switch"` の
  `aria-checked` を「公開申請中か (private 以外)」で立てていたため、「確認中」「公開が見送られました」
  でも `true` になり、支援技術には「公開中」と読み上げられていた。`aria-checked` は
  `state === "published"`（実際に公開されているか）に紐付け、クリック時の向き判定は
  別の `hasPublishIntent` に分離。

### SNS 向け簡易登録ページ `/try`（簡易登録指示書）

SNS からの流入者が、ログインなしで「試したこと」1 件だけを最小入力で登録できるページ。
`/experiences/new` のようなフルフォームではなく、困っていたこと / 試したこと / 試した結果
（既存の 5 分類）の 3 項目だけ。`?problem=` で困っていたことを先に埋められる（編集可）。

- **新しいデータモデルは作らない**。経験 = 公開された Attempt という既存仕様のまま、
  `Road` + `Attempt` を作る（`src/lib/quick-submit.ts`）。
- **匿名の受け皿**: `Road.userId` は NOT NULL。Google ログインしないシステム利用者を 1 行だけ
  持ち（`googleSub = "system:anonymous-submissions"`）、簡易登録の道はすべてこの利用者が所有する。
  公開経験のシリアライザは利用者情報を含めないため、公開面には一切出ない。スキーマ変更なし。
- **自動公開しない**: `Attempt` は `isPublished=true` だが `moderationStatus` は必ず `pending`。
  AI 判定は参考情報として記録するだけで pending は覆さない。`Road` は `difficulty` だけを持ち、
  その内容は経験の確認時に必ず一緒に表示されるため `approved` で作る（公開の唯一のゲートは
  Attempt 承認）。運営は既存の `/admin/moderation` キューでそのまま確認でき、運営メモに
  「SNSからの簡易登録（未ログイン）」が入る。
- **入力の扱い**: `quickExperienceSchema` で trim・制御文字除去・行内連続空白の畳み込み・
  各 400 文字上限。`?problem=` は生値を信用せず `sanitizeProblemParam` で同様に下ごしらえ。
  保存値は常にテキストとして描画される（React の自動エスケープ）ため HTML/スクリプトは無害化される。
- **濫用対策**: 未ログインのため `POST /api/v1/quick-experiences` は 6/分・IP 単位の
  レート制限（通常の書き込み 60/分より厳しい）。既知 Bot UA は middleware で拒否済み。
- **PC 幅 / フッター微調整（最終微調整指示）**: フォームの最大幅を `max-w-xl`→`max-w-2xl`
  （約 680px）に。スマホは `<main>` の `px-4` が効くため従来どおり。フォーム下の注記は
  送信ボタン直上の注記と重複していた「運営が確認してから公開」を削り、個人情報を書かない旨と
  `/terms` リンクだけを 1 行に。グローバルの `SiteFooter` は全ページ共通なので変更せず。
- **OGP / SNS 共有（OGP 設定指示）**: `/try` は SNS からの着地点なので、共有時に「できる道」らしい
  画像と説明が出るようにする。
  - 画像は追加済みの `public/ogp.png`（1734×907 ≒ 1.91:1）をそのまま使用（変換しない）。
  - 絶対 URL の基点は `env.site.url`（`SITE_URL`、未設定は `http://localhost:3000`）。
    ルート `layout.tsx` の `metadata.metadataBase` に一元設定し、各ページは相対パスだけ書く。
  - `/try` の `metadata` に `openGraph`（type/title/description/url/siteName/locale/images）、
    `twitter`（summary_large_image）、`alternates.canonical: "/try"`、
    `title.absolute`（テンプレート `%s | できる道` を通さず SNS と完全一致）を設定。
  - canonical / 検索 description が意味を持つよう、`/try` の `robots: noindex` と
    `robots.txt` の `/try` Disallow を解除（SNS クローラーが `robots.txt` を尊重するため
    Disallow のままだとプレビューが出ない）。フォーム本文・機能は不変。

### 経験への「いいね」＋通知（いいね指示書）

公開された他人の経験に「参考になった」を送り、投稿者へ「役に立った」ことを伝えるだけの機能。
SNS 的な人気競争にしないことを最優先に置く。

- **数を出さない / 検索に使わない**: いいね数はカード・詳細・プロフィール・API のどこにも出さない。
  検索ロジック（`src/lib/search.ts`）は一切変更していない。`sort=helpful` は従来どおり結果種別順で、
  いいねとは無関係。
- **データモデル**: 既存の Road/Attempt 設計はそのまま。追加は 2 テーブルのみ。
  - `attempt_likes(attempt_id, user_id, created_at)` + `@@unique([attemptId, userId])` で二重登録防止。
  - `notifications(user_id, type, attempt_id, is_read, created_at)`。現状 `type` は `attempt_liked` のみ。
    誰がいいねしたかは持たない。
- **自分の経験を守る多層防御**: フロントは `like.isMine` でボタン自体を出さない。加えて API 側
  `src/lib/likes.ts#likeAttempt` が親 Road の `userId` と一致したら `403`。非公開・不存在は
  `PUBLIC_ATTEMPT_WHERE` で弾いて `404`。取り消しは `deleteMany({ attemptId, userId })` なので
  他人のいいねは削除できない。
- **API**: `POST/DELETE /api/v1/attempts/{id}/like`（ログイン必須・`RATE_PRESETS.write`）、
  `POST /api/v1/notifications/read`。`GET /api/v1/experiences/{id}` は Cookie から閲覧者を解決して
  `like: { isMine, canLike, likedByMe }` を返す（数は返さない）。
- **UI**: 検索 → 道の詳細（`/experiences/[id]`）の「この人がたどった道」カード見出しの右に
  ハート 1 つ（`src/components/like-button.tsx`）。スマホでは折り返して見出しの下。
  未評価＝灰色の輪郭「参考になった」、評価済み＝赤い塗り「参考になりました」。
  未評価＝灰色の輪郭、評価済み＝赤い塗り。色だけに頼らず `aria-pressed` と文言（「参考になった」/
  「参考になりました」）で状態を示す。未ログインで押すとログイン案内＋`/login?next=` へ。
  検索カードへのハットは今回は入れていない（指示書上も任意。カードの主役＝困った→試した→結果 を保つ）。
- **通知の見せ方**: ログイン後トップ（`/`）の最上部に `src/components/like-notice.tsx` のボックス。
  「あなたの経験が、誰かの次の一歩になりました／あなたの経験に『いいね』が届いています。」のみ。
  件数・氏名は出さない。「閉じる」で未読を全既読化して以後出さない。取り消しても既に出した通知は
  消さない（その時点で評価された、という出来事として扱う）。

### 検索結果カードの「既読 / 未読」（既読指示書）

検索して見つけた経験のうち「自分がもう見たか」を後から判別できるようにする。完全に個人用。

- **数を出さない / 検索に使わない**: 既読数・閲覧数はどこにも出さない。検索ロジックは未変更。
- **`attempts.is_read` は作らない**: 「誰が読んだか」はユーザーごとの状態なので専用テーブル
  `attempt_reads(attempt_id, user_id, read_at)` + `@@unique([userId, attemptId])`。`read_at` は
  将来の「最近見た経験」用に保持（今は非表示）。いいね（`attempt_likes`）とは完全に別。
- **既読になるタイミング**: 検索結果に出ただけでは既読にしない。経験詳細（`/experiences/[id]`）を
  開いた時点で `src/components/mark-read.tsx` がマウント時に 1 回 `POST /api/v1/attempts/{id}/read`。
  失敗しても表示は妨げない（握りつぶす）。未ログイン・自分の経験のときはコンポーネント自体を出さない。
- **サーバ側検証**（`src/lib/reads.ts#markAttemptRead`）: 未ログイン→401 / 非公開・不存在→404 /
  自分の経験→行を作らず `{ read:false }` / `user_id` はセッションから（ボディの user_id は無視）/
  二重は DB UNIQUE + 冪等。
- **カード表示**: `RoadCard`（入口経験 = `entryId` の既読状態）と `MethodCard`（その経験の既読状態）の
  右上に `src/components/read-badge.tsx`（アイコン + 「既読」「未読」の文字。色だけに頼らない）。
  背景は未読 = ごく淡い緑、既読 = 白（`--color-primary-tint` / `--color-surface`）。控えめ。
  `searchRoads` / `searchMethods` / `searchExperiences` は `viewerUserId?` を受け取り
  `readAttemptIdSet` で `isRead` を付ける（未ログインは全 `false`）。`serializeExperience` にも
  `isRead` を追加（`GET /experiences` 一覧・詳細 API 共通）。ページングは `attempt_reads` 基準なので
  何ページ目でも正しく出る。

---

## 7-decies. 仮データ (AI 生成サンプル) 管理 (実装指示書「AI仮データ生成・管理機能」)

- **目的:** 本番で検索・経験カード・道の見える化を確認するため、管理者が AI でサンプルを生成 →
  確認 → 非公開で保存 → 1 件ずつ公開できる、管理者専用機能。実ユーザーの体験の捏造ではない。

- **データモデル (最小変更):** `roads` に `is_seed_data BOOLEAN NOT NULL DEFAULT false` と
  `data_origin TEXT NOT NULL DEFAULT 'user'` を追加（`ai_seed` が AI 生成由来）。`@@index([is_seed_data])`。
  マイグレーション `20260910063926_add_road_seed_data`。
  さらに同テーマ再生成の重複回避用に `seed_keyword TEXT`（nullable）を追加
  （マイグレーション `20260910082354_add_road_seed_keyword`）。
  - **Attempt には足さない。** 仮 Attempt は必ず仮 Road に属し、Attempt は Road から FK cascade で消える。
    Road 側フラグだけで「判別」と「実データ保護」に十分。
  - **1 件 = Road 1 件 + Attempt 1 件**（ユーザー確認済み）。生成 10 件 → Road 10 本、各 1 試行。
    公開・非公開・削除の単位は「その Road（＋その 1 試行）」。
  - 仮 Road の所有者は受け皿システム利用者 `googleSub = "system:ai-seed-data"`
    （`quick-submit.ts` の匿名受け皿と同じ手法。ログインせず公開面に出ない）。

- **公開の分離:** AI 生成 API から `is_published=true` では作れない。保存は必ず
  `is_seed_data=true` / `data_origin="ai_seed"` / Attempt `is_published=false`・`moderation_status=pending`。
  公開は管理画面から 1 件ずつ。**一括公開・一括削除は実装しない。**

- **公開時の審査:** 管理者が確認画面で精査済みのため、公開ボタンは AI モデレーション
  (`applyModerationOnPublish`) を通さず直接 `is_published=true` / `moderation_status=approved`
  にし `bumpRoadUpdatedAt` する（ユーザー確認済み）。以降は既存の公開ゲート
  `PUBLIC_ATTEMPT_WHERE`（`is_published && approved`）を素通りして検索等に出るので、検索・詳細・
  道の見える化・タグ側のクエリ変更は不要。

- **実データ保護:** `src/lib/admin/seed-data.ts` の全 mutating 関数は `requireSeedRoad()`
  （`where: { id, isSeedData: true }`）を通し、対象が仮データでなければ `ApiError("not_found")`。
  → 実ユーザーの Road / Attempt はこの API 経路から一切触れない。

- **AI:** 既存 `@/lib/ai/client`（`ANTHROPIC_API_KEY` / `claude-sonnet-5`）を流用。新プロバイダ・
  新キーは足さない。`src/lib/ai/seed-data.ts` に専用 system プロンプト（実在体験ではなくサンプル／
  診断・治療の断定禁止／「必ず改善する」等の保証表現禁止／危険行為を推奨しない）と
  `SEED_METHOD_ANGLES`（方法のバリエーション）を分離。`callJsonArray`（`{"items":[...]}` 期待、
  失敗時 `[]`）を client.ts に追加。`normalizeDrafts` が壊れた応答を安全化（要素検証・
  5 分類以外は `ongoing` に矯正・不正日付は null・method / difficulty 完全一致を重複排除・件数で打ち切り）。

- **困りごと(difficulty)の生成ルール（生成ルール修正指示書）:** 入力キーワードは「テーマ」であり、
  そのまま `difficulty` にコピーしない。テーマから「何ができなくて困っているのか」＝具体的な行動・
  作業が「難しい／できない」形の困りごとを件数分だけ別々に生成する。
  - system / user プロンプトに明示（抽象語だけ・キーワードのコピー・「サンプル1」等の連番・
    架空人物の体験談を禁止／`goal` はキーワードの繰り返し禁止で具体化）。
  - `isConcreteDifficulty(difficulty, keyword)` で検証：6 文字未満／キーワードそのまま（末尾の
    「（…）」「について」等を外して突き合わせ）／`サンプル\d+` 等の連番／困りごとの語
    （難し・つら・こわ・大変・にくい・できな 等）を含まない → 不採用。AI 出力は `normalizeDrafts`
    でこの検証を通し、落ちた要素は捨てる（全滅ならスタブへフォールバック）。
  - 保存時の最終防御として `seedDraftSchema.difficulty` を必須化し、`サンプル/テスト/例 + 数字`
    だけの困りごとを zod で弾く。
  - Road に `title` 列は無い（削除済み）。見出しは `difficulty` が担うので、difficulty を具体的な
    一文にすることが「タイトルが連番にならない」ことも兼ねる（新規カラムは足さない）。
  - `ANTHROPIC_API_KEY` 未設定時のスタブは、テーマを埋め込まず `SEED_DIFFICULTY_ASPECTS`（20 個。
    日常作業のつまずき）から件ごとに異なる具体的な困りごと・目標・方法を割り当てる。テーマは
    `situation` に「「<キーワード>」に取り組むときの場面」の形で引用として残す
    （検索でたどれるように。`buildExperienceWhere` は `road.situation` も対象）。
    ※ スタブ本文の「（サンプル）」表記は 2026-09-11 に削除（公開時に通常の経験と同じ見た目にするため。下記変更ログ）。
  - **テーマから逸脱させない（テーマ逸脱防止指示書）:** difficulty は入力テーマの活動・場面の中で
    起きる困りごとにする（料理→PC、PC→階段 のような別活動への飛躍は不可）。
    - プロンプトに「テーマから離れない（最重要）」節と、各候補の自己チェック 4 項目
      （テーマに直接関係／別活動でない／具体的な困りごと／difficulty・goal・method が一貫）を明示。
    - `SEED_DOMAINS`（deskwork / cooking / outing / cleaning / laundry。テーマ語＋その分野の困りごと語を
      拾う正規表現つき）と `seedDomainKey(text)` を追加。
    - AI 出力の逸脱検知: テーマに分野がある場合、`difficulty + method` が *別分野* に判定される候補は
      `normalizeDrafts` で捨てる（分野なしテーマでは落としすぎないよう無効）。
    - スタブ: テーマの分野が分かればその分野の困りごと（例「デスクワーク PC」→ キーボード入力・マウス操作・
      画面クリック…）、分からなければ `NEUTRAL_ASPECTS`（分野に依らない作業のつまずき）の頭にテーマを
      引用でつけて出す。どちらもテーマから離れない。
  - **スペース区切り＝複数テーマ (AND)**（ユーザー確認済み: 「1 バッチで全テーマを横断」）。
    `parseSeedThemes(keyword)` が半角/全角スペース・タブで分割・トリム・重複排除する。
    2 個以上なら user プロンプトに「全テーマを取り上げ、生成件数を各テーマにおおよそ均等に配分」を明示。
    生成件数は変えない（既定 10）。スタブは件ごとにテーマを順番に割り当て、`situation` に各テーマが現れる。
    保存・公開・削除の単位は従来どおり 1 件（Road）ずつで、複数テーマでも各 Road は独立。
    `isConcreteDifficulty` はスペース区切りの各テーマそのままも不採用にする。

  - **毎回結果を変える・重複を避ける（追加指示書）:** 同じテーマで生成するたびに違う切り口を出す。
    - `roads.seed_keyword`（nullable text、マイグレーション `20260910082354_add_road_seed_keyword`）に
      生成時のテーマを保存。`persistSeedDrafts(drafts, keyword)` で書き、`seedCreateSchema` に
      任意フィールド `keyword` を追加（generator が送る）。
    - `listSeedDataForTheme(keyword)`：`seed_keyword` 完全一致 + 部分一致で同テーマの既存
      仮データ（困りごと / 方法 / 結果）を最大 120 件返す。`generate` エンドポイントが毎回呼ぶ。
    - `generateSeedDrafts(keyword, count, { existing })`：
      - AI パス — `buildUserPrompt` に既存リスト（最新 60）＋「同じ・実質的に同じ・言い換え禁止」
        ＋自己チェック 6 項目＋優先順位「テーマ適合 ＞ 重複回避 ＞ 新しい切り口 ＞ バリエーション」を明示。
        `normalizeDrafts` が既存および今回採用済みと `nearDuplicate` で照合し、重複を捨てる。
      - スタブ — 困りごとプールの開始位置を `offset = existing.length` ずらして違う切り口を返す。
        `NEUTRAL_ASPECTS` を 34 個に増やし、分野ありテーマはプール 42（4 周ぶん）を確保。
        `existing` と `nearDuplicate` する候補はスキップし、足りなければ最後に重複を許して件数を満たす。
    - `nearDuplicate(a,b)` / `meaningTokens(s)`：助詞・記号を落とし、同義語（軽量→軽、変更/見直し→変、
      「こまめに休憩」「休憩を増やす」等→定期休憩 …）を畳んでカタカナ語・漢字語の集合にし、
      Jaccard ≥ 0.6 か「小さい側が丸ごと含まれる」で「実質的に同じ」と判定。完璧ではなく、
      最終判断は AI の自己チェックと管理者の確認に委ねる安全網。
    - **保存せず「再生成」しても毎回変える（再生成指示書）:** キーワードはそのままで
      「別の候補をもう一度生成する」を押すたび内容を変える。
      - `seedGenerateSchema` に `exclude`（画面に表示中＋その回までに生成した候補、最大 200）を追加。
      - `generate` ルートが `listSeedDataForTheme`（保存済み）＋ `exclude`（未保存の表示分）を
        まとめて `existing` として `generateSeedDrafts` に渡す。
      - クライアント（`seed-data-generator.tsx`）は同一キーワードの生成結果を `historyRef` に累積して
        毎回 `exclude` で送る。キーワードが変わったら履歴をリセット。生成後はボタンが
        「別の候補をもう一度生成する」に変わる。
    - 生成件数・非公開保存・1 件ずつの公開/非公開/削除・テーマ逸脱防止は変えない。

- **API (`/api/admin/seed-data*`):** `generate`（保存しない・`RATE_PRESETS.ai`）/ `POST`（非公開保存）/
  `GET` 一覧 / `GET|PATCH|DELETE {roadId}` / `POST {roadId}/publish|unpublish`。
  すべて `handle()` + `requireAdminApi()`。監査ログ action:
  `seed_create|seed_edit|seed_publish|seed_unpublish|seed_delete`。

- **一般ユーザー表示:** 公開された仮データは既存の経験カード・詳細・道の見える化に出る。
  当初は誤認防止に「サンプル」ピル（`SampleBadge`）を足したが、**2026-09-11 に撤去**し
  通常の経験とまったく同じ見た目にした（下記変更ログ）。`SampleBadge` と、`RoadCardDTO` /
  `MethodCardDTO` / `ExperienceDTO.road` / `getPathClusters` の `isSeed` フィールドも削除。
  仮データの判別は `roads.is_seed_data` / `data_origin` と `/admin/seed-data` のみ。

- **ダッシュボード:** `dashboardStats().roads` と `recentActivity` の Road 集計から
  `isSeedData: false` で仮データを除外（実データと混同しない／10 件生成で「最近の動き」が埋まらない）。

- **本番マイグレーション:** VPS で `node_modules/.bin/prisma migrate deploy` を 1 行で流す
  （`docs/deployment.md`）。`ADD COLUMN ... DEFAULT` のみで既存行・既存挙動に影響なし。

- **テスト:** `tests/unit/seed-data.test.ts`（`coerceResult` / `isConcreteDifficulty` / `seedDomainKey` /
  `parseSeedThemes` / `normalizeDrafts` / `localStubDrafts` — テーマ→具体化、キーワードそのまま不可、
  連番不可、10 件が十分に異なる、result は 5 分類、架空人物にしない、**指示書の 3 ケース**
  〔デスクワーク PC / 料理を作る / 外出〕でテーマから逸脱しない、AI 逸脱候補は捨てる）、
  `tests/integration/seed-data.test.ts`（生成 10 件・difficulty 具体化・非全件一致・5 分類のみ／
  非公開保存＋フラグ（Road 10 + Attempt 10）／非公開時は検索に出ない／1 件公開で 1 件だけ出る／
  非公開化／編集／削除で Attempt も消える／実ユーザー Road への PATCH・publish・DELETE は 404／
  管理者以外は 401）。

## 8. 仕様変更ログ

（現時点で指示書からの機能的な逸脱はなし。追記時は下記フォーマット）

```
### YYYY-MM-DD 変更タイトル
- 変更前:
- 変更後:
- 理由:
- 影響範囲:
- 将来への影響:
```

### 2026-09-09 広告: Google AdSense（非パーソナライズのみ）を接続
- 変更前: `ADS_ENABLED=true` のときプレースホルダ枠を 2 か所に出すだけ。実配信なし。
- 変更後: **Google AdSense** を接続。
  - env（`NEXT_PUBLIC_` = クライアント側でも読む）: `NEXT_PUBLIC_ADSENSE_CLIENT`（`ca-pub-…`）、
    `NEXT_PUBLIC_ADSENSE_SLOT_SEARCH` / `_ROAD`。`ADS_ENABLED=true` ＋ client ＋ その枠の slot ID が
    揃ったときだけ実配信。未設定なら従来のプレースホルダ（dev / E2E / 審査前でも壊れない）。
  - `src/components/adsense-unit.tsx`（新規・client）: `<ins class="adsbygoogle">` ＋ `useEffect` で
    `push({})`。**push 前に `adsbygoogle.requestNonPersonalizedAds = 1`** を立て、
    **非パーソナライズ配信（行動追跡なし・文脈広告のみ）に固定**。
  - `src/components/ad-slot.tsx`（server）: ゲート（`env.ads.enabled`）とラベル枠
    （`<aside aria-label="広告">` 破線・「広告」表示）は不変。中身を AdSenseUnit / プレースホルダで出し分け。
    `slot` 名 → 実 slot ID のマップは同ファイル内。`context`（内部カテゴリ）は **AdSense へ渡さない**
    （`data-ad-*` は DOM 内ヒント。外部送信なし）。呼び出し側 2 ページは無変更。
  - `src/app/layout.tsx`: `env.ads.adsenseClient` があるときだけ `next/script`（`afterInteractive`）で
    `adsbygoogle.js` を 1 本ロード。
  - `src/app/ads.txt/route.ts`（新規）: client 設定時に
    `google.com, pub-…, DIRECT, f08c47fec0942fa0` を配信。未設定は 404。middleware matcher の除外にも追加。
- 理由: ユーザー確認済み方針「実広告ネットワークを接続」「非パーソナライズのみ」。広告方針の
  「病名・障害名・健康状態を個人向けターゲティングに使わない／識別情報を渡さない」を、行動追跡を
  そもそも無効化することと、内部カテゴリを送らないことで設計上担保する。
- 既知の制約: EEA/UK 向けは Google 認定 CMP 未導入のため配信が絞られる可能性（将来課題）。
  実広告の表示は AdSense のサイト審査通過後。CSP は現状無い。導入時は
  `pagead2.googlesyndication.com` / `*.googlesyndication.com` / `*.g.doubleclick.net` /
  `*.googleadservices.com` / `www.google.com` を script/frame/img に許可すること。
- テスト: `tests/unit/ad-slot.test.tsx` に client 有無での `<ins>` 出し分け、
  `tests/unit/ads-txt.test.ts` 新規、`tests/e2e/ads.spec.ts` に「client 未設定で実配信タグを読まない」。

### 2026-09-09 「自分の道」一覧に「公開表示」ボタン ＋ 細かな見た目調整
- **`/me` カード右上に「公開表示」ボタン**（`src/app/me/page.tsx`）。押すと、検索した人が見るのと
  同じ経験詳細 `/experiences/{id}` へ。`id` は「時系列で最初の“公開中”の試したこと」＝検索の道カードの
  入口（`entryId`）と同じ。**公開中の経験が 1 件も無い道では無効表示**（`aria-disabled`・リンクにしない）。
  カード全体をくるむ `<Link>` の兄弟として `absolute right-3 top-3 z-10` で重ね、`<a>` の入れ子を避ける。
- `/me` カードの方法テキストを 1 行 → **最大 3 行**（`line-clamp-3`）。
- 道の編集フォーム（`road-edit-form.tsx`）: 「できなくなったこと」を「この道について」の先頭に移動
  （道の見出し・確定項目のため）。冗長だった「変更できない項目があります」の Callout を削除
  （変更不可は各項目の hint で個別に表示）。
- Google ログインボタンをサービスの緑（`--color-primary`）塗り＋白文字に。
- 入力欄にカーソルを入れたときのフォーカス枠を、アクセント（コーラル）→ 道と同じ濃い緑
  （`--color-primary`）に（`globals.css`、input/select/textarea のみ）。

### 2026-09-09 経験の確認画面: 新しい順 ＋「保留」状態と切り替え表示
- 変更前: `/admin/moderation` は `moderationStatus=pending` の経験を `updatedAt asc`（古い順）で表示。
  判断は「公開する / 公開しない」の 2 択のみ。
- 変更後:
  - 並びを `updatedAt desc`（新しい順）に。
  - `Attempt` に `moderationHeld Boolean @default(false)`（マイグレーション `add_attempt_moderation_held`）。
    「今は公開できない記録」として運営が脇に置くフラグ。**却下ではなく、`moderationStatus` は `pending` のまま**。
  - `/admin/moderation` 上部に「保留していない（既定・`?held` なし）／保留している（`?held=1`）」トグル。
    既定は `moderationHeld:false` の確認待ち、`held=1` は `moderationHeld:true`。
  - `POST /api/admin/moderation/{id}` の `action` に `hold` / `unhold` を追加（`moderationStatus` 不変）。
    `approve` / `reject` は最終判断時に `moderationHeld:false` も合わせてクリア。監査ログに `hold`/`unhold`。
  - 決定ボタン行の右端（`ml-auto`）に第 3 ボタン「保留」／保留一覧では「保留を解除」。
  - 2 つの絞り込み（保留トグル・AI 判定）を 1 枚の淡い緑カードにまとめ、選択中は塗りピルに。
    経験カード（`AdminPostCard`）は背景を白に。
  - `dashboardStats()` の `pending` を `pendingActive`（保留していない）と `pendingHeld`（保留中）に分割。
    管理トップの「経験の確認」カードは `pendingActive` を主表示、`（保留中 N 件）` を小さく添える。
  - 管理トップのセクション順を「管理メニュー → 確認が必要 → 現在の状況 → 最近の動き」に（メニューを先頭へ）。
- 公開ゲートは不変（`moderationHeld` は `PUBLIC_ATTEMPT_WHERE` に関与しない。保留中は元々 pending なので非公開）。
  `serializeAttempt` に `moderationHeld` を追加（管理 UI・型合わせ用。本人ビューの `publishState` は
  reviewing のままで挙動不変）。
- テスト: `tests/integration/admin-hold.test.ts`（hold/unhold・キュー出し分け・updatedAt 順・
  dashboardStats の pendingHeld）、`admin.spec.ts` に保留フロー、`road-create.spec.ts` に
  「公開中の経験が無い道は『公開表示』が押せない」。共有 DB の並列走行で `search-split.test.ts` の
  横断クエリが cascade 削除と競合し `Inconsistent query result` を稀に投げるため、同ファイルに
  一過性リトライを追加。

### 2026-09-09 道の検索順: 公開経験が付いた道を浮上させる（`road.updatedAt` を bump）
- 変更前: 「道だけ」検索の既定並び（`sort=recent`）は `roads.updatedAt` desc。だが試したことの
  追加も運営承認も **親 Road の行を書かない**ため、既存の道に新しい公開経験が付いても順位は上がらず、
  「道を作った / 最後に編集した時刻」の位置に埋もれていた（`/try` 経由は道ごと新規作成なので浮上していた）。
- 変更後: **その道の経験が `approved`（公開可）になったとき、`road.updatedAt` を現在時刻に進める**。
  `src/lib/moderation.ts#bumpRoadUpdatedAt(roadId)` を追加し、
  - `applyModerationOnPublish`（試したこと作成・編集時。AI 無効の即 approved と、verdict=ok の両方）
  - `POST /api/admin/moderation/{id}`（運営が「公開する」）
  - `PATCH /api/admin/posts/{id}`（`→ approved` の再公開）
  から呼ぶ。`pending` / `rejected` になるだけの操作では bump しない。
- 影響: `updatedAt` は「道の行の編集」に加えて「その道の公開経験が動いた」も意味するようになる。
  `/me`（自分の道一覧、`updatedAt` desc）も、経験を公開すると先頭に来る挙動になる。
  `sort=helpful` / `sort=tried` は従来どおり（`updatedAt` を見ない）。
- ユーザー確認済みの方針: 専用カラムは足さず `updatedAt` を流用する。
- E2E: `branching-paths.spec.ts:110` を「試したこと（2 以上）を持つ道カード」で絞るよう修正
  （先頭カードが他テスト由来の 1 メソッド道でも落ちないように。従来から不安定だった箇所を安定化）。

### 2026-09-09 書き込み API を同一オリジンからのみに制限（CSRF 二重防御）
- 変更前: 状態変更 API の防御はセッション Cookie（`SameSite=Lax`）＋ JSON content-type の
  プリフライト頼み。Origin / `Sec-Fetch-Site` の明示チェックは無かった。
- 変更後: `src/lib/api.ts#assertSameOrigin(req)` を追加し、`handle()` の先頭で全ルートに適用。
  - `POST` / `PUT` / `PATCH` / `DELETE` のみ対象（`GET` / `HEAD` / `OPTIONS` は素通り）。
  - `Sec-Fetch-Site` が `same-origin` / `same-site` → 許可。`cross-site` / `none` → `403 forbidden`。
  - `Sec-Fetch-Site` が無い場合は `Origin` を見る。自オリジン（`SITE_URL` またはリクエスト自身の
    ホスト／`X-Forwarded-Proto`）と一致 → 許可、不一致 → `403`。
  - 両方とも無い（＝非ブラウザ：curl・サーバ間・結合テストの `new Request(...)`）→ 従来どおり通す。
    CSRF はブラウザ発の攻撃で、ブラウザはクロスオリジン書き込みで必ずどちらかを送るため、
    ブラウザ経由の CSRF はこれで塞がる。非ブラウザ直叩きは別レイヤー（セッション所持・レート制限）で対応。
- 影響範囲: `src/lib/api.ts` のみ（全 `/api/v1/*` 書き込み・`/api/admin/*` が `handle()` 経由）。
  `handlePublicRead`（公開 GET）と NextAuth の `/api/auth/*`、dev 専用 `/api/test/login` は対象外。
  既存テスト・E2E は無変更で通過（Playwright の `page.request.*` はヘッダを送らず lenient 分岐）。
- 理由: ユーザー要望「外部から操作されないようにしたい」。SameSite Cookie への上乗せとして、
  別サイトに置かれた `fetch` / `form` からの書き込みを明示的に拒否する。

### 2026-09-09 道 (Road) の `title` を廃止（見出しは「できなくなったこと」に一本化）
- 変更前: `Road.title`（本人向けの一覧見出し。公開面には出ない）。作成フォームでは入力させず、
  作成時に `difficulty` からローカル LLM（`src/lib/ai/local.ts#generateRoadTitle`、Ollama 互換）で
  自動生成。編集フォームでのみ手入力できた。PATCH `/roads/{id}` では `title` も「設定済みは変更不可」。
- 変更後: `Road.title` カラムを DROP（マイグレーション `remove_road_title`）。いま
  `road.title ?? road.difficulty` としていた本人ビュー（`/me`・道詳細・attempt の戻りリンク）・
  管理画面（`AdminPostCard` の「道『…』より」は削除、`recentActivity`）は `difficulty ?? "（無題の道）"`
  に統一。`serializeRoad` / `roadCreateSchema` / `FIELD_MAX.title` から `title` を削除。PATCH の
  ロック・競合ガードは `difficulty` だけに。
- ローカル AI サブシステムも撤去: `src/lib/ai/local.ts`（title 生成専用・他用途なし）、
  `env.localAi`、`LOCAL_AI_URL` / `LOCAL_AI_MODEL` / `LOCAL_AI_TIMEOUT_MS`、`.env.example` の該当節、
  `playwright.config.ts` の `LOCAL_AI_MODEL`、関連テスト（`local-ai.test.ts` / `road-title-ai.test.ts`）。
- 理由: ユーザー要望「タイトルは使わなくして、現在使っている場所は『できなくなったこと』を使う」。
  title は公開面に出ず、自動生成した見出しの価値も低かった。
- 影響範囲: schema / migration / `serializers.ts` / `validation.ts` / `constants.ts` /
  `roads/route.ts`・`roads/[roadId]/route.ts` / `me/**` / `road-edit-form.tsx`（「道の基本」Section 削除）/
  `admin/post-card.tsx` / `admin/queries.ts` / `ai/moderation.ts`・`moderation.ts`（道タイトルの審査を戻す）/
  seed / docs / tests。
- 将来への影響: 「本人が道に付ける自由な見出し」が必要になったら別途フィールドを足す（自動生成は
  復活させない前提）。

### 2026-09-09 道 (Road) のモデレーションを廃止（公開可否は経験に一本化）
- 変更前: 道にも独自の `moderationStatus`（pending/approved/rejected）＋ AI 判定フィールドがあり、
  `PUBLIC_ATTEMPT_WHERE` は「投稿が承認済み **かつ** 親 Road も承認済み」を要求。管理画面に
  「道を確認」キュー（`/admin/roads`）があった。
- 変更後: **道はモデレーション状態を持たない**。道が公開面に出るかは「承認済みの公開経験
  (Attempt) を 1 つ以上持つか」だけで決まる。`PUBLIC_ROAD_WHERE` を撤去し、`PUBLIC_ATTEMPT_WHERE`
  は `{ isPublished, moderationStatus: approved }` のみに。`applyRoadModeration` /
  `moderateRoadContent` / `ROAD_MODERATED_FIELDS` / `/admin/roads` 一式 / `/api/admin/roads/*` /
  `AdminRoadCard` / `AdminAuditLog.roadId` を削除（マイグレーション `remove_road_moderation`
  ＝道の 8 カラムと監査ログの `road_id` を DROP、道あて監査行は削除）。
- 審査カバレッジの担保: 廃止で審査対象から外れるのは道の **タイトル** と **タグ** だけなので、
  その 2 つを `moderateAttemptContent` の審査本文に追加（`applyModerationOnPublish` が
  `attempt.road.title` とタグ名を渡す）。道の中核テキスト（difficulty / goal / situation /
  previouslyAble）は従来どおり投稿審査に含まれる。
- 理由: ユーザー要望「道の情報では公開・非公開を扱わない。公開・非公開は経験の公開情報に準ずる」。
  公開単位は元々 Attempt なので、道の承認は二重ゲートで運用も分かりにくかった。
- 影響範囲: schema / migration / `src/lib/search.ts` / `src/lib/moderation.ts` /
  `src/lib/ai/moderation.ts` / `src/app/api/v1/roads/**` / `src/lib/serializers.ts`（`serializeRoad`
  から `moderationStatus` / `aiReason` 削除）/ `src/app/me/roads/[roadId]/page.tsx`（道の確認中
  Callout 削除）/ 管理画面一式 / `src/lib/quick-submit.ts` / seed / docs / tests。
  §7-novies「道 (Road) の内容モデレーション」節はこの変更で撤回済み。

### 2026-09-09 道 (Road) の公開 / 非公開設定（visibility）を廃止
- 変更前: `Road.visibility`（private/public）＋道の詳細画面の「道のページを公開中 / 非公開」トグル。
- 変更後: **道は公開前提**。`roads.visibility` カラム・`Visibility` enum・`RoadVisibilityToggle`・
  `VISIBILITY` 定数・`roadCreateSchema` の `visibility` を撤去（マイグレーション
  `remove_road_visibility`＝インデックス・カラム・enum を DROP。既存値は捨てる）。
- 理由: `visibility` はどの公開ゲートにも使われておらず（公開面は `moderation_status` が担う）、
  トグルはあるが機能していないダミー設定だった。将来の「本人の道ページ公開 URL」は別途設計する。
- 影響範囲: schema / migration / `constants.ts` / `validation.ts` / `serializers.ts`（`RoadDTO` から
  `visibility` を削除）/ `roads/route.ts` / `quick-submit.ts` / `road-actions.tsx` /
  `me/roads/[roadId]/page.tsx` / `me/page.tsx`（「道は公開/非公開」表示を削除）/ `seed.ts` / docs / tests。

### 2026-09-09 「自分の道」に「試したことを記録すると公開されます」の案内カード
- `/me` で `attempts.length === 0` の道が 1 件以上あるとき、一覧の上部に `Callout`（info）を出す。
  「道は試したことを記録して公開すると検索に出る。試したことのない道（N 件）は公開されない」旨と、
  先頭の該当道の `…/attempts/new` へのリンク。該当が無ければ出さない。
- 影響範囲: `src/app/me/page.tsx` のみ。

### 2026-09-09 「自分の道」一覧のカードにも試したことを表示（検索の道カードと同じ見せ方）
- 変更前: `/me` のカードは結果バッジ（末尾 4 件）だけで、方法テキストは出していなかった。
- 変更後: 検索の `RoadCard` と同じ「縦線（road-guide/road-dot）＋方法テキスト（line-clamp-1）＋
  結果バッジ」を、時系列で先頭 3 件表示。4 件目以降は「ほかに N 件の方法」。本人ビューなので
  各行に非公開/確認中/見送りの小さな印を付ける（`publishState !== "published"` のとき）。
- 影響範囲: `src/app/me/page.tsx` のみ。データは `getMyRoads`（既存）のまま。

### 2026-09-09 検索に「既読 / 未読」の絞り込みを追加
- 追加: `?read=read` / `?read=unread`（未指定 = すべて）。ログイン中のみ有効・表示（未ログインは無視）。
- `src/lib/search.ts#readFilterWhere(read, viewerUserId)` を Attempt レベルの where に足す
  （`{ reads: { some: { userId } } }` / その `NOT`）。道カードは道レベルで
  `{ attempts: { some|none: { …公開条件…, reads: { some: { userId } } } } }` を足す。
  → **DB レベルの絞り込みなのでページング・件数も正しい**。
- 道カードの `isRead` の意味を「入口経験を読んだか」→「その道の公開経験を 1 つでも読んだか」に変更
  （絞り込み条件と一致させるため。詳細画面は入口経験を開くので通常は同じ）。
- `experiences/page.tsx` は `<ExperienceSearchForm loggedIn defaultRead>` を渡し、フォームに
  「既読 / 未読」セレクトを（ログイン中だけ）追加。`GET /api/v1/experiences` も同じ where を使う。
- 影響範囲: `constants.ts` / `validation.ts` / `search.ts` / `queries.ts` /
  `experiences/route.ts` / `experiences/page.tsx` / `experience-search-form.tsx`。
  検索順位ロジックは不変。

### 2026-09-09 他ページから検索に戻ったとき前回の検索状態を復元
- 課題: 検索条件は URL クエリに乗っている（ブラウザの戻るは効く）が、ヘッダーの「経験を探す」
  リンクや詳細画面の「← 経験を探すへ戻る」は素の `/experiences` を指すため、そこから戻ると
  前回の検索が失われていた。
- 対応: `src/components/restore-search.tsx`（クライアント）を `/experiences` に置く。
  クエリ付きで開かれたらその検索文字列を `sessionStorage`（同タブ・同セッション内のみ）に記憶し、
  クエリ無しで開かれて記憶があれば `router.replace` で復元する。`experiences/page.tsx` は
  `<ExperienceSearchForm key={検索条件}>` にして、復元・戻る時にフォームの初期値を取り直す。
  「条件をクリア」／条件なし送信は `clearStoredSearch()` で明示的に忘れる。
- 修正（回帰）: 当初 `useSearchParams().toString()` を信じていたが、これはハイドレーション直後や
  `router.push` 直後に一瞬 `""` を返すことがあり、その隙に「復元」ブランチへ入って**現在の検索条件を
  記憶済みの古い条件で上書き（＝リロードで条件が消える）**していた。URL の有無は
  `window.location.search` を直接見るように変更（クエリがあれば記憶するだけ・絶対に replace しない）。
- 影響範囲: `restore-search.tsx`（新規）、`experiences/page.tsx`、`experience-search-form.tsx`。
  検索ロジック・URL 仕様・API は不変。`localStorage` は使わない。さらに保険として、記憶から
  `RESTORE_MAX_AGE_MS`（既定 60 分）経った条件は復元せず掃除する（タブを開きっぱなしで日をまたいだ
  ときに古い条件を引きずらないため）。

### 2026-09-09 「表示する種類」の既定を `road` に戻し、選択肢の順を 道→方法→両方 に
- 変更前: `EXPERIENCE_KINDS = ["road", "both", "method"]`（順: 道・両方・方法）、既定 `both`
- 変更後: `EXPERIENCE_KINDS = ["road", "method", "both"]`（順: 道・方法・両方）、既定 **`road`（道だけ）**
- 理由: ユーザー要望。検索の初期表示は「道（困りごと）別」を基本に戻す。
- 影響範囲: `src/lib/constants.ts` のみ（`z.enum` / セレクトの `.map` / URL パラメータの
  「既定と異なるときだけ付与」ロジックはすべて定数を参照しているため追従不要）。
  テスト追従: `branching-paths.spec.ts` の「既定は両方」アサーションを `road` に更新。

### 2026-09-09 広告スロット（広告表示方針 v1）
- 追加: `src/components/ad-slot.tsx`（サーバーコンポーネント）。`env.ads.enabled`
  （`ADS_ENABLED=true`）のときだけ描画。無効時は `null`（レイアウトに影響を残さない）。
  プロバイダ未接続なので中身は控えめなプレースホルダのみ。将来の配信タグはこの中に差し込む。
- 配置は 2 画面 **のみ**:
  - 検索一覧（`/experiences`）: 道カード 2 件のあと、3 件以上あるときだけ `slot="search_after_2"`
    を 1 枠（`lg:col-span-2` の全幅 `<li>`）。方法カードセクションには入れない。
  - 道詳細（`/experiences/[id]`）: 道 Card の直後、右サイドの「次の一歩」CTA より前に
    `slot="road_detail_mid"` を 1 枠。
- **出さない画面**: トップ / 自分の道 / 各フォーム / ログイン / アカウント。
- 見た目は経験カード（白＋緑実線枠の `<article>`）とはっきり分ける（生成り背景＋破線枠＋
  「広告」ラベル、`<aside aria-label="広告">`）。経験情報に見せない。
- **検索順位には一切影響しない**: `src/lib/search.ts` / `searchRoads` は無変更。広告はレンダリング時に
  結果配列へ差し込むだけ。
- ターゲティングは非個人情報のみ: `src/lib/ads.ts#adContextFromText` が検索語 / 道の記述を
  「動作カテゴリ」(clothing / cooking / mobility …) にだけ変換する。生テキスト・氏名・病名・
  健康状態は出力しない（該当キーワードが無ければ `null`）。カテゴリは `data-ad-*` 属性で
  DOM に置くだけで、ここから外部へは何も送信しない。
- DB 上の分離: 広告データは DB に一切持たない（外部配信）。ユーザー投稿との混在は構造的に無い。

### 2026-09-09 アカウント設定・アカウント削除（アカウント設定指示書）
- 追加: ヘッダー右上の「ログアウト」ボタンを **ユーザーメニュー**（`src/components/user-menu.tsx`）に
  変更。中身は「アカウント設定」「ログアウト」のみ（「アカウントを削除」はメニューに置かない）。
  旧 `src/components/auth-buttons.tsx` は削除。
- 追加: `/me/account`（`src/app/me/account/page.tsx`）。プロフィール編集はしない。
  「あなたのデータ」= 自分の道 / 試したこと / 公開した経験 の件数（`prisma.count`。カウンター
  カラムは増やさない）＋「アカウントを削除」。
- 追加: `DELETE /api/v1/me`。本人（セッションの user.id）のみ。`prisma.$transaction` で
  `user.delete` → FK cascade で `roads`/`attempts`/`road_tags`/`attempt_likes`/`attempt_reads`/
  `notifications` を一括削除 → `signOut()` で Cookie 破棄。`tags` と Google アカウントは触らない。
  匿名受け皿ユーザーは `403`。削除画面（`src/components/delete-account.tsx`）は確認パネルを挟み、
  消えるもの・取り消せないことを明示する。
- 理由: プライバシー方針（最小限のユーザー情報／画像なし／本人が公開した経験のみ他者閲覧可）に、
  本人によるデータ削除を加える。SNS 的プロフィール機能は作らない（§15）。
- 影響範囲: header / `/me/account` / `/api/v1/me` / icons（`IconUser` `IconChevronDown` 追加）。
  既存の Road/Attempt 個別削除とは独立。

### 2026-09-09 道 (Road) の visibility 初期値を public に
- 変更前: `Road.visibility` の既定は `private`（`@default(private)` ＋ `POST /api/v1/roads` の
  `input.visibility ?? "private"`）
- 変更後: 既定 `public`（schema `@default(public)` ＋ 作成ルートの `?? "public"`）。道の詳細画面で
  いつでも非公開に切り替えられるのは不変。マイグレーション `road_visibility_default_public`
  （`ALTER COLUMN visibility SET DEFAULT 'public'` のみ／既存行は変更しない）
- 理由: 前項と同じく、記録した経験を他の人の役に立てるサービスなので既定を共有寄りに
- 影響範囲: `prisma/schema.prisma`、`src/app/api/v1/roads/route.ts`。SNS 簡易登録の匿名受け皿の道は
  `src/lib/quick-submit.ts` で `visibility: "private"` を明示（道ページとして公開しない）
- 将来への影響: 「本人の道ページ公開」機能を実装する際、既存の道はほぼ public になっている前提で設計できる

### 2026-09-09 「試したことを記録」フォームの公開トグルを既定 ON に
- 変更前: `attempt-form.tsx` の「この記録を『経験』として公開する」チェックボックスは新規記録で
  既定 OFF（`attempt?.isPublished ?? false`）
- 変更後: 新規記録は既定 ON（`attempt?.isPublished ?? true`）。編集時は既存の値をそのまま尊重
- 理由: 記録した経験を他の人の役に立てることがサービスの中心なので、既定を共有寄りに。
  公開したくない場合はチェックを外せる／あとから公開停止もできる、は不変
- 影響範囲: `src/components/attempt-form.tsx` のみ（API・DB のデフォルトは `false` のまま。
  クライアントが明示的に `isPublished: true` を送る形）。E2E `critical-flow` は作成した道を
  後片付けで削除するよう更新
- 将来への影響: なし

### 2026-09-09 画像・写真投稿機能の廃止（画像投稿廃止指示書）
- 変更前: Attempt に写真を添付できた（`attempt_photos` テーブル、`/api/v1/attempts/{id}/photos*`、
  S3 互換ストレージ = 開発は MinIO、記録フォームの写真 UI、経験詳細・自分の道・管理画面の写真表示）
- 変更後: **ユーザーによる画像・写真の投稿／添付を全廃**。`attempt_photos` を DROP、写真 API・
  `src/lib/storage.ts`・`@aws-sdk/*` 依存・`STORAGE_*` 環境変数・`next.config` の画像リモート許可・
  `docker-compose.yml` の MinIO を撤去。関連 UI・シリアライザの `photos` フィールド・
  `tests/unit/storage.test.ts` を削除。`RATE_PRESETS.upload` / `FIELD_MAX.caption` も削除。
- 理由: プライバシー保護の優先。画像に写り込む顔・氏名・住所・施設名・診察券・車両番号・
  位置情報メタデータ等の公開リスクを、「利用者に注意を促す」ではなく**サービス側で画像を
  受け付けないこと**で構造的に無くす。
- 影響範囲: schema / マイグレーション / API / ストレージ / 記録フォーム / 経験詳細 / 自分の道 /
  管理画面 / next.config / docker-compose / .env.example / package.json / docs / tests。
  既存の Road・Attempt・結果 5 分類・公開/非公開・検索・道の見える化・AI 整理は不変。
- 将来への影響: 初期版では画像投稿を再導入しない（§16）。文章・音声入力を中心に据える。
  §8 冒頭より下の日付付きログに残る「写真」記述は当時の実装の記録であり、現行仕様は本項が優先。

### 2026-08-31 ローカル DB のホストポート
- 変更前: PostgreSQL を `localhost:5432` で公開
- 変更後: `localhost:5433`（コンテナ内は 5432 のまま）
- 理由: 別プロジェクトのコンテナが 5432 を使用しており衝突した
- 影響範囲: `docker-compose.yml`、`.env.example` の `DATABASE_URL`
- 将来への影響: なし（本番は環境変数で上書き）

### 2026-09-03 ページ幅の整理
- 変更前: `/experiences` は `max-w-6xl`、`/`・`/experiences/paths` は `max-w-5xl`、`/me` 系は
  `max-w-3xl`〜`max-w-5xl` とページごとにばらついていた
- 変更後:
  - ダッシュボード的に横に広く使うページ（`/`、`/experiences`、`/experiences/paths`、`/me` と
    その配下のフォーム）は外側 `max-w-6xl`（`layout.tsx` の `<main>` と同じ）にそろえた。
  - **経験詳細 `/experiences/[id]` は 1 本の縦ツリーを読むページなので `max-w-3xl`**（戻る/見出し/
    ツリー/注意書き/CTA が全部同じ幅の 1 カラム）。`BranchingPaths` 非 dense は内側の
    `mx-auto max-w-xl` をやめてカード幅いっぱいに左寄せ（ツリーが広いカードの中央で浮くのを解消。
    ユーザー指摘）。dense（`/experiences/paths` の一覧）は従来どおり `mx-auto max-w-lg`。
  - `/terms`（長文の規約 = `max-w-3xl`）、`/login`・`error`・`not-found`（カード = `max-w-md`）は対象外
- 理由: ページ間で横幅が変わって見える／ツリーが中央で浮くのを解消
- 影響範囲: 各 `src/app/**/page.tsx` の最上位コンテナ、`branching-paths.tsx` の内側ラッパの className
- 将来への影響: 一覧・作成系は `max-w-6xl`、読み物系は `max-w-3xl` を目安にする

### 2026-09-03 「この人がたどった道」の表示バランス調整（レイアウトのみ）
- 指示書「道の見える化 画面レイアウト調整 v1 → v2」。10 件ページング・データ・API・親子関係・
  「現在」「できた％」「気持ち」などの仕様は一切変更せず、`branching-paths.tsx` の余白・情報階層と
  `experiences/[id]/page.tsx` のレイアウト・文言だけ整える。
- **中央幅を拡大**：`/experiences/[id]` を `max-w-3xl` → `max-w-4xl`（≒900px）。内側の写真・注意書きの
  `max-w-3xl` ラッパも外して 4xl でそろえた。
- **「以前できていた」「やりたいこと」を上部の横並びカードへ**：`BranchingPaths` に
  `trunkLayout: "inline" | "none"`（既定 inline）を追加。詳細ページは `"none"` を渡して幹ノードを
  ツリーから外し、ページ側で `grid sm:grid-cols-2`（PC 横並び / スマホ縦）に出す。幹ノードが無いとき
  幹線は最初の方法カードの中央から始める。dense（`/experiences/paths`）は従来どおり inline。
- **方法カードを横長＆コンパクトに**：カード padding `p-4`→`px-4 py-3`、行間 `pb-5`→`pb-2.5`（10px）、
  カード内を「① ラベル＋方法名 ／ ② 結果・できた％・試した時期を 1 行 ／ ③ 詳細 `<dl>`」の 3 段に。
  方法名は CJK でも 1 文字折り返しにならないよう flex ではなく `<p>` で扱う。詳細 `<dl>` は
  `space-y-0.5`。幹ノード（NodeBox）も `py-2`→`py-1.5`。
- 線・接続点は既存のまま（幹線＝各行の `left-0` セグメント、接続点＝カード左枠線の縦中央の「食い込んだ半円」）。
- 文言：イントロを 1 行に短縮。下部 CTA を「あなたの試した方法も、誰かの次の一歩になります。／
  自分の困りごとや、試したことを記録してみませんか？」に、注意書きに「うまくいかなかった方法も、
  次の人にとって大切な情報です」を追加。
- **v3: 「できていたこと」を常に表示＋アイコン**：上部 2 カードは `r.previouslyAble` の有無に関わらず
  必ず出す（`previously_able` の実データを表示。空なら**内容を生成せず**「まだ登録されていません」）。
  ラベルは「できていたこと」/「やりたいこと」。それぞれ絵文字アイコン（👤 / 🎯、`aria-hidden`、
  `text-sm` ≒16px）を付与。方法カードの状態アイコンは既存 `ResultBadge`（`RESULT_META.icon` の絵文字）
  で既に表示済み。アイコンだけに頼らず状態名の文字は必ず残す（指示書 9）。
- **v1 サイド配置: 参考情報＋CTA を PC で右サイドへ**：`/experiences/[id]` を `max-w-4xl`→`max-w-5xl`。
  `lg` 以上で `grid-cols-[minmax(0,1fr)_17rem]`（メイン ≒73% / サイド 272px、`items-start`）。
  左＝道の本体（道 Card ＋ 写真）、右＝`<aside>`（① ℹ️ この情報について＝既存の注意書き文言そのまま、
  ② 🌱 CTA カード＝ボタンはサイド幅いっぱい）。`lg` 未満は 1 カラムで「道 → 参考情報 → CTA」の順に
  戻る。ページング・データ・API は不変（レイアウトのみ）。道の下に補足カードは残さない。

### 2026-09-03 枝分かれ（親子）をページ境界で分断しない
- 指示書「道の見える化 ページング修正指示書 v1」。詳細ページのツリーを 10 件で機械的に切ると
  「方法J」と「方法J-2」のような枝分かれがページをまたぐことがあった。
- 変更前: `paginateDetailRows` が `buildRoadDetailRows` の表示順を `DETAIL_PAGE_SIZE=10` で
  `slice` するだけ。root の部分木がページ境界で割れた。
- 変更後: `splitDetailRowsIntoPages(all, pageSize=10)` を新設。root（`depth===0`）＋その
  `previous_attempt_id` 子孫を 1 グループとして扱い、グループ単位でページへ詰める。
  優先順位は ① 親子・枝分かれの連続 → ② グループのまとまり → ③ 1 ページ ≒ 10 行。
  ページに行があるうちは次グループが 10 を超えても `pageSize` 未満なら同ページに詰める（11・12 行を許容）。
  ページが `pageSize` に達したら次グループは次ページ先頭へ。1 グループが `pageSize × 1.5`（=15）を
  超えるならそのグループ全体を次ページ先頭へ送る。単独で 10 超のグループは分割せず 1 ページ占有。
  `paginateDetailRows` はこの結果からページを 1 枚取り出すだけ（`pageCount` は実生成ページ数）。
  グループは割れないので `continuesFromLabel` は通常付かない（保険で判定は残置）。
- 影響範囲: `src/lib/road-detail.ts`（`splitDetailRowsIntoPages` 追加・`paginateDetailRows` 書き換え）、
  `src/lib/queries.ts#treePageByAttempt`（方法カードの `treePage` も同じ分割を使用）、
  `tests/unit/road-detail.test.ts` / `tests/e2e/branching-paths.spec.ts`。
- 変更しないもの: データの並び順・sort・親子関係・DB・API・検索・結果 5 分類。フロントの分割ロジックのみ。
- 将来への影響: 「10 で切る」より「道を分断しない」を優先。1 ページの行数は目安。

### 2026-09-03 トップ画面 UI 刷新（検索を主役に・ラインアイコン統一・実データの道プレビュー）
- 指示書「トップ画面 UI・デザイン刷新指示書 v1」。説明サイト調から「誰かの経験を探しに行く」画面へ。
  機能・API・DB・検索/ページングロジック・遷移・結果 5 分類は一切変更しない（表示のみ）。
- **ラインアイコンの内蔵セット** `src/components/icons.tsx`（新規）: 外部ライブラリを増やさず、
  Lucide 系 24 グリッドの線画（MIT）を必要分だけ内蔵。すべて `currentColor` / 既定 `aria-hidden`。
  `resultIcon(result)` で結果 5 分類 → アイコン（`resultMeta()` の色・ラベルと併用。色/アイコン単独では
  状態を伝えない）。`RESULT_META.icon`（絵文字）は据え置き＝一覧・詳細の `ResultBadge` は不変。
- **ファーストビュー = 検索**: `page.tsx` の hero を `card` 1 枚に集約（ブランド行「できる道」＋
  「「できない」を終点にしない。」＋ `SearchBox` ＋ 例チップ）。`SearchBox` は入力欄の左に検索アイコン、
  送信ボタンにも検索アイコン（ボタンのアクセシブル名は「似た経験を探す」のまま＝`critical-flow` 維持）。
  例チップは枠線付き pill、hover で枠線＋背景が primary。
- **サービスの流れ**: 「できない → 探す → 道を見る → 試す → 残す」を丸アイコン＋ラベルで可視化。
  PC/タブレット横並び、スマホ縦（矢印は right アイコンを `rotate-90`）。装飾なので `<div>`＋
  見出し `sr-only`（リスト semantics は付けない）。
- **できる道とは（短縮）＋結果の見かた**: 説明文を 2 文に圧縮。結果 5 分類をラインアイコン＋
  ラベルのチップ列で提示（ラベルは ink 色。色は `aria-hidden` のアイコンのみ＝コントラスト安全）。
  「うまくいかなかった」を赤警告にせず accent-soft の囲みで「道の一部」と添える。
- **道プレビュー**: `getPathClusters({limit:3})` の**実データ**をカード化（`border/bg` は primary-soft、
  §10 の「線＋接続点＋カード」に合わせて縦スパイン＝`bg-primary opacity-25` の線＋左に丸ドット、
  各ステップに方法名＋結果アイコン/ラベル）。カード全体が 1 つのリンク。ダミーデータは追加しない。
  グリッドは `1 → md:2 → lg:3` 列（§20）。
- **CTA**: primary-soft の囲みに「あなたの試したことも、誰かの次の一歩になります」＋
  ＋アイコン付き「自分の道を作る」（文言は既存のまま）／「経験を探す →」。
- **モーション**: `.rise-in`（`globals.css`）は `transform` のみの控えめな立ち上がり。透明度は
  動かさない（フェード中にテキストのコントラストが落ち axe が拾うため）。reduced-motion は
  既存の全体ルールで無効化。
- 影響範囲: `src/app/page.tsx`、`src/components/search-box.tsx`、`src/components/icons.tsx`（新規）、
  `src/app/globals.css`（`.rise-in`）。`layout.tsx` / トークン / 他画面は不変。
- 確認: PC(1280) / タブレット(834) / スマホ(390) で横スクロールなし、a11y（axe serious/critical 0）、
  E2E 70 / Vitest 92 すべて green。
- **v2 ブラッシュアップ（指示書「トップ画面 最終UIブラッシュアップ指示書 v2」）**：作り直しではなく順序・
  余白・実例カードの調整。
  - **セクション順**：hero（メッセージ＋検索）→ **できる道とは** → 利用の流れ → 試した結果の見かた →
    いろいろな方法が試されています → CTA。「利用の流れ」を「できる道とは」の**後ろ**に移動（意味を
    理解してから使い方、という順）。「利用の流れ」は「できる道とは」セクション内に置き、説明文の
    すぐ下（`pt-3`＝約 12px）に。
  - **余白を圧縮**：外側を `space-y-12 sm:space-y-16` → `space-y-10`（40px）。セクション内は
    `space-y-3`〜。ページ高が数十 px 縮む（間延び解消）。
  - **結果セクションを分離**：見出し「試した結果の見かた」＋ 5 分類チップ＋ accent-soft の
    「うまくいかなかった も道の一部」注記を独立セクションに。
  - **実例カード**：タイトルアイコンを `IconRoute` → `IconFootprints`（👣、§14）。カード下部に
    「{件数}つの方法を試した道」＋「この道を見る →」を `flex-1` で最下部そろえ（3 枚の高さ一致）。
    hover は `-translate-y` → `hover:shadow-[var(--shadow-lift)]` ＋「この道を見る」に
    `group-hover:underline`。補足文を「実際に記録された道の、ほんの一部です。」に。
  - **CTA を控えめに**：枠を `border-[var(--color-primary)]` → `border-[var(--color-border)]`、
    padding `p-6 sm:p-8` → `p-5 sm:p-6`、中央寄せをやめ左寄せ、`IconSprout`（新規）を見出しに付与、
    ボタンは «自分の道を作る» 1 つだけ（「経験を探す」二次ボタンは削除。ヘッダー・hero と重複のため）。
  - 影響範囲は v1 と同じファイル＋ `icons.tsx` に `IconSprout` 追加のみ。API/DB/データ/遷移は不変。
- **検索入力欄の浮き上げ（指示書「検索入力欄 UI 改善 v1」）**：`search-box.tsx` のみ。入力場所が
  一目で分かるよう、入力欄を親カードから一段浮かせる。
  - 並び：大きな問い「何ができなくて困っていますか？」（`<p>` に降格）→ 補足 → **小ラベル
    「あなたの困りごと」**（`<label htmlFor>` に昇格。placeholder をラベル代わりにしない。§20）→
    入力欄 → 送信ボタン → 音声入力。`space-y-3` をやめ、ラベルと入力欄は `mt-1.5` で近づける。
  - 入力欄：白地、`border-2` のやわらかいグリーン枠
    （`color-mix(in srgb, var(--color-primary) 32%, white)`）、`shadow-[0_1px_2px_rgba(46,42,38,.06)]`
    （カードの影より弱い）、高さ ≒ 50px、角丸は `--radius-md`（14px、カードの 20px より小さい）、
    左に `IconSearch`（`--color-primary` 色）。`focus:border-[var(--color-primary)]` で枠だけ強める
    （フォーカスリングは既存の全体 `:focus-visible` outline に任せる。新しい発光は足さない）。
  - 音声入力ボタン（`VoiceInputButton`）は既存のまま＝枠線＋surface 地で主操作より控えめ。処理は不変。
  - 検索候補チップ（`page.tsx` 側）は従来どおり別ブロック。役割の違い（自分で入力／入力を助ける選択肢）
    が視覚的に分かる。
  - `size="compact"`（未使用のバリアント）は従来どおり `sr-only` ラベルのみ。
  - テスト追従：`critical-flow.spec.ts` の searchbox 参照名を「あなたの困りごと」に更新。
  - 影響範囲: `src/components/search-box.tsx`、`tests/e2e/critical-flow.spec.ts`。API/DB/検索/音声処理は不変。
- **v2 再修正（指示書「トップ画面 UI 再修正 v2」）：入力欄の浮きを強める＋説明 2 セクションをカード化**。
  - **検索入力欄**：`border-2` の緑枠 → `border`（1px）＋やわらかいグリーン
    （`color-mix(...30%,white)`）＋`shadow-[0_2px_6px_rgba(46,42,38,.06)]`（白面が一段浮いて見える。
    3D ボタンにはしない）、角丸 `rounded-[12px]`、フォーカスで枠＝primary＋影を少しだけ強める
    （`focus:shadow-[0_2px_10px_rgba(46,42,38,.09)]`。発光はしない）。
  - **「できる道とは」「試した結果の見かた」をカード化**：どちらも `Card`（白・薄枠・弱い影・
    `p-5`）に。`page.tsx` で `grid gap-4 md:grid-cols-2 md:items-stretch` に入れ、**PC/タブレットは
    横並び・高さ揃え、スマホは 1 列**。見出しにラインアイコン（`IconLightbulb` / `IconEye`＝新規）。
  - **利用の流れはカード内へ**：横 5 分割 `justify-between` をやめ、`flex flex-wrap` ＋各ステップ
    `inline-flex`（丸 `h-8 w-8`）＋矢印を `contents` で独立折り返しに。半幅カード内で 3＋2 に折り返す。
  - カードのリズム：検索カード → 説明カード×2 → 実例カード×3 → CTA カード。ページ高も短縮
    （PC ≒ 1944 → 1790px）。実例カード・CTA は v2 から変更なし。
  - `icons.tsx` に `IconLightbulb` / `IconEye` 追加。API/DB/データ/検索/遷移は不変。
- **v3 微調整（指示書「トップ画面 最終微調整 v3」）：入力欄のフォーカス色＋実例カードの情報量**。
  - **赤・オレンジの二重線をやめる**：原因は ① `SearchBox` の `autoFocus`（読み込み時に全体
    `:focus-visible` の accent(#d1552f) outline が出てエラー状態に見えた）＋ ② その outline 自体。
    → `page.tsx` の `<SearchBox>` から `autoFocus` を外す（初期表示でフォーカスを奪わない）。
    → 入力欄に `focus-visible:outline-none` ＋ 枠＝primary ＋ やわらかいグリーンの
    `0 0 0 3px` リング（`color-mix(...28%,white)`、offset なし＝二重線に見えない）。
    ベースの影は `0 2px 8px rgba(46,42,38,.05)` に微調整。**バリデーションエラー表示の仕組みは不変**
    （このフォームは送信で遷移するだけでインラインエラーは持たない）。
  - **実例カードの情報量を整理**：方法テキストを `line-clamp-1`（1 行＋末尾省略。`truncate` は
    `nowrap` でスマホ横スクロールを誘発したため不可）。「{件数}つの方法を試した道」の行を削除。
    道の縦線・ドット・結果アイコン＋ラベル・「この道を見る →」（`flex-1` で下端そろえ）は維持。
    詳細は「この道を見る」先で確認。データ・件数・結果分類は不変。
  - 影響範囲: `src/components/search-box.tsx`、`src/app/page.tsx`。

### 2026-09-03 「経験を探す」をトップ画面のデザイン言語に統一
- 指示書「経験を探す UI デザイン統一 v1」。全面刷新ではなく、トップ画面で整えた
  「浮いた入力欄＋カード UI」を `/experiences` にも適用。API/検索ロジック/DB/結果分類/タグ/
  ページング/音声処理/遷移は不変。
- **検索フォーム（`experience-search-form.tsx`）**:
  - 入力欄をトップと同じ「浮いた入力欄」に（`sr-only` ラベル → 可視「あなたの困りごと」、
    左に `IconSearch`、白地＋`color-mix(...30%,white)` の 1px 枠＋`0 2px 8px .05` 影、
    `rounded-[12px]`、フォーカスはやわらかいグリーンの `0 0 0 3px` リング。赤・オレンジの通常枠なし）。
  - **検索と絞り込みを視覚的に分離**：入力＋音声の下に `border-t` ＋ 小見出し「絞り込み」
    （`IconSlidersHorizontal`）。その下に 4 セレクト（`sm:grid-cols-2 lg:grid-cols-4`、
    角丸 `10px`・`focus-visible:border-primary` に統一）。
  - 「この条件で探す」「条件をクリア」を `ui.tsx` の `Button`（primary / secondary）に統一
    ＝トップの主要ボタンと同じ `BTN_BASE`。前者に `IconSearch`。
  - カード padding を `p-4` → `p-5 sm:p-6`、`space-y-4` → `space-y-5`。
- **道カード（`road-card.tsx`）**: 白カードのまま（一覧は白が読みやすい＝指示 §19）、トップの
  実例カードと同じ「方法の縦線（●│●│●）」に。`・` 箇条書き → `<ol>`＋絶対配置の縦線＋ドット、
  方法（`line-clamp-1`）の下に `ResultBadge`。見出しに `IconFootprints`。`flex h-full flex-col`
  ＋「この道を見る」を `mt-auto`＋`IconArrowRight` で下端そろえ。`MAX_METHODS` 4 → 3（一覧の
  スキャン性。総数「試したこと（N）」の表示は不変＝e2e 依存）。「だれかの道」ラベルは維持（e2e）。
- `method-card.tsx` は変更なし（緑＝道詳細ツリーと同系。既存決定と e2e を尊重）。
- `icons.tsx` に `IconSlidersHorizontal` 追加。
- 影響範囲: `src/components/experience-search-form.tsx` / `road-card.tsx` / `icons.tsx`。
  `src/app/experiences/page.tsx` は不変。

### 2026-09-03 検索カードを淡いグリーンに（探す＝緑 / 見る＝白）
- 指示書「トップ画面 検索カード背景色変更 v1」。白い面が連続してメリハリが弱いため、役割で
  色を分ける：**探す・行動する面＝淡いグリーン／説明・結果を見る面＝白**。
- `tokens.css` に `--color-primary-tint: #edf7f3`（`--color-primary-soft #e3f1ec` よりさらに淡く
  白に近い緑）を追加。
- トップの hero セクションと `ExperienceSearchForm` の外枠を `.card`（白）から
  「`--radius-lg` ＋ `--color-border` の枠 ＋ `--shadow-card` ＋ `bg-[var(--color-primary-tint)]`」
  に置換（`.card` は背景が白固定のため、非白カードは既存パターン同様に手組み）。
- **入力欄は白のまま**（`bg-[var(--color-surface)]`）＝淡い緑の面の中に白い入力欄が浮く 2 段構造。
  赤・オレンジの通常枠は無し（v3 のフォーカス仕様のまま）。
- 説明カード（できる道とは／試した結果の見かた）＝白のまま。実例カード・CTA＝`--color-primary-soft`
  ＋緑枠のまま（検索カードよりわずかに濃い緑で役割を区別）。補足＝`--color-accent-soft` のまま。
- コントラスト：`#edf7f3` 上で ink / ink-muted / primary いずれも AA 以上（axe serious/critical 0）。
- 影響範囲: `src/styles/tokens.css` / `src/app/page.tsx` / `src/components/experience-search-form.tsx`。
  機能・API・DB・検索・音声処理・遷移は不変。

### 2026-09-03 「自分の道を作る」フォームカードも淡いグリーンに（3 画面統一）
- 指示書「自分の道を作る 背景色統一 v1」。トップ・経験を探すと同じルール（探す／作る面＝淡いグリーン、
  実際に入力する欄＝白）を `/me/roads/new` にも適用。
- `road-form.tsx` の `<fieldset>` を `.card`（白）→ `--color-primary-tint` の手組みカード
  （`--radius-lg` 枠＋`--shadow-card`）に。エラー表示・「この道を作る」ボタン・下部の補足文は
  従来どおりフォームカードの**外**（生成り地）に置く。
- `form.tsx` の `CONTROL`（TextField / TextAreaField 共通の入力欄クラス）に
  `shadow-[0_1px_2px_rgba(46,42,38,.04)]` を追加＝緑の面に白い入力欄がわずかに浮く。
  白カード上の他フォーム（attempt-form / road-edit-form）でもごく薄く自然。border/角丸/色は不変。
- 通常状態の赤・オレンジ枠なし（`CONTROL_OK` は `--color-border` のまま）。エラーは `CONTROL_ERR`
  （`--color-danger` 枠）の既存仕様を維持。文字数カウンタ・音声入力・日付入力も同じ体系のまま。
- コントラスト：`#edf7f3` 上でラベル・ヒント・カウンタ・本文いずれも AA 以上（axe「自分の道を作る」
  serious/critical 0）。
- 影響範囲: `src/components/road-form.tsx` / `src/components/form.tsx`。入力項目・保存処理・
  バリデーション・音声処理・遷移・文言は不変。

### 2026-09-03 トップに画像素材（1.png / 6.png）を組み込み
- 指示書「トップ画面 画像素材組み込み v2」。`public/` に追加された 7 枚のうち **1.png / 6.png のみ**使用
  （2〜5・7.png は未使用。指示どおり）。機能・API・DB・認証・検索は不変、`page.tsx` の見た目のみ。
- **配置**: 1.png（「できる道」＋タグライン＋丘と道のイラストが描かれたヒーローバナー）をページ最上部の
  ファーストビューに。6.png（「できる道とは」＋できない→探す→道を見る→試す→残す のフロー図）を
  「できる道とは」セクションに。画像内に描かれた見出し・説明文・利用フローは HTML で二重表示しない
  （ブランド行・タグライン・FLOW 配列・説明段落を `page.tsx` から削除）。`FLOW` 定数と
  `IconTarget/IconSearch/IconRoute/IconCompass/IconLightbulb` の import を削除。
- **重複回避のための構造変更**: 「できる道とは」は landmark 用の `<h2 class="sr-only">` ＋ 6.png のみ。
  それに伴い「試した結果の見かた」は単独の `<Card>`（データ上の意味を持つので画像化せず HTML のまま。
  §15）。v2 で作った `md:grid-cols-2` の 2 枚組みは解消（画像を読みやすい全幅に）。
- **本物の検索フォームは維持**（`SearchBox`）。画像内の検索バー風要素は操作対象にしない。実例カード・
  CTA・結果 5 分類は変更なし。7.png は使わず既存 CTA のまま。
- **画像最適化**: `next/image` で配信（生 PNG 1.5〜1.7MB → ブラウザには WebP で 6.png ≒ 40〜90KB /
  1.png ≒ 22〜33KB、viewport 別リサイズ）。元 PNG は `public/` に保持。1.png に `priority`（LCP）。
- alt は内容を説明するテキストを設定（装飾ではなく情報として扱う）。四隅の欠け・ダーク vignette は
  両画像とも無し。PC / タブレット / スマホで横スクロールなし。
- 影響範囲: `src/app/page.tsx`、`public/1.png`・`public/6.png`。
- **v3 追加**: 指示書「トップ画面 追加 v3」で `3/4/5.png` も追加。検索カードと「できる道とは」の間に
  新セクション **「できる道で、できること」**（h2 ＋ 3 カード）を挿入。各カードは画像バナー
  （`aspect-[16/9] object-cover`、`objectPosition` を画像ごとに調整して四隅のダーク vignette を
  フレーム外へ）＋ 短い h3 ＋ 1 文（焼き込み文と重複させない）。`sm:grid-cols-2 lg:grid-cols-3`。
  役割分担：3〜5＝「何ができる・どんな価値か」／6.png＝仕組み（フロー）／1.png＝世界観。
  画像内のボタン・カード・検索欄はイラストであり操作対象にしない。実データの実例カード（§13）は不変。
  2.png / 7.png は今回も未使用。5 枚合計の最適化後転送量 ≒ 340KB/ロード（WebP、viewport 別）。
- **v4 追加**: 指示書「トップ画面 追加 v4」で最下部 CTA に **7.png のみ**追加（2.png は未使用）。
  7.png は左半分に見出し・説明・「自分の道を作る」ボタンが焼き込まれているため、**右側の風景部分だけ**
  切り出した `public/7-scene.png`（692×941、元は保持）を装飾ビジュアルとして使用。CTA を
  `flex-col sm:flex-row` にして左＝本物の HTML（見出し・本文・`LinkButton href="/me/roads/new"`）、
  右＝`7-scene.png`（`fill` / `object-cover` / 左端を `mask-image` で card 色へフェード＝継ぎ目消し、
  `sm:w-[38%] max-w-[22rem]`、スマホは下部 `h-24` の帯）。画像内のボタン・文言は操作対象にしない。
  `alt=""`（装飾）。CTA の遷移先・文言・機能は不変。影響範囲: `src/app/page.tsx`、
  `public/7-scene.png`（新規・7.png のクロップ）。

### 2026-09-03 サイトアイコン（favicon / ブランドアイコン）
- ブランドアイコン画像（青×橙の 2 人が作るハート＋中央の道、1254×1254 透過 PNG）を正式な
  サイトアイコンに設定。従来 favicon 設定は皆無だったため「二重・旧設定の除去」は不要。
- Next App Router のファイル規約で配置（`layout.tsx` の `metadata` は触らず、link タグは自動生成）:
  - `src/app/icon.png` — 透明マージンをタイトクロップ → 512×512（`<link rel="icon" type="image/png">`）
  - `src/app/favicon.ico` — 16/32/48/64 のマルチサイズ（`<link rel="icon" type="image/x-icon">`、`/favicon.ico`）
  - `src/app/apple-icon.png` — 180×180。iOS は透過を黒地に合成するため、**apple-touch-icon のみ白地**
    に載せた（ロゴの色・形は不変。他は透過のまま）。
  - 元の `public/icon.png` は削除（`src/app/icon.png` と `/icon.png` ルートが衝突するため）。
- デザインは無改変（外枠・角丸・背景・色・文字の追加なし）。16px でも「2 人・ハート・中央の道」が識別可能。
- PWA/manifest は元々存在しないため新規作成しない。影響はサイトアイコンのみ（DB/API/UI 不変）。
- 追記: ヘッダーのロゴも絵文字 `🛤️` から同じブランドアイコンへ差し替え（`site-header.tsx`）。
  `next/image` で使うため `public/brand-icon.png`（`src/app/icon.png` と同一の 512px 透過）を用意
  （`src/app/icon.png` は `/icon.png` ルートを占有していて直接は使えないため別ファイル）。
  ヘッダーでは `h-7 w-7`、`alt=""`（隣に「できる道」の文字があるため装飾）。

### 2026-09-03 「表示する種類」を検索ワード無しでも切り替え可能に
- 以前は「kind は語のマッチ結果なので語があるときだけ」という判断で、検索ワードが空だと
  `kind` セレクトを `disabled` にして "road" 固定にしていた。ユーザー要望で撤回し、**語の有無に
  関わらず 道/方法/両方 を切り替えられる**ように（語なしで「方法だけ」＝公開された試したことの一覧）。
- `experience-search-form.tsx`: `disabled`／`shownKind` 固定／「検索ワードを入れると…」ヒントを削除。
  `submit` は語が無くても `kind !== "road"` なら URL に付与。
- `experiences/page.tsx`: `roadEnabled = q.kind !== "method"` / `methodEnabled = q.kind !== "road"`
  （`Boolean(q.q)` 条件を撤去）。方法セクションの見出し・説明を語なしでも成立する文言に
  （語あり「「X」が方法の中にあった記録」／語なし「試したことの記録」）。
- `queries.ts#searchMethods`: 先頭の `if (!q.q?.trim()) return base;` を削除。`buildMethodSearchWhere`
  は元々 `isPublished:true` ＋任意の result/tag だけで成立するので、語なしは公開 Attempt の
  ページング一覧になる（`MAX_RESULT_WINDOW` / `mp≤100` / `limit≤50` の窓は不変）。
- `constants.ts`: `EXPERIENCE_KIND_LABEL` から「〜に一致」を外し「道（困りごと・目標）だけ」等に。
- テスト追従: `search-split.test.ts`（「語が無ければ空」→「語が無くても公開分を一覧＋result で絞れる」）、
  `branching-paths.spec.ts:198`（「道だけ・変更不可」→「語なしでも kind=method で方法一覧が出る」）。
- **追記: 既定値を `road` → `both`（道と方法の両方）に**（ユーザー要望）。`EXPERIENCE_KIND_DEFAULT`
  を変更。`experienceQuerySchema` の `.default()`、フォームの `defaultKind` / `clear()` の初期値も
  この定数を参照。URL には既定と異なるときだけ `kind` を付ける（`kind !== EXPERIENCE_KIND_DEFAULT`）。
  → `/experiences`（クエリなし）は道カードの下に方法カードの一覧も出るようになる。
  テスト追従: `branching-paths.spec.ts` の「既定は道だけ」前提のアサーションを `kind=road` 明示／
  既定値 `both` に更新。

### 2026-09-03 「自分の道」詳細画面のレイアウトを「経験詳細」に揃える（機能・文言は不変）
- 指示書「自分の道詳細 レイアウト統一 v1」。`me/roads/[roadId]/page.tsx` のみ。
  - 中央コンテナ: `max-w-6xl space-y-6` → **`max-w-5xl space-y-8`**（`/experiences/[id]` と同一。
    本文幅・左右余白・セクション間余白が他の詳細画面と揃う。実測とも 1024px で一致）。
  - 上部ブロック: 戻るリンク＋`<header>` を `<div className="space-y-4">` で囲う（経験詳細と同じ骨格）。
  - 「試したことが 0 件」の空状態を素の `card p-5` の `<p>` → `<Card>` に（カードの見た目を統一）。
  - 2 カラム化はしない: このページには経験詳細のような「補足」サイド内容（免責 Callout / 作成 CTA）が
    無く、指示書 §8「情報量が少ないのに 2 カラムで空白を増やさない」に従い 1 カラム維持。
  - カードは既存の `<Card>`（`.card` = `--color-border`）のまま＝経験詳細と同じ。検索カード類の緑枠
    には合わせない（参照画面が経験詳細のため）。
  - 「道のあらまし」の `StepFlow`（点＋線）＝既存の「道」UI 言語を維持。新しいイラスト・道路画像は
    追加しない（§13）。削除ボタンは従来どおり最後に細い `border-t` ＋ danger アウトライン。
- 機能・API・DB・遷移・文言は不変。他画面への影響なし（共通コンポーネントは変更していない）。
- **v2 デザイン改善（指示書 v2）**: 装飾は増やさず、アイコン・色・点線でカードの階層を整える。
  - 各カードを白地＋`border-[var(--color-primary)]`＋`--shadow-card` に統一（ページ内の
    `<Card>` は `.card` の border-color 固定で緑にできないため手組み。共通 `Card` は変更しない）。
  - セクション見出しに小アイコン: 道のあらまし＝`IconSprout`、試したこと＝`IconNotebookPen`（新規）、
    次に試す材料＝`IconLightbulb`（`accent-soft` の丸に coral）。タイトルにも小さな `IconSprout`。
  - 試したことが複数あるとき、`<ol>` に緑の縦線＋各カード左に丸ドット（`ring-4 ring-canvas`）で
    「試行錯誤が道になる」時系列表現に。単発カードの羅列に見えないように。
  - 空状態は `bg-[var(--color-primary-tint)]` のごく淡い緑＋中央にアイコン＋
    「まだ記録がありません」を太字の見出し行に（説明文の内容は不変）。
  - `StepFlow`（あらまし内、単一利用）の縦線を `--color-border` → `color-mix(primary 28% + white)` に。
  - `NextStepHelper`（単一利用）を緑枠カード化＋電球アイコン。AI 感を出さず「一緒に探す」トーン維持。
  - 大きな道路画像・背景イラスト・カードごとの大イラストは追加しない（§13）。2 カラム化もしない。
  - テスト追従: `critical-flow` / `road-create` の空状態アサーションを `まだ記録がありません`（句点なし）に。
  - 影響範囲: `me/roads/[roadId]/page.tsx` / `next-step-helper.tsx` / `ui.tsx`(StepFlow 線色) /
    `icons.tsx`(`IconNotebookPen` 追加)。他画面は不変。

### 2026-09-03 「試したことを記録」画面を意味のまとまりで整理（機能・文言・項目は不変）
- 指示書「試したことを記録 レイアウト整理 v1」。入力項目・必須/任意・文字数・結果 5 分類・保存・
  バリデーション・音声入力・写真仕様・公開/非公開・遷移は不変。`<label>` の文言も全て据え置き
  （e2e が `getByLabel("何を試しましたか？")` / `getByRole("radio",{name:/^…/})` に依存）。
- **ページ枠**（`attempts/new` と `attempts/[id]/edit` の両方）: `max-w-6xl space-y-5` →
  `max-w-5xl space-y-8`（自分の道詳細と統一）、戻る＋見出しを block でまとめ、h1 に `IconNotebookPen`。
- **`attempt-form.tsx`**: 縦一列のフォームを 6 つの緑枠カード（`Section` ヘルパー、詳細画面と同じ
  `border-[var(--color-primary)]`＋`--shadow-card`）に整理:
  ① 試したこと（`IconFlask`）＝何を試したか＋音声 ／ ② 結果（`IconCheckCircle`）＝5 択カード＋できた度 ／
  ③ 気づき・変化（`IconHeart`）＝気持ち＋その後 ／ ④ 次の一歩（`IconLightbulb`）＝次に試すこと ／
  ⑤ 記録情報（`IconNotebookPen`）＝時期・メモ・前に試した方法・タグ・写真 ／ ⑥ 公開設定（`IconGlobe`）。
  中の `<Field>` / `TextField` / `TextAreaField` / radiogroup / 写真 input は移動しただけで内容は不変。
- **結果 5 択の選択色**: 選択時の色を一律 `primary-soft` → **結果ごとの `--color-result-*` トークン**
  （`style` で `border`/`background`。success=緑, partial=イエロー, no_change=ニュートラル,
  failed=淡いオレンジ(#b4480e/#fbe8dd), ongoing=ブルー系）。「うまくいかなかった」は強い赤にしない。
  絵文字（`RESULT_META.icon`）とラベル・説明は不変＝色だけに依存しない。
- 大きなイラスト・道路画像は追加しない。`icons.tsx` に `IconFlask` / `IconHeart` / `IconGlobe` 追加。
- 影響範囲: `attempt-form.tsx` / `attempts/new/page.tsx` / `attempts/[attemptId]/edit/page.tsx` /
  `icons.tsx`。編集画面も同じフォームなので同じ見た目になる。

### 2026-09-03 「道を編集」画面も意味のまとまりで整理（機能・文言・項目は不変）
- 指示書「道を編集 レイアウト整理 v1」。入力項目・必須/任意・文字数・保存・バリデーション・
  遷移は不変。`<label>` 文言も全て据え置き。単一利用コンポーネント（`RoadEditForm`・編集画面専用）。
- **ページ枠**: `max-w-6xl space-y-5` → `max-w-5xl space-y-8`、戻る＋見出しを block に、h1 に `IconSprout`。
- **`road-edit-form.tsx`**: 縦一列を 4 つの緑枠カード（`attempt-form.tsx` と同じ `Section`）に整理:
  ① 道の基本（`IconSprout`）＝タイトル ／ ② この道について（`IconRoute`）＝以前できていた／
  できなくなった／やりたいこと ／ ③ 今の状態（`IconMapPin`・新規）＝いつ頃から／困っている場面／
  状態／いまの進捗 ／ ④ 次の一歩・記録（`IconLightbulb`）＝次に試すこと／メモ／タグ。
  中の `TextField` / `TextAreaField` は移動しただけ。イラスト無し。
- `icons.tsx` に `IconMapPin` 追加。影響範囲: `road-edit-form.tsx` /
  `me/roads/[roadId]/edit/page.tsx` / `icons.tsx`。
- **付記（DB 掃除）**: 開発 DB に、作成/編集フォームの誤送信で出来たゴミ道 2 件（difficulty が
  「何ができなくなりましたか？」「できなくなったこと」＝フォームのラベル文字列そのもの、実 Google
  ユーザー所有）が残り、`updatedAt desc` で `/experiences` の先頭に来て
  `branching-paths.spec.ts:110`（先頭カードの試したこと ≥ 2 件）を落としていた。実データではない
  ため当該 2 件のみ削除。E2E 70 / Vitest 92 green（コード起因の失敗ではない）。

### 2026-09-03 検索の道カード（RoadCard）の枠線も `--color-primary` に統一
- `road-card.tsx`: `.card`（`--color-border` の枠）から手組み `<article>` に
  （`rounded-[var(--radius-lg)]` ＋ `bg-[var(--color-surface)]` 白 ＋ `shadow-[var(--shadow-card)]`
  ＋ `hover:shadow-[var(--shadow-lift)]` は同じ）、枠線を `border-[var(--color-primary)]` に。
  これで **道カード（検索）／方法カード（検索）／「自分の道」カード**の 3 種が同じ緑枠に揃った。
  情報・レイアウト・遷移は不変。

### 2026-09-03 「自分の道」カードの枠線・アイコンを検索カードに合わせる（見た目のみ）
- 指示書「自分の道カード UI改善 v1 / 枠線調整 v1」。カードの情報・件数・公開状態・遷移は不変。
- `me/page.tsx`: 道カードを `<Card>`（= `.card`、border-color 固定で上書き不可）から手組み
  `<article>` に。`rounded-[var(--radius-lg)]` ＋ `bg-[var(--color-surface)]`（白）＋
  `shadow-[var(--shadow-card)]` は同じ。
  - **枠線**: ユーザー指定で検索の方法カード（`MethodCard`）と同じ `border-[var(--color-primary)]`
    （full green `#1f6f60`、1px）。`transition-shadow hover:shadow-[var(--shadow-lift)]` も MethodCard と同様。
    （途中経緯: 白 → `color-mix 28%` → `32%`＋hover 濃く → 最終的に MethodCard と同一の `--color-primary`。）
  - **アイコン**: `IconSprout`（上）→ 検索カード（`RoadCard`）と同じ `IconFootprints`（タイトル
    `<p>` 内インライン、`mt-0.5 h-4 w-4 shrink-0`）。カード高さは元のまま。
  - 空状態の 🌱・「道を作る」ボタンは据え置き。
- 空状態（`EmptyState icon="🌱"`）・「道を作る」ボタンは変更なし。
- 影響範囲: `src/app/me/page.tsx`。PC(2 列)/スマホ(1 列)確認、横スクロールなし。

### 2026-09-03 （撤回）検索結果カードへのテーマ挿絵
- 「薬」カードに小さな挿絵を入れたが、ユーザー判断で不採用。`RoadCard` は挿絵追加前の状態に戻し、
  `src/components/card-art.tsx` は削除。結果カードは文字＋実データのみで維持する。

### 2026-09-03 ヘッダーの視認性・操作性を微調整（見た目のみ）
- 指示書「ヘッダーUI改善 v1」。機能・リンク・遷移先・認証・文字サイズ機能は不変。構造も維持
  （新ナビ・ハンバーガーは追加しない）。
- `site-header.tsx`: 行 padding `py-3` → `py-3.5`（窮屈さ解消。ヘッダー高 ≒ 60 → 73px 程度）。
  ロゴアイコン 28 → 32px、`gap-1.5` → `gap-2`。ナビは `font-medium`、`自分の道` のみ `font-semibold`
  （色は変えず weight だけ控えめに強調）。
- `font-size-control.tsx`: A/標準/大/特大 のボタンを `min-h-0`（≒24px）→ `min-h-[36px]` ＋
  `px-2 py-1` → `px-2.5` + `inline-flex items-center`、group `gap-1` → `gap-1.5`、「A」を
  `text-sm font-semibold`、非選択にホバー。アクセシビリティ機能なので操作領域を確保（ヘッダーが
  極端に高くならない範囲で）。挙動（localStorage 保存・`data-font-scale`）は不変。
- 背景は白のまま、境界は既存の細い `border-b`。大きな画像・イラストは追加しない。
- 影響範囲: `site-header.tsx` / `font-size-control.tsx`。axe（全主要画面）・E2E green、横スクロールなし。
- 追記: ヘッダーを画面上部に固定（`sticky top-0 z-40`）。背景は不透明の `--color-surface` なので
  本文がきれいに下を通る。`globals.css` の `html` に `scroll-padding-top: 5rem` を追加し、
  スキップリンク（`#main`）等のアンカー先が固定ヘッダーに隠れないようにした。

### 2026-09-03 フッターを世界観に馴染ませる（見た目のみ）
- 指示書「フッターUI改善 v1」。文言・リンクは不変で見た目だけ。現状フッターのリンクは `/terms`
  （「利用について」）1 本のみ＝新規リンク/ページ/© 以外のテキストは追加しない。
- `site-footer.tsx`: 背景 `--color-surface`（白）→ `--color-surface-sunken`（本文より少し濃い生成り）。
  左寄せ → 中央寄せ、`max-w-6xl` → `max-w-3xl`、注意書きは `max-w-2xl` ＋ `leading-relaxed` で
  読みやすい幅に。先頭に `brand-icon.png`（`h-5 w-5`、ヘッダーより小さめ、`alt=""`）＋「できる道」。
  末尾に `© {年} できる道` を追加（§4 の推奨構成。ページ/リンクではなく定型表記）。
- 新しい画像・イラストセクションは足さない（7.png はフッターで再利用しない）。境界は既存の細い
  `border-t` のまま。コントラストは sunken 上でも AA（axe トップ serious/critical 0）。

### 2026-09-03 スティッキーフッター（コンテンツが短い画面でフッター下に生成りの隙間）
- 症状: トップなどコンテンツが短いページで、ビューポートより本文が短いとフッターの下に
  生成り（`--color-canvas`）の余白が出ていた。
- 修正: `globals.css @layer base` で `body` を `display:flex; flex-direction:column;
  min-height:100vh`（＋ `100dvh` で上書き）に、`body > main` を `flex:1 0 auto` に。
  短いページでは `<main>` が伸びてフッターがビュー下端に貼り付く。
- 影響範囲: `src/app/globals.css` のみ。全ページ共通のレイアウト挙動。

### 2026-09-03 入力欄に最大文字数を表示
- 変更前: テキスト入力に文字数の目安が無く、超過は送信後に「N 文字以内で入力してください」で気づくだけ
- 変更後: 自由記述の入力欄に「最大 N 文字」（hint＝aria-describedby で focus 時に読まれる）と
  「N / MAX 文字」の残数カウンタ（目視用・`aria-hidden`）を表示。`maxLength` 属性でブラウザ側でも制限。
- 理由: 上限を事前に伝える（アクセシビリティ方針：フォームは文言で説明する）
- 影響範囲: `src/components/form.tsx`（`TextField`/`TextAreaField` に `maxLength` 対応）、
  `road-form.tsx` / `attempt-form.tsx` / `road-edit-form.tsx`。上限値は
  `src/lib/constants.ts#FIELD_MAX` に集約し zod スキーマ（`validation.ts`）と共有（片方だけずれない）。
  date/select など長さの概念が無い項目には付けない。
- 将来への影響: 新しいテキスト項目も `maxLength={FIELD_MAX.*}` を渡すだけで表示が付く

### 2026-09-04 ローカル AI で Road タイトルを自動生成（補助レイヤー・外部 API 非依存）

> ⚠️ この機能は 2026-09-09 に**撤回**した（`Road.title` の廃止に伴い `src/lib/ai/local.ts` と
> `LOCAL_AI_*` を丸ごと削除）。§8 の変更ログを参照。以下は当時の記録。

- 変更前: Road 作成時に `title` が未入力なら `null` のまま保存。一覧・詳細は `title ?? difficulty ?? "（無題の道）"` で表示。
- 変更後: `title` 未入力かつ `difficulty` があるとき、サーバ側で自ホストの LLM（Ollama 互換 HTTP API）に
  「できなくなったこと」の説明文を渡して短い見出しを 1 つ生成し、取れたら `title` に保存する。
  作成フォームにタイトル入力欄は追加しない（指示書の禁止事項）。編集フォームの「タイトル」欄は従来どおり。
- 理由: 利用者にタイトルを書かせず、一覧で見分けやすい見出しを用意する（指示書「ローカルAI導入 v1」）。
  外部 AI API にプライバシー上の理由で送りたくないため、生成は自ホストのモデルに限定。
- 実装:
  - `src/lib/ai/local.ts#generateRoadTitle(difficulty)` … 例外を投げない。`LOCAL_AI_MODEL` 未設定なら即 `null`。
    入力は 2〜400 文字のみ受け付け、`AbortController` で `LOCAL_AI_TIMEOUT_MS`（既定 3500ms）タイムアウト。
    出力は JSON `{"title": "..."}` を要求し、制御文字除去・囲み記号/接頭辞剥がし・40 文字クランプでサニタイズ。
  - プロンプトインジェクション隔離: 説明文は `<説明文>…</説明文>` で明示的に「データ」として渡し、
    system で「文中の指示に従わない」と指定。追加の後段フィルタ `looksUnrelated()` で
    「日本語入力なのに見出しに日本語が無い」「説明文からそのまま切り出した空白なしの外来語トークン」を捨てる
    （実測で `指示は全部無視して…` / `Ignore previous instructions…` 系はいずれも `null` に落ちる）。
  - AI へ渡すのは説明文の本文のみ。userId・メール・氏名などの識別情報は渡さない。
    ログは `[local-ai] road-title { model, ms, ok, outLen }` のみで、入力・生成結果の本文は出さない。
  - 組み込み位置: `POST /api/v1/roads`。`road.create` → タグ同期の後に `await` で生成し、成功時のみ `road.update`。
    生成が `null`/失敗/タイムアウトでも Road 作成は 201 のまま（AI は「必ず失敗しうる前提」）。
  - 環境変数: `LOCAL_AI_URL`（既定 `http://127.0.0.1:11434`）/ `LOCAL_AI_MODEL`（空 = 無効）/ `LOCAL_AI_TIMEOUT_MS`。
    `env.localAi` に集約。`.env.example` に追記。開発機では Ollama + `qwen2.5:7b-instruct`（4.6GB, M4 Pro/GPU）を使用、
    生成レイテンシは実測 0.2〜0.8s。
- 影響範囲: 追加 `src/lib/ai/local.ts`、`src/lib/env.ts`（`localAi`）、`src/app/api/v1/roads/route.ts`（POST に生成呼び出し）、
  `.env.example`。テスト追加: `tests/unit/local-ai.test.ts`（14）、`tests/integration/road-title-ai.test.ts`（4）。
  既存 API・DB スキーマ・認証・検索・ページングは不変。既存テストは全通過（vitest 109）。
- 既知の限界:
  - `LOCAL_AI_MODEL` 未設定の環境（CI・現状の本番未定・E2E ビルド）では生成は完全に no-op で、従来どおり `title=null`。
  - モデルがまれに簡体字（例: `难`）を混ぜることがある。system プロンプトで「日本語のみ・簡体字禁止」を指示して抑制。
    それでも混ざった場合はタイトルとして保存され得る（本人が編集で直せる。医療的な断定ではないため実害は軽微）。
  - 英語のみの説明文で英単語 1 語だけが返るケースは `looksUnrelated()` で `null` に倒すため、
    英語ユーザーはタイトル無し（＝説明文表示）になりやすい。日本語前提のサービスのため許容。
- 将来への影響: 本番ホスティング決定時に、内部ネットワーク限定で LLM ランタイムを用意すれば同じ環境変数で有効化できる。
  既存の未タイトル Road への遡及生成バッチは未実装（本人のデータに触れるため、実行は要相談）。

### 2026-09-04 検索結果カード内のハッシュタグの配色（見た目のみ）
- 変更前: タグ `<li>` は `bg-[var(--color-surface-sunken)]`（生成り）＋ `text-[var(--color-ink-muted)]`（グレー）。
  白いカードの中で埋もれ、分類情報として弱かった。
- 変更後: `bg-[#e4f2ed]`（淡いミント）＋ `text-[#26756a]`（少し濃いグリーン）。枠線なし・ピル形状・
  文字サイズ/太さ（`text-xs` / weight 400）・余白は不変。すべてのタグを同一配色（種類別の色分けはしない）。
- 指定は背景 `#E4F2ED` / 文字 `#287A6B`。`#287A6B` は `#E4F2ED` 上で axe 実測 4.45:1 と AA(4.5:1) 未満だったため、
  「文字色のみ調整可」の方針に沿って文字を `#26756A` にわずかに濃くした（4.75:1 で AA 通過）。背景は指定どおり。
- 目的: 白カード内でタグが「分類・特徴を示す補助情報」として自然に見えること。ボタンには見せない（枠線なし・低彩度）。
- 影響範囲: `src/components/road-card.tsx` / `src/components/method-card.tsx` の タグ `<li>` のみ。
  カード背景・枠線・本文・見出し・ボタン・レイアウト・フッター、経験詳細/自分の道のタグ、検索フォームの
  絞り込みチップは変更なし。axe（トップ/経験を探す/経験詳細ほか）全通過、PC(1280)・モバイル(390) 目視確認。

### 2026-09-10 検索・キーワード入力欄に「×」クリアボタン
- 検索/キーワードの入力欄の右端に「×」ボタンを置き、押すとその欄だけを空にする（入力中のみ表示、押下後は入力欄へフォーカスを戻す）。
- 共通 UI: `src/components/ui.tsx` の `ClearFieldButton`（`relative` ラッパー内に絶対配置。`aria-label` 付き）＋ `IconX`（`src/components/icons.tsx`）。
- 対象: `search-box.tsx`（トップ/コンパクト検索）/ `experience-search-form.tsx`（経験を探す。× は検索ワードのみクリア。絞り込みは従来の「条件をクリア」）/ `admin/seed-data-generator.tsx`（キーワード）/ `admin/posts`（一覧検索。GET フォームのまま `AdminPostSearch` にクライアント化）。
- `type="search"` の入力欄は WebKit のネイティブ × を `[&::-webkit-search-cancel-button]:appearance-none` で消し、独自 × に一本化。
- × は送信・遷移をしない（ワードを消すだけ）。既存の検索ロジック・URL 生成・音声入力は変更なし。
- **Enter で検索/生成が走る**: `search-box` / `experience-search-form` / `admin/posts` はもともと
  `<form onSubmit>`＋submit ボタンで Enter 送信が効く。`seed-data-generator` は入力欄が form の外に
  あり Enter が無反応だったため、入力セクションを `<form onSubmit>` にし「AIで生成する」を
  `type="submit"` に変更（IME 変換確定の Enter はブラウザが吸収するので追加ガード不要）。

### 2026-09-10 検索カードは白 / AI仮データ生成の入力カードは緑（見た目のみ）
- 「経験を探す」の検索カード（`experience-search-form.tsx`）の背景を `--color-primary-tint`（緑）→ `--color-surface`（白）に。
- 「AIで仮データを生成」の入力カード（`seed-data-generator.tsx` の入力 `<form>`）を、これまでの検索カードと同じ緑 `--color-primary-tint` ＋ `--shadow-card` に。中のキーワード入力欄・件数セレクトは `--color-surface`（白）で浮かせる。
- 同画面の「生成結果」カード（各候補の `<li>`）は背景指定が無く生成りだったので `--color-surface`（白）に。
- 色・影のトークン差し替えのみ。枠線・角丸・余白・レイアウト・入力ロジックは変更なし。

### 2026-09-10 仮データ管理の一覧に「非公開／公開」表示切り替え
- `/admin/seed-data` の上部に緑（`--color-primary-tint`）の指示枠を置き、「非公開（N）」「公開（N）」の 2 タブで表示をしぼり込む。**初期値は非公開**（`?state` 無し = 非公開）。`?state=published` で公開ぶん。
- サーバー側フィルタ（`page.tsx` は `force-dynamic` の Server Component、タブは `<Link>`。JS 不要）。`listSeedData({ page, published })` に `published?: boolean` を追加し、`counts:{ all, private, published }` も返す。
- `GET /api/admin/seed-data` に `?state=private|published|all`（既定 private）を追加。
- 各行の操作（編集／公開・非公開にする／削除）は従来どおり変更なし。

### 2026-09-10 管理ダッシュボード（/admin）の整理
- 並びを「確認が必要なもの → 現在の状況 → 最近の動き → 管理メニュー」に（管理メニューを最下部へ）。
- 「利用者を見る（準備中）」「通報・対応を見る（準備中）」をダッシュボードから削除（上部ナビには元から無し）。
- 管理メニューは 4 項目（経験を確認する／公開されている経験／仮データを管理する／操作ログを見る）を 2×2 カードに。`ready` フラグは廃止。
- 「確認が必要なもの」：確認待ち 0 件なら緑の 1 カード。件数があれば代表 3 件（`moderationQueue({page:1})` の先頭）＋「経験を確認する →」ボタン。従来の重複した空状態カード（`ReviewCard` の「今はありません」）は撤去。
- 「現在の状況」：`dashboardStats()` の値をそのまま（利用者 / 道 / 公開経験 / 最近の更新 = `recentApproved`）。集計ロジックは変更なし。「公開停止 N 件」の補足は削除。
- 「最近の動き」：`postList({status:"approved"})` と `auditLog()` の先頭 5 件を 2 ブロックで表示。空なら「現在ありません」。`recentActivity()` は不使用に（定義は残置）。
- 新規 API・DB・権限・ログ仕様は追加なし。`src/app/admin/page.tsx` のみ変更。

### 2026-09-10 管理メニューを上部ナビに一本化
- ダッシュボード下部の「管理メニュー」セクション（2×2 カード）を **完全に削除**。管理トップは「確認が必要なもの → 現在の状況 → 最近の動き」で終了。
- 上部ナビを `src/components/admin/admin-nav.tsx`（client, `usePathname`）に切り出し、現在ページを `aria-current="page"` ＋ 太字 ＋ 淡い背景（`--color-primary-soft`）で表示（色だけに依存しない）。`exact` は `/admin` のみ、他はサブパスも親をアクティブ扱い。
- `layout.tsx` ヘッダー: 「できる道 管理」（左）→ ナビ → 運営名・ログアウト（右 `ml-auto`）。`border-b` ＋ `py-3` ＋ `mb-8`。`flex-wrap` で狭幅は折り返し（横スクロールなし）。
- ルーティング・データ取得・各画面は変更なし。`src/app/admin/page.tsx` / `layout.tsx` ＋ 新規 `admin-nav.tsx` のみ。

### 2026-09-10 管理画面ログインをカード型に整える（見た目のみ）
- `/admin/login`：淡い背景 → 白いログインカード（`--color-surface` ＋ `border` ＋ `--shadow-card` ＋ `max-w-sm`）に。カード上に控えめなブランド表示「できる道 / 管理画面」。
- カード内：見出し「管理画面ログイン」＋ 説明「できる道の運営・管理者専用です。アプリ利用者の Google ログインとは別のアカウントを使用します。」
- 入力欄（`AdminLoginForm`）：`text-base`（iOS 自動ズーム回避）＋ 少し大きめのパディング ＋ フォーカスで枠色＋リング。
- ログインボタン：オレンジ枠 → **グリーンの塗り**（`--color-primary` / `hover:--color-primary-hover`）、`w-full`、`disabled` で二重送信防止（`useTransition`）。
- エラー：`role="alert"` ＋ 枠線付きボックス（色だけに依存しない）。
- 縦位置は `py-10 sm:py-16` の自然配置（`100vh` 中央寄せはしない＝モバイルのキーボード表示でも操作可）。
- 認証処理・成功後の遷移（`/admin` へ replace）・ラベル文言・`id`/`autoComplete` は変更なし。`src/app/admin/login/page.tsx` と `AdminLoginForm` のみ。

### 2026-09-10 管理機能・ログインの露出対策
- ログイン画面（`/admin/login`）から「管理画面／管理者／運営者」の語を撤去。ブランド「できる道」＋見出し「ログイン」＋フォームのみ。説明段落は削除。ページ metadata で `<title>` を「ログイン」に、`robots: { index:false, follow:false, noarchive:true, nocache:true }`。
- 管理レイアウト metadata の `robots` に `noarchive` / `nocache` を追加。`title` は「管理画面」→「管理」。
- `src/middleware.ts`：`/admin` 配下のレスポンスに `X-Robots-Tag: noindex,nofollow,noarchive,noai,noimageai` と `Cache-Control: no-store,no-cache,must-revalidate,private` を付与（BFCache・戻る操作で管理情報を残さない）。
- 調査で確認済み（変更不要）: 公開ページから `/admin` へのリンク無し／sitemap 無し／`robots.ts` は既に `/admin` を Disallow／`POST /api/admin/login` は IP 単位 10/分ロック＋ダミーハッシュ検証＋汎用エラー／全管理ページ `requireAdmin()`・全管理 API `requireAdminApi()` でサーバー側認証＋認可（`AdminUser` を DB 参照・`isActive` 確認）／管理セッションは利用者 Auth と別 Cookie・別テーブル。
- **URL 変更は見送り**：認証・認可がサーバー側で完結しており、`/admin` の秘匿化は指示書自身が「防御にしない」としている一方、変更の影響範囲（ルーティング／API／middleware／既存管理者）が大きく費用対効果が低いため。必要なら別作業。

### 2026-09-10 検索エンジン露出方針：トップだけ index / それ以外は noindex
- ルート layout の metadata に `robots: { index: false, follow: true }` を追加（既定＝登録しない）。
- `app/page.tsx`（トップ）だけ `robots: { index: true, follow: true }` で上書き。
- `/login` と `/me/*`（`me/layout.tsx`）は `robots: { index: false, follow: false }`（nofollow も）。`/admin/*` は既存どおり。
- `src/middleware.ts`：`X-Robots-Tag` をパス別に付与（トップ index,follow ／ 本人・ログイン noindex,nofollow ／ 管理 noindex,nofollow,noarchive ／ その他 noindex,follow。すべて `noai, noimageai` を維持）。管理系は `Cache-Control: no-store`。matcher の除外に `sitemap.xml` を追加。
- `src/app/robots.ts`：`*` の Disallow を `/api/` `/admin/` `/admin` だけに（`/me` `/login` を外す＝クローラーに noindex を読ませる。指示書 §10 / §13）。AI クローラー全体不可は維持。`Sitemap:` 行を追加。
- `src/app/sitemap.ts`（新規）：トップ URL 1 件のみ。
- 管理画面の BASIC 認証（nginx）は `docs/deployment.md` §3-補足2 に手順を追加（ops で適用。認証情報は Git に置かない）。
- `/admin` の URL リネームは**見送り**（ユーザー確認済み）。認証・認可がサーバー側で完結しており、URL 秘匿は防御にしない方針、かつ変更の影響範囲が大きいため。
- 既存の OGP 設定・アプリ機能・API・DB は変更なし。

### 2026-09-11 `/try` の画面文言を「試したこと」中心から「経験」中心へ（文言のみ）
- 見出し `あなたが試したことを教えてください` → `あなたの経験を教えてください`。
- 説明文 `困っていることに対して、試してみた方法を教えてください。…` →
  `困っていたことと、試してみた方法を教えてください。うまくいかなかったことも、誰かの次の一歩につながります。`。
- 画面の 2 文字列だけ。フォーム項目・バリデーション・保存処理・レート制限は不変。
- OGP / Twitter 共有文（`SHARE_TITLE` / `SHARE_DESCRIPTION`）は SNS 側の一貫性のため**変更しない**。
- e2e の見出しアサーション（`tests/e2e/quick-submit.spec.ts`）を新文言に更新。

### 2026-09-11 検索AI（ハイブリッド検索）Phase 1
- 目的: 利用者が自分の言葉で書いた困りごとを、表現の違う既存の公開経験に結びつける。「AI が答えを作る」のではなく「AI が検索語を広げる」。指示書「検索AI構築 v1」§30（まず最小構成）に沿う。
- 範囲は **Phase 1 のみ**（ユーザー確認済み）。新インフラ・新 API キー・新プロバイダなし。既存 `@anthropic-ai/sdk` / `env.ai` だけ。`ANTHROPIC_API_KEY` 未設定でも動く。
- 追加: `src/lib/ai/search.ts`（`expandSearchIntent` / `localExpand` / `normalizeIntent`）、`src/lib/search-rank.ts`（`scoreText` / `rankBySearchRelevance`・純関数）。
- `src/lib/search.ts` の 3 つの where ビルダーに任意の第 3 引数 `opts.terms` を追加。非空なら語ごとに既存対象カラムへの `ILIKE` OR を増やす。**未指定なら従来と完全に同一**（`buildExperienceOrderBy` の出力形は変更せず、`tests/unit/search.test.ts` を壊さない）。
- `src/lib/queries.ts` の `searchRoads` / `searchMethods` に `opts.{terms,rank}`。`rank` は取得後の 1 ページ分だけをスコア順に安定ソート（DB の並び順は不変。helpful/tried と同じ後処理）。**ページをまたぐ厳密な関連度順にはしない**（既存の helpful/tried と同じ割り切り。Phase 2 で改善余地）。
- `experienceQuerySchema` に `ai: z.enum(["1"]).optional()` を追加（`page/limit/sort` の既定は不変）。`EXPERIENCE_SORTS` は変更しない（`constants.ts` / フォーム / order-by への波及を避けるため。関連度ランキングは `ai=1` のときに `sort` の上へ後追いで載る）。
- `/experiences`（`ai=1` かつ検索語あり）: サーバーで `expandSearchIntent` を直接呼ぶ（dormant な `POST /api/v1/ai/experience-search` を自己 fetch しない）。0 件なら `terms` 無しで再検索して通常結果を返す。結果上部に AIアシストパネル（展開語チップ＋言い換え＋免責＋「AIアシストをやめて検索する」リンク。すべてプレーンテキスト）。
- `assistExperienceSearch` / `POST /api/v1/ai/experience-search` は `expandSearchIntent` に委譲し、レスポンスに `terms` を追加（`keywords` は先頭 5 件で後方互換）。
- 非機能: AI 出力は文字列のみ・30 字以内・最大 8 語・先頭は元フレーズに正規化。SQL 連結なし（Prisma の `contains` パラメータ）。公開ゲートは `PUBLIC_ATTEMPT_WHERE` のまま（`ai=1` 経路で非公開データは混ざらない）。モデル名は `env.ai.model`。
- **Phase 2（未着手・保留）**: pgvector + Embedding のベクトル類似検索。`postgres:16-alpine` に pgvector は無く、Anthropic に Embeddings API も無い。着手時に必要＝docker イメージを `pgvector/pgvector:pg16` へ／本番 DB コンテナ入れ替え／`CREATE EXTENSION vector`／Embedding 専用テーブルと公開・非公開・編集・削除への同期＋バックフィル／Embedding プロバイダ選定（環境変数化・ハードコード禁止）。`CLAUDE.md` 残作業にも記載。
- テスト: `tests/unit/ai-search-intent.test.ts`（`localExpand` / `normalizeIntent` / `expandSearchIntent` の未設定経路・区切り記号・8 語上限・長すぎる語の除去）、`tests/unit/ai-search-intent-ai.test.ts`（`callJson` を差し替えた AI 有効経路・`source` 判定・失敗フォールバック）、`tests/unit/ai-assist-search.test.ts`（`assistExperienceSearch` の委譲）、`tests/unit/search-rank.test.ts`（スコア・安定ソート・非破壊）、`tests/unit/search.test.ts`（3 ビルダーの `opts.terms`・`q.q` との優先順位）、`tests/integration/search-ai.test.ts`（OR 和集合・公開ゲート不変・ページ内ランキング）、`tests/integration/ai-experience-search.api.test.ts`（レスポンス形・バリデーション・同一オリジン・レート制限）、`tests/e2e/search-ai.spec.ts`（`ai=1` とアシストパネル）。

### 2026-09-11 仮データを一般ユーザー画面で「通常の経験」として表示（サンプル表示を撤去）
- 指示「AI作成データの表示ルール追加」に基づく。公開された仮データは検索結果・経験カード・
  経験詳細・道の見える化で **通常の経験とまったく同じ見た目**にする。「サンプル」「仮データ」
  「AI 生成」等の表示・注記は出さない。
- 削除: `SampleBadge`（`src/components/ui.tsx`）、`RoadCard` / `MethodCard` / `experiences/[id]` /
  `experiences/paths` の `SampleBadge` 使用と、経験詳細の「これは運営が用意したサンプルです」注記。
- 削除: 表示用の派生フィールド `isSeed`（`RoadCardDTO` / `MethodCardDTO` / `ExperienceDTO.road` /
  `getPathClusters` のクラスタ）と `serializers.ts` の `isSeedRoad` ヘルパ。公開レスポンスに
  仮データを示すフィールドが載らなくなる。
- スタブ生成本文の「（サンプル）」表記（`stubAttemptMemo` / `stubDraftAt` の `situation`）も削除。
- **DB は不変:** `roads.is_seed_data` / `data_origin` / `seed_keyword` はそのまま。
- **管理側は不変:** `/admin/seed-data`（一覧・状態バッジ・「AI生成」タグ・編集/公開/非公開/削除）、
  `SeedDataDTO` / `serializeSeedRoad`、ダッシュボード集計の `isSeedData:false` 除外、監査ログはすべて維持。
- 公開・非公開ルールは変更なし（仮データも `PUBLIC_ATTEMPT_WHERE` に従う）。
- 検索 AI（Phase 1）は従来どおり DB の公開経験だけを検索する。存在しない経験の生成・混入はしない。
- テスト: `serializers.test.ts` の `road.isSeed` ケースを削除。他は不変で緑（342）。

### 2026-09-11 既読引き継ぎ（未ログイン⇄ログイン、指示書「既読引き継ぎ」）
- 目的: 「経験の検索・閲覧はログイン不要」の方針を保ったまま、既読を未ログイン（ブラウザ）とログイン
  （アカウント）の両方で使え、ログアウトで消えず、再ログインでブラウザ側の分をアカウントへ統合する。
- **調査結果（§12）**: 既読対象は `Attempt`（`attempt_reads(user_id, attempt_id, read_at)`、`UNIQUE(user_id, attempt_id)`）。
  既存の登録経路 `POST /api/v1/attempts/{id}/read`（`markAttemptRead`）・表示経路
  （`readAttemptIdSet` → `RoadCardDTO.isRead` / `MethodCardDTO.isRead`）・UI（`ReadBadge`）は
  そのまま使う。**新しいテーブル・マイグレーションは無し**（既存 `attempt_reads` をそのまま利用）。
- **未ログイン**: `src/lib/client/local-reads.ts`（`localStorage` キー `dekiru:localReads`、既読にした
  Attempt id の配列。上限 `MAX_LOCAL_READ_IDS=500`・超過は古いものから破棄）。
  経験詳細では `MarkReadLocal`（`MarkRead` の対、通信なし）が既読を追加。検索結果カードは
  `ReadBadgeAuto`（`RoadCard`/`MethodCard` から `ReadBadge` を置き換え）が、ログイン中はサーバー値を
  そのまま、未ログインはマウント後に `localStorage` を見てバッジだけ更新（初期表示はサーバーと同じ
  「未読」でハイドレーション不一致なし）。
- **ログアウト時**: `UserMenu.signOut()` が `/api/v1/auth/logout` を呼ぶ**前**に
  `GET /api/v1/me/reads` でアカウントの既読 id 一覧を取得し `mergeLocalReadIds` でブラウザへ統合してから
  ログアウトする。取得に失敗してもログアウト自体は続行（既読引き継ぎは補助機能）。
- **再ログイン時**: `SiteHeader` がログイン中だけ描画する `SyncLocalReadsOnLogin`（表示なし）が、
  ブラウザに既読 id が残っていれば `POST /api/v1/me/reads/merge` へ送り、成功したら
  `clearLocalReadIds`。失敗時はブラウザ側の記録を残し次回また試す。
- **新規 API**（`src/lib/reads.ts` に `listReadAttemptIds` / `mergeReadAttemptIds` を追加し薄いルートで包む）:
  `GET /api/v1/me/reads` → `{ attemptIds }`（本人のみ・件数上限 500）。
  `POST /api/v1/me/reads/merge` → `mergeReadsSchema`（uuid 配列 1〜500）で検証し、
  存在しない id・自分の Attempt は除外、`attemptRead.createMany({ skipDuplicates: true })` で重複させず統合。
- 非公開・削除された経験は既読 id が残っていても再表示されない（表示はすべて `PUBLIC_ATTEMPT_WHERE`
  経由の検索・詳細が決める。既読 id そのものは「新しい経験」をどこにも出現させない）。
- 他ユーザーの既読は取得できない（`GET/POST /me/reads*` は `requireUserId()` のセッション id のみを使う。
  リクエストで id を指定させない）。`localStorage` には UUID 以外（個人情報）を保存しない。
- テスト: `tests/unit/local-reads.test.ts`（localStorage ヘルパ。壊れた値・上限・重複防止）、
  `tests/integration/reads-carryover.api.test.ts`（`GET/POST /me/reads*` の認可・バリデーション・
  存在しない id の無視・自分の Attempt 除外・重複統合しないこと）、
  `tests/e2e/reads-carryover.spec.ts`（未ログイン既読→ログアウト引き継ぎ→再ログイン統合の一気通貫）。
  既存の `tests/e2e/reads.spec.ts`（サーバー側既読）・`ReadBadge` の見た目・
  「既読だけ/未読だけ」フィルタは無変更で緑。
  - 副次的な発見: このリポジトリのテスト環境 (Node 25 系) には built-in `localStorage` グローバルがあり、
    vitest の jsdom 環境でテストコードが素の `localStorage` を参照すると、jsdom の実装ではなくその
    壊れた（`clear` 等を持たない）グローバルを掴むことがある。ソース側は必ず `window.localStorage` を
    明示し、単体テストでは `Object.defineProperty` で Storage 互換のメモリ実装に差し替えて検証した。
- **ログイン中と未ログインで表示の即時性が異なる点（ユーザー確認）**: ログイン中はサーバーが判定済みの
  既読状態が最初の描画から出るが、未ログインはブラウザにしか無い `localStorage` を見るため、
  マウント直後まで「未読」で描画し、既読ならそこから切り替わる。`ReadBadgeAuto` は `useEffect` ではなく
  `useLayoutEffect` を使い、実際の描画（ペイント）前に判定を反映させて体感できる「未読→既読」の
  チラつきを無くす。ただし JS 到達前の一瞬は原理的に残り得る（サーバーがブラウザの localStorage を
  知る手段が無いため）。ログイン中の挙動・SSR の出力は変えない。
- **バグ修正: 未ログインで既読にしてもカードの背景色が既読色に変わらない**: `ReadBadgeAuto` は右上の
  バッジだけを更新しており、`RoadCard`/`MethodCard` の `<article>` 背景色（未読＝淡い色／既読＝白）は
  引き続き `road.isRead`/`m.isRead`（サーバー計算値。未ログインは常に false）だけで決まっていたため、
  未ログインで既読にしてもバッジは「既読」なのに背景は未読色のままだった。
  `src/components/read-aware-card.tsx`（新規, client）に `<article>` 自体を切り出し、`ReadBadgeAuto` と
  同じ入力（`loggedIn` / `serverRead` / `attemptIds`）から同じ判定を行って背景クラスを切り替えるように
  変更（`RoadCard` / `MethodCard` から利用）。バッジ側と同じロジックなので食い違わない。
  `useLayoutEffect` も踏襲。e2e (`reads-carryover.spec.ts`) に背景クラスの `toHaveClass` 検証を追加。
- **バグ修正: 経験詳細の「← 経験を探すへ戻る」で戻ると既読マークが未読のまま（ユーザー報告）**:
  `ReadBadgeAuto` / `ReadAwareCard` が `useState(serverRead)` で初期値をキャッシュしていたため、
  「経験を探す」に戻ったときに React が同じ道のカードのコンポーネントを作り直さず使い回した場合、
  最初にマウントしたときの既読状態のまま固まり、ログイン中に既読へ変わっても反映されないおそれがあった
  （ログイン中は `useLayoutEffect` 側が早期 return するため、状態を更新し直す経路が無かった）。
  両コンポーネントとも `read` の値を `useState` にキャッシュせず、描画のたびに
  `loggedIn ? serverRead : serverRead || (mounted && hasAnyLocalRead(attemptIds))` として直接計算するよう
  修正（`mounted` はハイドレーション後かどうかの目印としてのみ保持し、`useLayoutEffect(() => setMounted(true), [])`
  で一度だけ立てる）。ログイン中は常に最新の `serverRead` をそのまま使うため、コンポーネントが
  作り直されてもされなくても必ず最新値になる。e2e に「ログイン中、詳細の『← 経験を探すへ戻る』で
  戻ると、カードが既読表示になる」を追加（`reads-carryover.spec.ts`）。
  - 調査メモ: 実際に自動テスト (Chromium・本番ビルド) でこの遷移を再現したところ、対象カードの
    React コンポーネントは通常フルに作り直されており、旧コードでもこの経路単体では再現しなかった。
    ただし新コードの実装は理論的な脆弱性（コンポーネント再利用時に値が固まる）を確実に塞ぐため、
    修正自体は維持する。
  - **重要な副次的発見（環境起因）**: 調査中、開発者の `npm run dev`（Next のインクリメンタルな
    `.next`）と、この session が検証のため繰り返し実行していた `npm run build` / e2e
    （`next build && next start`、同じ `.next` を上書きする）が同じ作業ディレクトリを共有しており、
    実際に `.next` が壊れて `Cannot find module './vendor-chunks/@auth.js'` のような 500 エラーが
    dev サーバー側で発生することを確認した（`rm -rf .next` で解消）。ユーザーが `npm run dev` を
    使っている間にこの session が `npm run build`／e2e を走らせると、同様の予測不能な不具合
    （既読に限らず様々な「反映されない」症状）を引き起こしうる。今後は、ユーザーが開発サーバーを
    動かしていそうなときはビルド検証を避けるか、検証後に `.next` を削除してから返す。

### 2026-09-11 セキュリティレビュー：`/experiences?ai=1` が AI 専用のレート制限を受けていなかった
- 「サイトのセキュリティー的に問題などないか」の依頼を受けての全体レビューで発見。検索AI Phase 1
  （`?ai=1`）を追加した際、`expandSearchIntent`（Anthropic API 呼び出し＝課金対象）を
  `src/app/experiences/page.tsx`（SSR ページ、`handle()`/`handlePublicRead()` を通らない）から
  直接呼んでおり、他の AI エンドポイント（`/api/v1/ai/experience-search` 等）に掛けている
  `RATE_PRESETS.ai`（15/分・クライアント単位）が掛かっていなかった。`guardPublicPage` の一般的な
  巡回対策（bot-guard、100req/60s 程度）は効くが、AI コストの濫用を防ぐには緩すぎる。
  ログイン不要の公開ページなので、悪意ある利用者が `q` を変えながら連打すると想定より多く
  Anthropic API を呼べてしまう状態だった（コスト濫用・DoS 的リスク）。
- 修正: `src/lib/ratelimit.ts` に `clientKeyFromHeaders(h)`（`clientKey(req)` の Server Component 版。
  `next/headers` の `Headers` から同じ抽出ロジックでクライアント識別子を得る）を追加。
  `experiences/page.tsx` で `expandSearchIntent` を呼ぶ前に
  `enforceRateLimit({ key: `ai:search:${clientId}`, ...RATE_PRESETS.ai })`
  を実行（`/api/v1/ai/experience-search` と同じキー空間を共有し、両経路合算で 15/分に収める）。
  超過時は `ApiError("rate_limited")` を捕まえて `intent` を `null` のままにし、
  例外を投げずに黙って**通常のキーワード検索へフォールバック**する（検索そのものは止めない。
  既存の「AI 利用不可でも通常検索は動く」方針どおり）。
- テスト: `tests/e2e/search-ai.spec.ts` に、専用 `x-forwarded-for` で 17 回連続アクセスし、
  15 回を超えたところで AIアシストパネルが出なくなる（＝フォールバックする）ことと、
  その状態でも通常の検索結果（道カード）は出続けることを確認するケースを追加。
- 他のページ (`page.tsx`) を全数チェックし、AI 関数を直接呼んでいるのは `experiences/page.tsx` だけ
  であることを確認済み（同種の抜けは他に無い）。
- 併せて `npm audit`・CSRF・admin 認証・公開 GET の bot-guard・XSS・SQLi・秘密情報の扱い・
  仮データ内部フラグの非公開API漏えい・`E2E_TEST_LOGIN` のゲートも点検し、いずれも問題なし
  （`next-auth`/`postcss` 等の依存パッケージの既知脆弱性は棚卸し済み・実害はほぼ無いと判断。
  `next-auth` の更新は影響範囲が大きいため別途判断）。

### 2026-09-11 AI生成「困ったこと」キーワード変換ルール修正
- 指示書「AI生成『困ったこと』キーワード変換ルール修正」を受けて対応。
  例：キーワード「手芸」→ 従来のスタブ生成が「「手芸」で、細かい手先の作業を正確に行うのが難しい」
  のように、テーマ（キーワード）を主語・原因として文へ無理やり差し込んだ不自然な文を生成していた。
- **根本原因（`src/lib/ai/seed-data.ts` の `stubPoolFor`）**: `SEED_DOMAINS`（deskwork/cooking/outing/
  cleaning/laundry）のどれにも一致しないテーマ（「手芸」等）のとき、ドメイン非依存の `NEUTRAL_ASPECTS`
  にフォールバックする際、各困りごと文の頭に `「${theme}」で、` を機械的に前置していた。
- **修正**: この前置きを削除し、`NEUTRAL_ASPECTS` をそのまま使うよう変更（`NEUTRAL_ASPECTS` 自体が
  どんな活動にも自然に当てはまる具体的な困りごと文になっているため、テーマを差し込む必要が無い）。
  テーマとのつながりは従来どおり `situation`（「〈テーマ〉」に取り組むときの場面）側だけで保つ。
- **検証を強化（防御的チェック。AI 経路の出力にも同じ基準を適用）**: `isConcreteDifficulty` に
  `startsWithBracketedThemeClause`（「キーワード」で、〜 の形を検出）と `isThemeAsSubjectClause`
  （キーワードすることが難しい／キーワードができなくて困っている、のようにキーワードを動作の主語に
  している形を検出）を追加。どちらかに当てはまる候補は AI 経路（`normalizeDrafts`）でもスタブ経路
  でも破棄される。
- **プロンプト強化**: `SEED_SYSTEM_PROMPT` / `buildUserPrompt` に「キーワードは『したいこと・活動・場面』
  として扱い、困難の原因として扱わない」「キーワードを文にそのまま組み込むだけの生成は禁止（具体例つき）」
  「difficulty にキーワードを含める必要はない」を追記し、自己チェック項目にも
  「キーワードを主語・原因として扱っていないか」「『「キーワード」で、〜』の形になっていないか」を追加。
- 挙動は変わらないもの: テーマに一致する分野があるとき（cooking/deskwork 等）はそのドメインの
  困りごとをそのまま使う（変更なし）。テーマ逸脱防止・重複回避（`nearDuplicate`）・
  再生成のたびに違う切り口を返す仕組み（`offset` ローテーション）はすべて無変更。
- テスト: `tests/unit/seed-data.test.ts` に、`isConcreteDifficulty` の新しい NG パターン
  （「キーワード」で、〜 ／ キーワードすることが難しい ／ キーワードができなくて困っている）と
  OK パターン（キーワードを含まない自然な文）、`localStubDrafts("手芸", …)` で
  差し込みパターンが出ないこと、`normalizeDrafts` が AI 由来の差し込みパターンも破棄することを追加。
  既存の 48 件は無変更で緑（364/364）。

### 2026-09-11 AI生成「困ったこと」生成ルール修正（キーワードの種類による書き分け）
- 前項（キーワード変換ルール修正）の続き。指示書「AI生成『困ったこと』生成ルール修正」を受けて対応。
  キーワードには「活動・趣味／行動・家事／仕事・作業」（例: 手芸・料理を作る・デスクワーク）と
  「物・道具」「設備・環境」（例: 爪切り・箸・リモコン・ハサミ・ドアノブ・階段・浴槽・トイレ）の
  2 系統があり、後者は「キーワードを主語にして『使いにくい／持ちにくい』と書く」のが自然なのに、
  前回の修正（キーワードを文へ差し込まない）が両方に一律で効いてしまい、道具系キーワードで
  「爪切りが使いにくい」のような自然な文までは生成できていなかった（生成の質の底上げ）。
- **スタブ生成（`src/lib/ai/seed-data.ts`）**: `TOOL_ASPECTS`（新規、`Record<string, Aspect[]>`）を追加。
  爪切り／箸／スプーン／リモコン／ハサミ（表記ゆれ「ハサミ」→内部キー「はさみ」）／歯ブラシ／ドアノブ／
  手すり／浴槽／トイレの 10 語について、キーワードを主語にした自然な困りごとを 2〜3 件ずつ用意
  （道具ごとに動詞を変える：使いにくい／持ちにくい／操作しにくい／握って開閉しにくい／握って回すのが
  難しい／またいで出入りする動作が難しい 等）。`toolAspectsFor(text)` で完全一致・部分一致を判定し、
  `stubPoolFor` はドメイン判定より先にこれを見る（一致すれば `[...tool, ...NEUTRAL_ASPECTS]`、
  無ければ従来どおり分野判定 → `NEUTRAL_ASPECTS`）。件数が専用件数を超えたら従来どおり
  `NEUTRAL_ASPECTS` で補う（キーワードを含まない一般的な困りごとに自然劣化する）。
- **検証（`isConcreteDifficulty`）は変更しない**: 元々 `DIFFICULTY_MARKER` に「にくい」を含んでいたため、
  「使いにくい」等はすでに許容されていた。`isThemeAsSubjectClause`（前回追加）も「キーワード＋助詞＋
  難し/できな」の並びしか見ておらず「にくい」終わりは対象外だったため、「爪切りが使いにくい」は
  元々弾かれていなかった（確認のみ・実装変更なし）。かっこ書きの差し込み（「「爪切り」で、〜」）は
  物・道具でも引き続き禁止。
- **プロンプト（`SEED_SYSTEM_PROMPT` / `buildUserPrompt`）を書き分け**: キーワードを
  A活動・趣味／B行動・家事／C仕事・作業／D物・道具／E設備・環境 に分類する考え方を明示し、
  A/B/C は従来どおり「キーワードを差し込まない」、D/E は「キーワードを主語にしてよい・道具に合った
  動詞を選ぶ・『使いにくい』を使い回さない・根拠のない身体症状（震え・麻痺等）を付け加えない」と
  明記。自己チェック項目・ユーザープロンプトのチェックリストにも反映。
- 挙動は変わらないもの: テーマ逸脱防止・重複回避（`nearDuplicate`）・再生成のたびに違う切り口を返す
  仕組み（`offset` ローテーション）・5 分類の活動ドメイン（deskwork/cooking/outing/cleaning/laundry）は
  すべて無変更。
- テスト: `tests/unit/seed-data.test.ts` に、`isConcreteDifficulty` の道具系 OK パターン
  （爪切り・箸・リモコン・ハサミ・ドアノブ・階段が使いにくい/持ちにくい/難しい 等）、`localStubDrafts`
  で爪切り・箸・リモコン・ハサミ（表記ゆれ含む）がキーワードに触れた自然な文になること、件数超過時に
  `NEUTRAL_ASPECTS` で補うこと、根拠のない身体症状を含まないことを追加。
  - 追加した `TOOL_ASPECTS` のうち「浴槽」の 2 件が既存の重複判定 (`nearDuplicate`) に
    引っかかったため（共有トークンが「浴槽」「難」の 2 つだけで、小さい側が丸ごと含まれる判定に該当）、
    語数を増やして自然に書き直した（実装のバグではなく、キュレーション時に見つけて直したもの）。
  - 全体 371/371 で緑。

### 2026-09-11 AI生成「困ったこと」生成ロジック改善（指示書の総仕上げ・辞書拡充）
- 指示書「AI生成『困ったこと』生成ロジック改善指示」を受けて対応。前2件（キーワード変換ルール修正／
  生成ルール修正）とほぼ同じ分類方針の総仕上げ版で、新しく追加が必要だったのは主に次の3点。
- **`TOOL_ASPECTS` を拡充**（`src/lib/ai/seed-data.ts`）: 指示書の例に出てきた道具・設備のうち
  未対応だった 7 語を追加 — フォーク／スマートフォン（別名「スマホ」を `TOOL_ALIASES` に追加）／
  ペン／財布／傘（物・道具）、玄関／ドア（場所・設備）。既存 10 語と合わせて計 17 語。
- **バグの芽を先回りで修正**: 「ドア」を新規追加するにあたり、既存の「ドアノブ」との部分一致の
  取り違えに気づいた（`toolAspectsFor` は元々「テーマが道具名を含むか」で部分一致していたため、
  オブジェクトのキー列挙順で先に見つかった方を返してしまい、"ドアノブ" 入力時に短い "ドア" の
  汎用的な困りごとを返しかねなかった）。`toolAspectsFor` を「部分一致のうち最も長く一致した語
  （＝より具体的な語）を優先する」実装に変更し、この状態でも常に「ドアノブ」入力は「ドアノブ」専用の
  候補を返すことをテストで固定した。
- **AI プロンプトに追記**: キーワード分類に F.「その他」（A〜E に明確に分類できない・複数の意味を
  持ちうるキーワード。例:「料理」）を追加し、判断がつかない場合は無理に絞らず最も自然で汎用的な
  困りごとにする方針を明記（スタブでは既存の `NEUTRAL_ASPECTS` フォールバックが同じ役割）。
  物・道具について、内部で「持つ→位置を合わせる→力を入れる→操作する」のように動作を分解してから
  1 つを選ぶという考え方のヒントを追加（出力に手順そのものを書く必要はないと明記）。
  自己チェックに「単なるキーワードの言い換えになっていないか」を追加。
- 挙動が変わらないことを確認したもの: `isConcreteDifficulty` の検証ロジック（`DIFFICULTY_MARKER` が
  元々「にくい」を含み、`isThemeAsSubjectClause` も「にくい」終わりは対象外のため、道具系の
  「〜が使いにくい」は今回も前回も一貫して許容されている）。5 分類の活動ドメイン・テーマ逸脱防止・
  重複回避・再生成ローテーションは無変更。
- テスト: `tests/unit/seed-data.test.ts` に新規 7 語（フォーク／スマートフォン／ペン／財布／傘／玄関／ドア）
  がキーワードを含む自然な文になること、「スマホ」が「スマートフォン」と同じ候補を返すこと、
  「ドア」と「ドアノブ」が取り違わずそれぞれ専用の候補を返すことを追加。全体 379/379 で緑。

### 2026-09-11 AI生成「物・道具」判定ロジックの修正（TOOL_ASPECTS を撤去、方式を転換）
- 指示書「AI生成『物・道具』判定ロジックの修正」を受けて対応。前2件で作った `TOOL_ASPECTS`
  （個別の道具名をコードへ事前登録し、その道具に合った困りごとを返す辞書）が、まさに指示書が禁止する
  「特定単語リストによる物判定」そのものであり、未登録の新しい道具名（ホッチキス・耳かき・
  電気ケトル等）には対応できない、という指摘。ユーザー確認済みの方針転換として、この方式を撤去した。
- **削除**: `TOOL_ASPECTS`（17 語の辞書）・`TOOL_ALIASES`・`toolAspectsFor` を `src/lib/ai/seed-data.ts`
  から完全に削除。`stubPoolFor` は「既存の 5 分野（deskwork/cooking/outing/cleaning/laundry）に
  当てはまれば分野の困りごと、当てはまらなければ全部 `NEUTRAL_ASPECTS`」という、TOOL_ASPECTS 導入前の
  形に戻した。5 分野の判定（`SEED_DOMAINS` / `domainFor` / `seedDomainKey`）は今回の対象外として維持:
  これは「テーマ逸脱防止」指示書（話が別分野へそれていないかの検知）が目的であり、「この単語は物か」
  という物・道具判定とは別の関心事のため。
- **本質的な制約（ユーザーへの説明が必要な点）**: `ANTHROPIC_API_KEY` 未設定時の決定的スタブは
  そもそも AI を呼べないため、キーワードの意味を LLM に理解させることが原理的にできない。
  「特定単語を登録しない」という要件と「AI無しでも動く」という既存要件（指示書「AI仮データ生成・
  管理機能」§冒頭）を両立させる唯一の道は、**スタブでは物・道具の区別自体をやめ、5 分野外の
  キーワードはすべて同じ汎用的な困りごと（`NEUTRAL_ASPECTS`）にする**こと。よって
  `ANTHROPIC_API_KEY` 未設定時は「爪切りが使いにくい」のような道具特有の言い回しは出なくなり、
  「細かい手先の作業を正確に行うのが難しい」のような汎用文になる（活動キーワードと同じ扱い）。
  **実際にキーワードの意味を理解し道具に合った言い回しを選ぶのは、AI が使えるとき
  （`generateSeedDrafts` → `callJsonArray` + `SEED_SYSTEM_PROMPT`）の役目**であり、こちらは
  最初から辞書に依存していない（`normalizeDrafts` も `isConcreteDifficulty` も特定の道具名を
  一切参照しない。前回・前々回の TOOL_ASPECTS もスタブ専用で、AI 経路の生成には使っていなかった）。
- **プロンプトを「分類」より「意味理解」優先の書き方に修正**（`SEED_SYSTEM_PROMPT`）: 冒頭を
  「入力されたキーワードが何を意味するのかを理解してください」から始まる説明に差し替え、
  A〜F の分類は「固定の分類表ではなく考え方を示す例」と明記。事前に例として挙がっていない道具
  （ホッチキス・耳かき・電気ケトル等）が来ても、言葉の意味から道具だと理解して同じ考え方で
  生成するよう明記。「分類そのものを回答する必要はなく、1 回の生成の中で意味を理解し、
  ふさわしい書き方を直接選ぶ」ことを明記し、2 段階（先に分類→次に生成）の処理を示唆する記述を排除。
- テスト: `tests/unit/seed-data.test.ts` の TOOL_ASPECTS 依存だった describe を全面差し替え。
  - 「以前コードに登録していた道具名（爪切り）」と「登録したことのない道具名（ホッチキス／耳かき）」が
    スタブで**完全に同じ結果**になることを確認（特別扱いが無いことの直接証明）。
  - 事前登録の無い道具名（ホッチキス／耳かき／電気ケトル／ファスナー／杖／電動歯ブラシ）でも
    `isConcreteDifficulty` を満たす具体的な困りごとになることを確認。
  - `normalizeDrafts` が、コード側の辞書に存在しない道具名に対する（AI 想定の）difficulty も
    そのまま検証・受け入れることを確認（検証ロジックが辞書非依存であることの証明）。
  - 活動・行動・設備の既存キーワード（園芸・読書・料理を作る・掃除・洗濯・階段・ドアノブ・浴槽）は
    従来どおり自然な困りごとになることを回帰確認。
  - 全体 388/388 で緑。

### 2026-09-11 「物・道具」キーワード管理機能：実装 → ユーザー指示により撤回

- 「私は、ローカルのみで認識してほしい」という要望を受け、管理者が DB へ物・道具キーワードを
  登録できる画面（`/admin/seed-data/object-keywords`、新テーブル `seed_object_keywords`、
  管理 API、初期値 7 語の投入スクリプト等）を一度実装した。
- 動作確認の過程で、既定生成件数（10 件）のうち実際にキーワードへ言及する候補が
  半分に満たない（テンプレートが 4 種類しかなく、残りは無関係な `NEUTRAL_ASPECTS` の汎用文になる）
  という設計上の不具合が見つかり、テンプレート拡充などの追加修正を検討していた。
- その途中で、ユーザーから「「物・道具」キーワード管理の機能の実装はやめて無い状態にして」と
  明示的な撤回指示があり、実装した内容（DB テーブル・マイグレーション・管理 API・管理画面・
  `matchObjectKeyword`/`OBJECT_KEYWORD_TEMPLATES`・関連テスト・関連ドキュメント記述）を
  すべて削除し、この機能に触れる前の状態に戻した。ローカル DB のテーブルも `DROP TABLE` し、
  `_prisma_migrations` の記録も削除して、マイグレーション履歴に痕跡を残さないようにした。
- **結果として、「AI キー未設定のスタブ経路で『これは物・道具』と認識する」という当初の課題は
  未解決のまま**（元の状態＝5 分野判定＋`NEUTRAL_ASPECTS` フォールバックに戻っている）。
  この課題を今後扱う場合は、今回の実装（本エントリの前の 2 エントリ、履歴には残さず削除済み）で
  見つかった「テンプレート数と生成件数の比率」の問題を踏まえて設計し直すこと。
- `SEED_SYSTEM_PROMPT`（実 AI 経路のプロンプト）に対する直後のキーワード理解・関連性強化
  （次のエントリ）は、この物・道具キーワード管理機能とは独立した変更であり、影響を受けていない
  （そちらは元々 `objectKeywords` を一切参照しない設計だったため）。

### 2026-09-11 AI仮データ生成｜キーワード理解・関連性を厳密化する修正

- 指示書「AI仮データ生成｜キーワード理解・関連性を厳密化する修正指示」を受けて対応。従来のプロンプトは
  「キーワードの意味を理解して書く」までは達成していたが、**理解した意味から何段階も推理を重ねて
  別の状況を創作すること**（指示書の例: キーワード「ボタン」→「一度手を止めると、どこまで進めたか
  分からなくなって再開が難しい」＝ボタンから認知・記憶の話へ飛躍）を止める記述が無かった。
- **`SEED_SYSTEM_PROMPT`（`src/lib/ai/seed-data.ts`）に追加した節**:
  1. 「■ キーワードとの直接的な関連性を最優先する（最重要）」— キーワードから直接言える操作
     （押す／つまむ／留める等）と、そこから推理を重ねた「AI の想像・創作」を区別し、後者を禁止。
     「ボタン」の NG/OK 例をそのまま採用。
  2. 「■ キーワードの用途を勝手に限定しない」— 「ボタン」は服／家電／PC など複数の用途を持ちうる
     ため、特定の用途に断定せず、確実に言える範囲の汎用表現を優先するよう明記。
  3. D（物・道具）の例示語に「鍵・ボタン」を追加し、動詞の使い分け例（鍵→持つ・差し込む・回す／
     ボタン→押す・つまむ・留める）を追加。
  4. 物・道具の「動作を頭の中で分解する」考え方に、分解は**その物を扱う直接の動作の範囲にとどめ、
     作業の中断・記憶・段取りのような別の状況へ発展させない**という歯止めを追加。
  5. 自己チェックを 10 項目→ 12 項目に拡張（11: キーワードから直接説明できるか＝推理の飛躍が
     無いか、12: 用途を勝手に断定していないか）。
- **意図的に変更しなかったもの（指示書の明示的な禁止事項）**:
  - 指示書 16「本番AI生成で、object-keywords 等の単語リストを参照して意味分類する仕組みを
    追加しない」に従い、AI 経路（`generateSeedDrafts` の `callJsonArray` 呼び出し）は単語リストを
    一切参照しない設計のまま変更していない（なお「物・道具」キーワード管理機能自体は、この
    エントリの直前でユーザーの指示により実装ごと撤回済み。前エントリ参照）。
  - `isConcreteDifficulty` の判定ロジック自体は変更していない。指示書 15「キーワードが文章に
    含まれているだけを理由に不合格にしてはいけない」を元々満たしていた（`core === t || d === t` の
    **完全一致**のみを不合格にし、部分一致は問わない設計だったため）ことをテストで確認・明文化した。
  - 個別キーワードのコードへの追加（「ボタンを物リストに追加」等）は一切行っていない。
- **テスト**: `isConcreteDifficulty` に新規 describe を追加（`tests/unit/seed-data.test.ts`）。
  - 指示書の OK 例（「ボタンを押す操作がしにくい」等）が、キーワードを含むことを理由に不合格に
    ならないことを確認。
  - 「鍵」も同様に確認（D の新しい例示語）。
  - 「「ボタン」で、〜」「ボタンをすることが難しい」の機械的差し込みは引き続き NG であることを確認。
  - **既知の限界として明文化**: 指示書 18 の NG 例（認知・記憶へ飛躍した創作）は、連番でも機械的
    差し込みでもなく「difficult」を含むため、`isConcreteDifficulty` だけでは形式的に合格してしまう
    ことをテストで固定（コメントで理由を明記）。この意味的な関連性の担保はプロンプト側の役割であり、
    コードで検証しきれるものではないため、正直にテストへ残した（偽陽性の安全チェックを装わない）。
  - `normalizeDrafts` の「事前登録の無い道具キーワードでも受け入れる」テストに「ボタン・鍵・
    リモコン」を追加（指示書 17 の最終テスト対象語）。
  - 全体 407/407 で緑。`npx tsc --noEmit` / `npm run lint` も緑。
- **検証できないことの明示**: この修正は主にプロンプトの記述強化であり、実際にモデルが指示に従って
  「ボタン」から認知・記憶の話を創作しなくなったかどうかは、ローカル環境（`ANTHROPIC_API_KEY` 未設定）
  では検証できない。本番で AI キーを設定して実際に生成し、目視確認することが必要（指示書 17/18 の
  テストキーワード一覧を使うとよい）。

### 2026-09-11 登録画面・登録項目 更新指示書

- 指示書「できる道｜登録画面・登録項目 更新指示書」を受けて、「自分の道を作る」「試したことを記録」の
  登録項目を DB/API/UI の三者で一致させた。
- **Road（自分の道を作る）**:
  - `previouslyAble`（以前できていたこと）を `roadCreateSchema` で必須化。あわせて `difficulty`
    （できなくなったこと）・`goal`（できるようになりたいこと）も必須化（従来は「どちらか一方でよい」
    だった）。DB カラムは nullable のまま変更していない（過去データ・ロールバックの安全のため。
    必須はあくまで登録 API・UI の制約）。
  - `road-form.tsx`（作成画面）に「以前は何ができていましたか？」を新規追加し、指示書の並び順
    （以前できていたこと → できなくなったこと → できるようになりたいこと → いつ頃から → 場面 → メモ）
    に合わせた。3 項目とも未入力なら、最初に空いている項目にフォーカスしてエラーを出す。
  - `road-edit-form.tsx`（編集画面）はもともと `previouslyAble` の入力欄を持っていたため変更は
    小さい。3 項目とも `required` 表示を追加し、空文字を送ると保存済みの値を消してしまう問題を
    修正（送信前に空なら該当キーをボディから省略するよう変更。update スキーマは必須型の
    partial なので、`null` は元々受け付けない設計だった）。
  - 指示書 §10（道のタイトル）・§13（Road の公開設定=visibility）は、現行実装との前提が食い違って
    いたため実装しなかった: `title` 列は既に別指示書で削除済み（一覧の見出しは `difficulty` が代替）。
    Road に `visibility` 列は無く、公開は個別の Attempt 単位（`is_published`）——これは指示書 §13
    の末尾（「個別の Attempt だけを『経験』として公開できる現在の設計を維持する」）にも整合するため、
    新しい列は追加していない。
- **Attempt（試したことを記録）**: `achievementPercent`（できた度）／`feeling`（気持ち）／
  `stateAfter`（その後）／`previousAttemptId`（前に試した方法）を登録・編集画面と書き込み API
  （`attemptCreateSchema`/`attemptUpdateSchema`）から削除。「気持ち」「その後」は既存の
  「メモ・気づき」（`memo`）へ統合（フォームには元々 `memo` 欄が独立して存在していたため、実質的には
  「気持ち」「その後」のセクションを削除するだけで済んだ）。
  - **実装前に利用者へ確認した重要な事実誤認**: 指示書は「Attempt 同士を直接つなぐ項目がない」
    「これらの項目に対応する DB/API 仕様がない」という前提だったが、実際には逆で、この 4 項目は
    既存の「道の見える化」機能（`branching-paths.tsx` / `road-detail.ts`）に深く組み込まれていた
    ——`previousAttemptId` は分岐ツリーの親子関係そのもの、`stateAfter` は各枝の「現在」ラベルの
    出典、`feeling` は分岐ツリー・経験詳細に表示、`achievementPercent` は検索結果カード・方法
    カード・道カードの「できた度」バッジの出典。指示書どおり実装すると、これらの表示機能自体は
    壊れないが、**この変更以降に作成される新規 Attempt では二度と表示されなくなる**（分岐ツリーは
    今後すべて独立ノードになり、バッジ・現在ラベルは付かなくなる）。この点を明示して確認を取り、
    「指示書どおり 4 項目とも削除する」の回答を得てから実装した。
  - DB カラム（`achievement_percent`/`feeling`/`state_after`/`previous_attempt_id`）・
    表示コード（`branching-paths.tsx`/`road-detail.ts`/`road-card.tsx`/`method-card.tsx`/
    `experiences/[id]/page.tsx`）・シリアライザ（`serializers.ts`）は一切変更していない。
    既存の過去データはそのまま表示され続ける（指示書 §29 の「既存の検索・経験表示・自分の道表示を
    壊していない」を満たす）。
  - `src/lib/attempts.ts`（`assertValidPreviousAttempt`、previousAttemptId 専用のバリデータ）は
    呼び出し元が無くなったため削除。
  - `attempt-form.tsx` から `siblingAttempts` prop（「前に試した方法」の選択肢）を削除し、
    呼び出し元の 2 ページ（`attempts/new` / `attempts/[attemptId]/edit`）のフェッチ・受け渡しも削除。
- **テスト**: `tests/unit/validation.test.ts`（roadCreateSchema の必須化・attemptCreateSchema が
  廃止 4 項目を黙って無視することを確認）、`tests/integration/roads.authz.test.ts`（既存の
  CSRF テストが 3 必須項目を送るように更新）を修正。`tests/integration/attempt-v6.test.ts`
  （廃止された v6 API 契約のテスト）を削除し、`tests/integration/attempt-registration.test.ts`
  （新規）で新しい契約（Road 3 項目必須・Attempt 4 項目は送っても保存されない）を確認。
  `npx tsc --noEmit` / `npm run lint` / `npx vitest run`（394/394）緑。
  - **e2e（`tests/e2e/`）**: 作業中にユーザーの `npm run dev` が停止したタイミングを確認できたため
    （`lsof -nP -iTCP:3000` で未使用を確認）、実際に `npx playwright test`（desktop / mobile
    両プロジェクト）を最後まで実行した。関連して更新したファイル:
    `road-create.spec.ts`（必須メッセージの文言変更・3 項目必須入力・新規に「2 番目・3 番目の必須」
    テストを追加）、`critical-flow.spec.ts`（道作成に `previouslyAble` の入力を追加）、
    `account/admin/likes/reads/reads-carryover.spec.ts`（`/api/v1/roads` への直接 POST に
    `previouslyAble` を追加）、`branching-paths.spec.ts`（3 箇所の道作成に `previouslyAble` を追加、
    かつ 1 テストで `stateAfter`/`previousAttemptId` を Prisma 直書きに変更——公開 API では
    設定できなくなったため、分岐ツリー表示ロジックの検証用フィクスチャとして `../../src/lib/db` を
    相対 import した。`scripts/*.ts` と同じ理由で `@/` エイリアスは使わない）。
  - 1 回目の実行で 3 件失敗したが、うち 2 件は新規に書いた `road-create.spec.ts` のテスト自体の
    バグ（`getByText` が「バナー」と「フィールド直下」の同一文言 2 箇所にヒットする strict mode
    違反）で `.first()` を足して解消。残り 1 件（「経験を探す」のカードは方法別ではなく道別）は、
    このローカル DB に過去のテスト実行で溜まった大量データ（`published+approved` の Attempt が
    8000 件超）による順序依存の既知フレーク——単体で再実行すると通ることを確認済み。今回の変更とは
    無関係（他の統合テストでも同種のフレークを別途確認済み。`docs/implementation-decisions.md` の
    admin-hold 関連の記述を参照）。
  - 最終的に **desktop 60/60・mobile 60/60、あわせて 120/120 で緑**。検証後は `.next` を削除して
    ユーザーの次の `npm run dev` に影響が残らないようにした。

### 2026-09-11 Road登録・編集画面 必須項目修正指示（previouslyAble を任意に戻す）

- 直前の指示書で必須化した `previouslyAble`（以前できていたこと）を、後続の指示書
  「Road登録・編集画面 必須項目修正指示」により**任意に戻した**。理由は「全員が明確に答えられる
  とは限らない」ため。`difficulty`（できなくなったこと）・`goal`（できるようになりたいこと）は
  引き続き必須のまま（今回の指示書 §6 でも明示的に維持）。
- `roadCreateSchema`（`src/lib/validation.ts`）: `previouslyAble` を `trimmedRequired` から
  `trimmedOptional` に戻した。`difficulty`/`goal` は変更していない。
- `road-form.tsx`（作成画面）: `REQUIRED_ORDER` から `previouslyAble` を除去（必須チェック対象は
  `difficulty`→`goal` の 2 つに）。「以前は何ができていましたか？」の `required` プロパティを外し
  （＝ラベル横の「*」と sr-only「（必須）」が付かなくなる）、送信時は空なら省略（`|| undefined`）。
- `road-edit-form.tsx`（編集画面）: 同様に `required` を外し、`previouslyAble` を空にして保存すれば
  そのままクリアされる（他の任意項目と同じ挙動）よう戻した（前回の「空なら省略する」という必須
  項目向けの特別扱いを撤回）。
- **テスト**: `tests/unit/validation.test.ts`・`tests/integration/attempt-registration.test.ts`
  （previouslyAble 省略で作成できる／`previouslyAble` が無くても 400 にならないことを確認する形へ
  反転）。`tests/e2e/road-create.spec.ts` の必須順序テストを「できなくなったこと→できるようになり
  たいこと」の 2 段階に書き直し、新たに「『以前は何ができていましたか？』に必須マークが出ない・
  未入力でも作成できる」テストを追加（`label` 要素のテキストに「必須」を含むかどうかで判定。
  `required` prop は DOM上 `aria-required` を付与しない実装だったため、最初に書いたアサーションは
  誤りと気づき修正した）。
- **検証**: `npx tsc --noEmit` / `npm run lint` / `npx vitest run`（395/395）に加え、ユーザーの
  `npm run dev` が停止していたタイミングで e2e フルスイートを実行——desktop 61/61・mobile 61/61
  （合計 122/122）で緑。1 回失敗した「送信ボタンは連打しても道は 1 件しか作られない」は単体では
  即座に通過し、無関係な一過性フレークと判断。検証後は `.next` を削除。

### 2026-09-11 「試したことを記録」公開設定の初期値修正指示

- 指示書どおり、「試したことを記録」画面の「この記録を『経験』として公開する」チェックボックスの
  新規時の初期状態を ON → OFF（オプトイン）に変更した。
- 変更箇所は `src/components/attempt-form.tsx` の 1 行のみ:
  `useState(attempt?.isPublished ?? true)` → `useState(attempt?.isPublished ?? false)`。
  編集時は既存の `attempt.isPublished` をそのまま使うため、公開済み Attempt を編集しても
  勝手に非公開へ戻る心配はない（`?? false` は attempt が無い＝新規作成時にしか効かない）。
- 指示書 §6 のチェックリスト（新規作成時のデフォルト・API 未指定時の扱い・DB デフォルト・編集時の
  保持・公開経験検索への影響）は、UI の初期値以外すべて**もともと `false` 前提で実装済み**だったこと
  を確認した: `prisma/schema.prisma` の `isPublished Boolean @default(false)`、
  `POST /api/v1/roads/{roadId}/attempts` の `input.isPublished ?? false`、
  `PATCH /api/v1/attempts/{attemptId}` の `input.isPublished !== undefined` ガード（未指定なら
  既存値を保持）、公開検索のゲート（`isPublished=true && moderationStatus=approved`）——いずれも
  変更不要。**UI だけ直せば済む理由はここにある**（指示書 §6 の「UIだけ必須マークを外して～は禁止」
  という趣旨に反していないか確認した上での判断）。
  - なお `attemptCreateSchema` に `.default(false)` を足す誘惑があったが、それをやると
    `attemptUpdateSchema`（`.partial()`）側でも zod のデフォルト適用により `isPublished` 未指定の
    PATCH が常に `false` に化けてしまい、「公開済み Attempt を編集しても勝手に非公開にしない」
    という要件を壊す。そのため意図的に手を付けなかった（ルート側の `?? false` 分岐だけで十分）。
- **テスト**: `tests/integration/attempt-registration.test.ts` に新規 describe を追加
  （isPublished 未指定→非公開で作成／true 明示→公開／編集で isPublished を送らなければ公開状態が
  保持されることを確認）。`tests/e2e/critical-flow.spec.ts` は新規記録 2 件とも「初期状態は未チェック」
  を確認したうえで明示的にチェックするよう修正（従来は初期値 ON に依存して何もクリックしていなかった）。
- `npx tsc --noEmit` / `npm run lint` / `npx vitest run`（398/398）緑。e2e は着手時点でユーザーの
  `npm run dev` が起動中だったため（`.next` 競合を避ける方針）今回は実行せず、ソースレビューのみで
  済ませた。次回 dev サーバー停止時に `npx playwright test` を実行して確認する必要がある。

### 2026-09-11 「道を編集」画面の編集可否修正指示（difficulty のロック廃止）

- 「できなくなったこと」（`difficulty`）を一度設定すると変更できない、という既存の制限
  （`再作成指示書「作成エラー対策」` 以来の仕様。道の同一性を保つ目的で導入されていた）を廃止し、
  `goal`/`previouslyAble` と同じ通常の編集可能項目にした。`goal` は必須のまま、`previouslyAble` は
  任意のまま——変更したのは `difficulty` の「編集不可」制限だけ（指示書 §12「変更範囲」どおり）。
- `src/app/api/v1/roads/[roadId]/route.ts`（PATCH）: ロック検証（`current.difficulty` の事前読み取り
  → 値が違えば `409 conflict`）と、それに付随していた「まだ null であることを条件にした原子的
  `updateMany`」（同時に 2 リクエストが初回設定を競合させたときの防止機構）を丸ごと削除し、
  素直な `prisma.road.update` に戻した。`assertRoadOwner` が呼び出し時点で存在・所有権を検証済み
  のため、単純化しても安全（`Prisma` 型 import も不要になり削除）。
  - 「空文字にすると 400」は `roadUpdateSchema`（`trimmedRequired` を `.partial()` した型）が
    もともと検証している——`difficulty` キーを含める場合は空文字を許さない。追加コード不要。
- `src/components/road-edit-form.tsx`: `difficultyLocked`/`lockHint`（「一度設定したため、変更
  できません」の表示・`readOnly`）を削除。「できなくなったこと」を「やりたいこと・目標」と同じ
  通常の必須テキスト欄にした。送信前に difficulty/goal が空なら画面内で止めてエラー表示する
  バリデーションを追加（従来は goal も含めて「空なら黙って送らない」という設計だったが、指示書
  §2/§11 の「空にして保存しようとした場合はバリデーションエラーとする」に合わせて、初回登録画面
  （`road-form.tsx`）と同じ「エラーを見せて止める」方式に統一した）。
- **テスト**: `tests/integration/roads.authz.test.ts` の「一度設定すると変更不可」describe を全面
  差し替え（変更できる・空文字は 400・省略時は他項目だけ更新できる・未設定 Road でも何度でも再設定
  できることを確認）。同時初回設定の競合テストは、ロック自体が無くなり意味を成さなくなったため削除。
  `tests/e2e/road-edit.spec.ts`（新規、道編集画面の e2e が今まで無かったため追加）で、変更不可表示が
  出ないこと・通常の入力欄として編集でき再表示されること・空にすると保存できずエラーが出ること・
  `previouslyAble` は空のままでも保存できることを確認。
- `npx tsc --noEmit` / `npm run lint` / `npx vitest run`（398/398）緑。今回はユーザーの
  `npm run dev` が停止していたタイミングで e2e フルスイートも実行——desktop 64/64・mobile 64/64
  （合計 128/128）で緑。検証後は `.next` を削除。

### 2026-09-11 Road・Attempt 登録／検索／公開設定の最終動作確認指示書

- 「実装変更を目的とせず、まず調査・検証する」指示のとおり、コード調査＋テスト実行で確認した。
  **実装済みの動作に不具合は見つからなかった**（`roadCreateSchema`・`attemptCreateSchema`・
  `PATCH /roads/{roadId}`・`PATCH /attempts/{attemptId}`・`PUBLIC_ATTEMPT_WHERE`・
  `buildExperienceWhere` はいずれも前 3 回の指示どおりの状態のまま）。
- **AI検索が架空の経験を作っていないかの確認（§14）**: `src/lib/ai/search.ts`
  （`expandSearchIntent`）のプロンプトを確認。「経験・事実・体験談を作り出さない。検索語だけを出す」
  と明記されており、そもそも検索結果の中身（Road/Attempt の実データ）を AI が生成する経路自体が
  存在しない——AI は検索語（キーワード）を広げるだけで、実際にカードとして表示される内容は常に
  `searchRoads`/`searchMethods` が DB から取得した実データ。`POST /api/v1/ai/summarize-experiences`
  も入力を `PUBLIC_ATTEMPT_WHERE` で絞った実データのみに限定しており、架空の経験を作る余地がない
  ことを確認した。
- **previouslyAble の検索利用（§6/§7）**: `src/lib/search.ts` の OR 句で `previouslyAble` は
  `difficulty`/`goal`/`method`/`memo`/`situation`/タグと並ぶ**一つの追加条件**に過ぎず、null の
  Road は単にその条件にヒットしないだけで、クエリ全体が失敗したり他の条件を妨げたりしない
  （コードを読んで確認。これは元々そうだったため実装変更なし）。
- 唯一「調査で気づいた・直した」のはテストのギャップ:
  `tests/integration/attempt-registration.test.ts` に previouslyAble 有無・公開境界の検索テストが
  無かったため追加した。追加時に、**ローカル環境（`ANTHROPIC_API_KEY` 未設定）では
  `POST /api/v1/roads/{roadId}/attempts` に `isPublished: true` を渡しても、AI 審査のフォールバック
  （`verdict: "unknown"`）により `moderationStatus` が `pending` のまま止まり、
  `PUBLIC_ATTEMPT_WHERE`（`isPublished && moderationStatus=approved`）を満たさず検索に出てこない**
  ことを実際にテストの失敗で確認した。これはバグではなく、モデレーション機能自体の既知の仕様
  （AI 未設定時は運営レビュー待ちにする、という元々の設計）。テストは `experiences.api.test.ts` と
  同じ慣習に倣い、公開可視性だけを見たい箇所は `prisma.attempt.create` で `moderationStatus:
  "approved"` を直接指定する形に修正して解消した（本番で `ANTHROPIC_API_KEY` があれば
  `POST` 経由でも実際の AI 審査を経て同じ結果になる）。
- 非公開 Attempt 編集で false が維持されることの明示的なテストが無かった点も追加した
  （true 維持のテストはあったが false 維持のテストが無かった）。
- `npx tsc --noEmit` / `npm run lint` / `npx vitest run`（402/402、新規 5 件追加）緑。e2e は今回
  ソースコードを変更していない（テスト追加のみ）ため、直前の指示書検証時に確認済みの
  desktop 64/64・mobile 64/64（合計 128/128）がそのまま有効と判断し、再実行はしていない
  （着手時点でユーザーの `npm run dev` が起動中だったため）。

### 2026-09-11 簡易登録 最終動作確認指示書

- コード調査＋テスト実行で確認。**実装済みの動作に不具合は見つからなかった**。
  `src/lib/quick-submit.ts`・`src/app/api/v1/quick-experiences/route.ts`・
  `src/components/quick-submit-form.tsx`・`quickExperienceSchema` はいずれも仕様どおり。
- **指示書 §5「Roadを勝手に作成していないか」の実態**: 実装は `Road` を**作成する**
  （`createQuickSubmission` が `prisma.road.create({ difficulty })` を呼ぶ）。ただし所有者は
  匿名の受け皿システム利用者（`ANON_SUBMITTER_SUB`。Google ログイン不可・公開面に一切出ない・
  何度投稿されても 1 行だけ upsert される）であり、実在のログインユーザーの「自分の道」には
  一切現れない。コード冒頭のコメントに「新しいデータモデルは作らない。既存の Road + Attempt を
  そのまま使う」と明記されている、意図した設計。指示書の「経験データとして登録するだけ」という
  想定とは字面上ずれるが、実質的な懸念（実ユーザーの一覧を汚染しない）は満たされているため、
  変更しなかった——これは指示書 §5「既存の実装がこの考え方と異なる場合は、現在のコードを確認して
  実際の仕様を報告する。勝手に変更しない」に従った判断。
- **指示書 §7「AIモデレーションのフォールバック」の実態**: 通常の Attempt 公開
  （`applyModerationOnPublish`）は AI verdict "ok" で即 approved になるが、簡易登録は
  **AI 判定の結果に関わらず必ず `moderationStatus=pending`** で作られる（`aiVerdict`/`aiReason` は
  運営が確認するときの参考情報として保存されるだけ）。つまり本番で `ANTHROPIC_API_KEY` を設定しても
  簡易登録が自動公開されることはなく、`/admin/moderation` での人手承認が唯一の公開経路——匿名投稿を
  自動公開しないという指示書 §5 の理解と一致する、意図した非対称設計。**本番で承認処理を進めるために
  必要な設定は「AI キー」ではなく「運営が `/admin/moderation` を定期的に確認すること」**（AI キーは
  審査の参考情報を増やすだけ）。
- 個人情報保護（§10）: `serializeExperience` を確認。`road.userId` は `isMine` 判定に使うだけで
  DTO には一切出さない。氏名・メール・`googleSub`・管理用メモ（`moderationNote`/`aiReason`）は
  どの公開レスポンスにも含まれない。
  架空経験の生成（§11）: 簡易登録に AI が経験本文を生成する経路はない（`moderateAttemptContent` は
  入力を審査するだけで新しい文章を作らない）。
- 不正登録対策（§14）の棚卸し: **実装済み** = CSRF（`handle()` の `assertSameOrigin`）／
  レート制限（6/分・IP 単位、バーストテストで確認）／Edge レベルの IP ブロックリストと既知 AI
  クローラー拒否（`src/middleware.ts` の `screenEdgeRequest`、全リクエストに適用）。**未実装・今回は
  対象外** = CAPTCHA 等の高度な bot 行動分析。
- **見つかったのはテストの穴のみ**: `quickExperienceSchema` の単体テストが一つも無かった
  （必須 3 項目・400 字制限・5 分類許可・整形処理）。統合テストは method 欠落と不正な result 値は
  あったが、difficulty 欠落・result 未指定・5 分類すべての保存確認が無かった。
  `tests/unit/validation.test.ts` に新規 describe を追加（4 件）、
  `tests/integration/quick-experiences.api.test.ts` に 3 件追加（difficulty 欠落 400、result 未指定
  400、5 分類すべてが保存でき「成功だけを公開優遇するフィルタが無い」ことを確認）。
- `npx tsc --noEmit` / `npm run lint` / `npx vitest run`（409/409、新規 7 件）緑。e2e は今回も
  ソースコードを変更していない（テスト追加のみ、かつ着手時点でユーザーの `npm run dev` が起動中）
  ため再実行せず、直前ラウンドで確認済みの `quick-submit.spec.ts` 3/3（desktop・mobile 各）を含む
  128/128 がそのまま有効と判断した。

### 2026-09-11 簡易登録画面「try.png」画像追加指示書

- `/try`（「あなたの経験を教えてください」）のタイトルより上に、既存の `public/try.png`
  （実寸 1774×887）を導入イラストとして追加。変更は `src/app/try/page.tsx` の 1 ファイルのみ
  （`next/image` を実寸 width/height 指定 + `className="h-auto w-full"` で追加。
  `story-strip.tsx` と同じ既存パターンを踏襲し、枠線・影・角丸などの新規装飾は付けなかった）。
  フォーム（`QuickSubmitForm`）・API・DB・検索仕様は無変更。
- **稼働中サーバーの誤検知**: 実装直後、変更が反映されているか `curl localhost:3000/try` で
  確認しようとしたところ、新しい alt テキストが一切出てこなかった。調べたところポート 3000 は
  `npm run dev` ではなく `npm run start`（本番プレビュー、`.next` の事前ビルドを配信するだけで
  ソース変更を拾わない）が掴んでいたことが判明。本番プレビューが動いている間に `npm run build`
  すると配信中の `.next` を書き換えて壊す恐れがあるため、その場では e2e を実行せず、ユーザーに
  状況を報告した。
- 直後にユーザーが新しい `npm run dev`（または別プロセス）を起動しようとして
  `EADDRINUSE :::3000` が発生。原因は上記の残存プレビュープロセスだったため、そのプロセス
  （`next-server` と親の `npm run start`）を `kill -9` して停止し、ポートを解放した
  （このリポジトリで繰り返し起きている「残存プロセスによる EADDRINUSE」の既知パターンと同一。
  `CLAUDE.md` の `.next` 競合の注意と表裏一体の事象として今後も疑ってよい）。
- ポート解放後にユーザー依頼で e2e フルスイートを実行——**desktop 64/64・mobile 64/64
  （合計 128/128）で緑**。`quick-submit.spec.ts`（axe-core のアクセシビリティ監査込み）も
  問題なく、`try.png` の alt・レイアウトに a11y 上の懸念がないことを確認した。検証後は `.next`
  を削除。`npx vitest run` も 409/409 のまま変化なし（ロジック変更が無いため）。

### 2026-09-11 検索：自分の投稿は未読ではなく既読扱いにする

- 「検索で自分の投稿は未読ではなく、既読扱いにしてください」の指示で実装。
  `src/lib/serializers.ts`（`serializeExperience`）と `src/lib/queries.ts`（`searchRoads`/
  `searchMethods`）の `isRead` を、投稿者本人が閲覧しているときは実際に開いていなくても
  `true` を返すよう変更（`attempt_reads` に行を作るわけではなく、表示上だけ既読扱いにする）。
- `tests/integration/reads.api.test.ts` に既存の「別ユーザーから見ればまだ未読」という
  アサーション（`ownerId` を「別ユーザー」として扱っていた、今回の要件とは矛盾する古い前提）が
  あり、これを新しい期待値に修正。新規に `tests/integration/search-own-read.test.ts` を追加し、
  `searchRoads`/`searchMethods` 両方で本人=既読・他人=未読・未ログイン=未読を確認。
  `tests/e2e/reads.spec.ts` の「自分の経験は既読にならない」テストも「開いていなくても既読表示に
  なる」へ更新。
- 検証: `npx tsc --noEmit` / `npm run lint` / `npx vitest run`（413/413）緑。e2e はローカルの
  `npm run start` プレビュー（前回と同じ、ユーザーの許可を得て停止）を止めてから実行し、
  desktop 64/64・mobile 64/64（合計 128/128）で緑。

### 2026-09-11 検索：自分の投稿は「既読」ではなく「自分の投稿」だと分かるようにする（前指示の上書き）

- 直後にユーザーから「自分の投稿は、既読ではなく自分の投稿だとわかるようにしたい」と修正指示。
  直前のエントリの「自分の投稿を既読扱いにする」という実装方針を撤回し、専用の表示に差し替えた。
  - `isRead` の「投稿者本人なら強制的に true にする」処理を全て削除し、実際の既読状態のみを返す
    形に戻した（`serializeExperience` / `searchRoads` / `searchMethods`）。
  - 代わりに `RoadCardDTO` / `MethodCardDTO` に `isMine: boolean` を追加（`ExperienceDTO` は
    既存の `like.isMine` をそのまま使えるので追加不要）。
  - `src/components/read-badge.tsx` に `OwnPostBadge`（`IconUser` + 「自分の投稿」文言、
    `--color-accent-soft`/`--color-accent-strong` で通常の既読/未読バッジと見た目を分ける）を追加。
  - `road-card.tsx` / `method-card.tsx`: `isMine` のときは `ReadBadgeAuto` の代わりに
    `OwnPostBadge` を表示。背景色（`ReadAwareCard` の `serverRead`）は `isMine || isRead` にして、
    自分の投稿を未読の強調表示（淡い緑）にはせず、既読と同じ落ち着いた背景にする。
  - 経験詳細ページ・API（`serializeExperience`）は、直前のエントリで一度 `isMine` 強制表示にした
    分を含めて完全に元の「実際の既読状態のみ」に戻した。ページ自体に読み/未読バッジは元々無く、
    `like.isMine` は既にいいねボタンの出し分けに使われていたため、新規フィールド追加は不要だった。
- **テスト**: 直前のエントリで追加・修正した 3 箇所（`reads.api.test.ts` の新規 describe、
  `search-own-read.test.ts`、`reads.spec.ts` の own-card アサーション）を、
  「`isRead` は書き換えない・`isMine`/`OwnPostBadge` で判別する」という新方針に合わせて全面的に
  書き直した。
- 検証: `npx tsc --noEmit` / `npm run lint` / `npx vitest run`（413/413）緑。ユーザーの許可を得て
  ローカルの `npm run start` プレビューを再度停止し、e2e フルスイート実行——desktop 64/64・
  mobile 64/64（合計 128/128）で緑。検証後は `.next` を削除。

### 2026-09-11 いいね通知：表示場所をトップページから「自分の道」へ移動

- 「いいねをしてもらったら表示するメッセージですが、トップに出るのですが自分の道のページを
  表示したときにする」の指示で実装。`LikeNotice`（コンポーネント自体は変更なし）の呼び出し元を
  `src/app/page.tsx`（トップ `/`）から `src/app/me/page.tsx`（自分の道 `/me`）へ移した。
  - `src/app/page.tsx`: `hasLikeNotice` の判定（`prisma.notification.count(...)`）と
    `LikeNotice` の描画、および関連 import（`getOptionalUserId` / `prisma` / `LIKE_NOTIFICATION_TYPE` /
    `LikeNotice`）を削除。ヒーロー section の className も、通知ボックスの有無で `-mt-6` を
    出し分けていた条件分岐が不要になったので、常時 `-mt-6` の単純な文字列に戻した。
  - `src/app/me/page.tsx`: `requirePageUserId()` で確定済みの `userId` を使って同じ
    `prisma.notification.count({ where: { userId, type: LIKE_NOTIFICATION_TYPE, isRead: false } })`
    をこちらに移設し、ページ本文の先頭（見出し行より上）に `{hasLikeNotice && <LikeNotice />}` を追加。
  - `/me` はログイン必須ページ（`requirePageUserId` が未ログインなら redirect 済み）なので、
    トップページ側にあった「未ログインなら null」的な分岐は元々不要で、移設に伴う追加考慮なし。
  - 通知の既読化 API（`POST /api/v1/notifications/read`）・`LikeNotice` コンポーネント自体・
    通知の作成ロジック（いいね時の `notifications` 行作成）はすべて無変更。表示場所のみの変更。
- **テスト**: `tests/e2e/likes.spec.ts` の通知テストを更新。テスト名を
  「いいねを受けた投稿者が『自分の道』を開くと通知が出て、閉じると消える」に変更し、
  まず `/` へ遷移して通知が出ないことを確認するアサーションを追加、続けて `/me` へ遷移して
  通知が出ることを確認する形にした。また「誰がいいねしたか・件数は出さない」の確認を
  `page.getByText(...)` から `role="status"` の通知ボックスに `.filter()` で絞り込んだ
  locator 経由に変更（`/me` の道カードに「試したこと N 件」等、通知と無関係な「件」表記が
  複数あり、ページ全体を対象にすると `/\d+\s*件/` が意図せず複数ヒットしてテストが落ちたため）。
  閉じたあとの再訪確認も `page.goto("/")` から `page.goto("/me")` に変更。
  通知データ自体（API・DB）を検証する `tests/integration/likes.api.test.ts` /
  `tests/integration/account.api.test.ts` はページ非依存のため変更不要（grep で確認済み）。
- 検証: `npx tsc --noEmit` / `npm run lint` ともにクリーン。`npx vitest run` 413/413 緑
  （ページ表示のみの変更のため無影響）。ローカルの `npm run start` プレビュー
  （またも port 3000 を占有していた。ユーザーの許可を得て停止済みのパターンを踏襲し kill -9）を
  停止してから e2e フルスイート実行——desktop 64/64・mobile 64/64（合計 128/128）で緑。
  検証後は `.next` を削除。

### 2026-09-11 道の登録画面：スマホで「いつ頃から難しくなりましたか？」の日付欄が右にはみ出るバグ修正

- 「スマホで、道の登録時に『いつ頃から難しくなりましたか？』の項目が右にはみ出る」の報告で調査・修正。
  原因は 2 つ重なっていた:
  1. `<fieldset>` はブラウザ既定のスタイルで `min-width: min-content` を持つ（HTML の推奨レンダリング
     規則）。通常のブロック要素と違い、中身（特に `<input type="date">` のネイティブ表示に必要な幅）
     より狭くは絶対に縮まらないため、スマホの狭い画面幅では `<fieldset>` 自体が画面より広がって
     右にはみ出ていた。`src/components/road-form.tsx` の道登録フォームの入力欄をまとめる
     `<fieldset>` がこれに該当（編集画面 `road-edit-form.tsx` は `<section>` を使っており対象外）。
  2. `src/components/form.tsx` の `TextField`/`TextAreaField` 共通スタイル `CONTROL` は `w-full`
     のみで `min-w-0` が無く、`<input type="date">` 自体もスマホの一部ブラウザではネイティブ表示に
     必要な幅を「内容の最小幅」として持つため、狭い画面では `w-full` だけでは親幅まで縮まりきらない
     ことがある。
  - 修正: `road-form.tsx` の `<fieldset>` に `min-w-0` を追加。`form.tsx` の `CONTROL`
    （`TextField`/`TextAreaField` 共通、text/date/number 等すべてのコントロールに効く）にも
    `min-w-0` を追加。CSS のみの修正で、フォームの項目・必須/任意・バリデーション・API・DB には
    一切手を入れていない。
- 検証: `npx tsc --noEmit` / `npm run lint` ともにクリーン。`npx vitest run` 413/413 緑
  （CSS のみの変更のため無影響）。ローカルの `npm run start` プレビューが再び port 3000 を
  占有していたため停止してから e2e フルスイート実行——desktop 64/64・mobile 64/64
  （合計 128/128）で緑。検証後は `.next` を削除。

### 2026-09-11 日付欄：スマホのネイティブ日付ダイアログでは値を消せないことがある問題への対応

- 「日付の設定で、スマホの場合、日付のダイアログ表示のリセットで項目が消えない」の報告で対応。
  `<input type="date">` は、一度値を選ぶとブラウザのネイティブ UI だけでは空に戻せないことがある
  （特に iOS Safari は、値が入った状態の日付ピッカーに「消す」操作自体が存在しない）。
  対象の日付欄（道登録の「いつ頃から難しくなりましたか？」`startedAt`、試したこと記録の
  「試した時期」`triedAt` など）はいずれも任意項目のため、選び直し以外に空へ戻す手段が無いのは
  実害がある。
  - 修正は共通コンポーネント側の 1 箇所: `src/components/form.tsx` の `TextField` に、
    `type="date"` かつ値があるときだけ表示される「日付を消す」ボタン（`Field` の `footer` スロット、
    テキスト系の残り文字数カウンタと同じ場所）を追加。押すと `onChange` を値 `""` で呼び出す
    （`{ target: { value: "" } }` の疑似イベント。呼び出し側はどれも `e.target.value` だけを
    読む実装なので、実イベントを経由しなくても状態はそのまま空になる）。
  - `TextField` 経由の全ての日付欄（`road-form.tsx` / `road-edit-form.tsx` / `attempt-form.tsx`）に
    自動的に効く。管理画面の仮データ編集（`admin/seed-draft-fields.tsx`）は `TextField` を使わず
    生の `<input type="date">` のため対象外（管理者専用の内部ツールで優先度が低いため今回は見送り。
    必要になれば別途対応）。
  - ネイティブの日付ピッカー本体（右端のカレンダーアイコン）と場所が競合しないよう、ボタンは
    入力欄の中に重ねず、入力欄の下（footer スロット）に置いた。
- **テスト**: `tests/unit/clear-field.test.tsx` に `TextField` 単体の describe を追加
  （値が無いときは出ない／値があるとき押すと onChange が空文字で呼ばれる／date 以外の欄には出ない）。
  `tests/e2e/road-create.spec.ts` に「値を入れると『日付を消す』が出て、押すと空に戻る」を追加。
- 検証: `npx tsc --noEmit` / `npm run lint` ともにクリーン。`npx vitest run` 415/415 緑
  （既存 413 + 新規 2）。ローカルの `npm run start` プレビューは今回は動いておらず port 3000 は
  空きだったため、そのまま e2e フルスイート実行——desktop 65/65・mobile 65/65
  （既存 64 + 新規 1、合計 130/130）で緑。検証後は `.next` を削除。

### 2026-09-11 「利用について」ページ（`/terms`）を現在の仕様に合わせて全面更新

- 「できる道『利用について』ページ更新指示書」（全文の指示書）を受けて対応。
  `src/app/terms/page.tsx` の本文を、見出し 1〜10 の構成（目的／公開される経験について／
  自動的な取得・大量取得の禁止／AI・機械学習目的での利用禁止／できる道自身の AI について／
  AI 等により作成された仮データについて／個人情報・プライバシーについて／健康・医療に関する
  注意／投稿・公開内容について／できる道の考え方）に全面更新。詳細は `docs/spec.md` §5.11。
  URL・ヘッダー/フッター/文字サイズ変更 UI・デザイントークンは変更なし。旧ページにあった
  「画像等」という、投稿機能に実在しない表現を削除し、実際に公開されるデータ（経験・文章等）
  を中心とした表現にした。重要な禁止事項（3. 大量取得禁止／9. 掲載できない内容）は
  `Callout`（warn、既存コンポーネント）で視覚的に強調しつつ、文言自体でも意味が伝わる形にした
  （色だけに頼らない）。
- **指示書との食い違いをユーザーに確認して解決した点**: 指示書 §6「AI 等により作成された仮データ
  について」は原文で「仮データであることが利用者に分かる形で表示する」としていたが、現在の実装は
  2026-09-11 の別指示（「AI作成データの表示ルール追加」、`docs/spec.md` §5.10）により、公開された
  仮データを検索結果・経験カード・経験詳細で**通常の経験とまったく同じ見た目**にし、「サンプル」
  「仮データ」等の表示を一切出さない、という意図的な仕様になっている。指示書どおりの文言に
  すると実際の画面と矛盾するため、AskUserQuestion でユーザーに確認し、「現在の実装に合わせて
  書く（コード変更なし）」を選択（指示書 §7 の「実装前後で既存コードを確認し、実際の仕様と
  ページ記載に矛盾がないことを優先する」という方針とも合致）。ページの文言は「動作確認のために
  仮データを作成することがある」「他の経験と同じ公開ルールを経る」「実在の利用者の体験として
  案内しない」とだけ書き、画面上で見分けられるとは書いていない。
- ページの索引可否（`robots.ts` / `sitemap.ts` / `middleware.ts` の `robotsTagFor`）は今回変更
  していない（指示書は「ページ自体は検索エンジンに表示されても問題ない公開情報として扱う」と
  述べているだけで、実際に索引させる設定変更までは求めていないため。範囲外の判断）。
- **テスト**: 既存の `tests/e2e/a11y.spec.ts`「利用について」（h1 の可視性 + axe-core の
  serious/critical 違反ゼロ）がそのまま新しい構成に対しても通ることを確認。新しい `Callout` の
  ネストした `<ul>` を含め、a11y 違反なし。他に `/terms` の文言を厳密に検証するテストは無かった
  （grep で確認済み）ため、新規テストは追加していない。
- 検証: `npx tsc --noEmit` / `npm run lint` ともにクリーン。`npx vitest run` 415/415 緑
  （ページ文言のみの変更のため無影響）。port 3000 は空きだったため停止操作なしで e2e フルスイート
  実行——desktop 65/65・mobile 65/65（合計 130/130、`a11y.spec.ts` の `/terms` テストを含む）で
  緑。検証後は `.next` を削除。

### 2026-09-12 審査待ち登録の管理者通知メール

- **要件**: 新規登録が「審査待ち」になったことを管理者へメールで知らせる。登録データの保存を
  最優先とし、メール送信の成否で登録処理を失敗扱いにしない。VPS 自体をメールサーバーにせず、
  外部サービスの API を叩く方式。
- **既存の「審査待ち」をそのまま使った**: 新しいステータスは追加していない。既存の
  `attempts.moderation_status = pending`（`isPublished: true` の投稿が AI 判定で ng/unknown の
  ときに入る運営レビュー待ち。§5 のモデレーション設計、`docs/spec.md` の該当箇所）をそのまま
  「審査待ち」として扱う。管理画面の未審査件数表示（`dashboardStats().pendingActive` /
  `/admin/moderation`）も既存のまま流用し、メール通知はその「気づくための補助」という位置づけ
  （指示書 §8・§13 の設計方針どおり）。
- **メール送信サービスは Resend を採用**: SendGrid / SES と比較し、HTTP API 1 本で送れて
  SDK 追加が不要（`fetch` で完結）な点を優先した。`docs/deployment.md` の VPS 手順は
  「`npm ci` は package-lock 変更時のみ・全消し厳禁」という制約があり、新規依存を増やすと
  デプロイ手順が複雑になるため、SDK を入れない選択をした。実装は `src/lib/mail.ts`
  （`sendAdminMail`、Resend の `POST https://api.resend.com/emails` を叩くだけ）。
  環境変数 `MAIL_PROVIDER_API_KEY` / `ADMIN_NOTIFICATION_EMAIL` / `MAIL_FROM_ADDRESS`
  が 3 つとも揃わない限り送信しない（`env.mail.configured`）。API キーはサーバー側 (`src/lib/env.ts`)
  でのみ参照し、クライアント・公開 API レスポンスには一切出さない。
- **通知のトリガーとフロー制御は `src/lib/admin-notify.ts` の `notifyAdminOfNewPending`**:
  - 投稿 (`Attempt`) が新規に `moderationStatus: pending` になったタイミングで呼ぶ。呼び出し元は
    3 箇所: `src/lib/moderation.ts` の `applyModerationOnPublish`（通常の投稿 API で公開しようと
    して AI が ng/unknown と判定したとき）と `src/lib/quick-submit.ts` の `createQuickSubmission`
    （SNS からの匿名簡易登録 `/try`。既存仕様どおり AI 判定に関係なく必ず pending で作るため、
    常に通知する）。
  - **二重送信対策**: 新カラム `attempts.pending_notified_at`（migration
    `20260912003800_add_attempt_pending_notified_at`）を使い、
    `updateMany({ where: { id, moderationStatus: "pending", pendingNotifiedAt: null }, data: { pendingNotifiedAt: now } })`
    という条件付き UPDATE で「送信権」を確定させる。影響行数が 0 なら「既に通知済み」または
    「もう pending ではない」ので何もしない。これで API のリトライ・同時呼び出しに対しても
    確実に 1 回だけ送信される（別テーブルのロックや排他処理を足さずに Postgres の行更新だけで
    済ませた）。
  - 管理者が承認・却下すると（`POST /api/admin/moderation/{attemptId}`）`pendingNotifiedAt` を
    `null` に戻す。本人が編集して再審査に回り、再び pending になったときは改めて通知される
    （「同じ登録に何度も送らない」であって「その投稿が二度と通知されない」ではない、という
    解釈）。
  - メール送信自体の成否は `notifyAdminOfNewPending` の中で完結させ、例外を上位（登録 API）へ
    投げない。未設定時は送らずに `status: "skipped"` としてログに残すだけ。
- **本文に登録内容を載せない**: 件名は固定文言「【できる道】新しい登録があります」。本文は
  状態・登録日時（`Asia/Tokyo`）・管理画面 URL (`${SITE_URL}/admin/moderation`) のみ。困りごとの
  内容・氏名等は一切含めない（指示書 §4・§7）。
- **ログ**: `console.log` で `{tag:"admin-notify", notification_type, registration_id, status,
  error_message?, sent_at}` の 1 行 JSON のみ（`access-log.ts` の構造化ログと同じ流儀）。
  本文・宛先・個人情報は出さない。永続テーブルは作らず、既存の `journalctl` 運用（本番は
  systemd）で足りる規模と判断した。
- **本番反映で必要なのはコードではなく運用手順**（AdSense・仮データと同じ構図）:
  1. Resend でアカウント作成 → 送信ドメイン (`dekirumichi.net`) の SPF/DKIM を Resend の案内どおり
     DNS に追加 → ドメイン認証
  2. Resend で API キーを発行
  3. 本番 `.env` に `MAIL_PROVIDER_API_KEY` / `ADMIN_NOTIFICATION_EMAIL`（管理者本人の受信用
     アドレス）/ `MAIL_FROM_ADDRESS`（認証済みドメインの送信元）を設定
  4. マイグレーション `20260912003800_add_attempt_pending_notified_at` を
     `docs/deployment.md` の手順どおり適用（`attempts` への `ADD COLUMN` のみで安全）
  5. 実際に登録して本番でメールが届くことを確認
- **テスト**: `tests/unit/mail.test.ts`（`fetch` をモックし、未設定時に送らない・Resend への
  リクエスト形状・API キーがボディ/URL に漏れない・HTTP エラー/ネットワークエラーで例外を
  投げず `ok:false` を返す、を検証）。`tests/integration/admin-notify.test.ts`（実 DB で:
  公開 API 経由で pending になると通知される・同じ投稿への多重呼び出しは 1 回だけ送信・承認後に
  再度 pending に戻ると再通知される・簡易登録は必ず通知される・メール送信失敗でも登録データは
  残り `status:"failed"` としてログに残る・メール未設定でも登録は成功し `status:"skipped"` で
  ログに残る）。既存の `moderation.flow.test.ts` / `quick-experiences.api.test.ts` 等は無変更で
  426/426 緑（新規 11 件含む）、`tsc --noEmit` / `npm run lint` ともにクリーン。dev サーバーが
  起動中だったため `next build` / e2e は実行していない（`.next` 競合を避けるため。CLAUDE.md の
  注意事項どおり）。

### 2026-09-20 検索エンジン露出方針の改定：経験詳細ページも index 対象に
- 変更前: 索引に載せるのはトップページ `/` だけ（2026-09-10 決定）。他の公開ページはすべて `noindex`。
- 変更後: トップ `/` に加え、**公開・承認済みの経験詳細 `/experiences/[id]` も index, follow**にする
  （ユーザー要望）。検索一覧 `/experiences`・タグ絞り込み・`/experiences/paths`（道の見える化）
  などの一覧系ページは対象外のまま `noindex, follow`（変更なし）。
- 実装:
  - `src/middleware.ts`: `robotsTagFor` に `EXPERIENCE_DETAIL_PATH`
    (`/^\/experiences\/(?!paths(?:\/|$))[^/]+\/?$/`) を追加。`/experiences/:id` だけ
    `index, follow` にし、`/experiences`・`/experiences/paths` は既存どおり `noindex, follow`。
  - `src/app/experiences/[id]/page.tsx`: `generateMetadata` に `robots: { index: true, follow: true }`
    を追加してルート layout の既定 (`noindex`) を上書き。`getExperience` は常に
    `PUBLIC_ATTEMPT_WHERE`（`isPublished && approved`）でしか行を返さないため、非公開・審査中の
    Attempt は 404 経路（`robots` 上書きなし＝既定の `noindex` のまま）に落ちる。index 対象になるのは
    公開・承認済みのものだけ。
  - `src/app/sitemap.ts`: `PUBLIC_ATTEMPT_WHERE` で公開 Attempt を取得し、`/experiences/{id}` を
    `lastModified: updatedAt` 付きで列挙（`changeFrequency: monthly`, `priority: 0.5`）。トップは
    従来どおり `priority: 1`。`export const revalidate = 3600` で 1 時間キャッシュ（毎リクエスト
    DB を叩かない）。件数の上限・ページ分割（Next.js の `generateSitemaps`）は現状の件数では
    不要と判断（要件化するのは実運用で 50,000 件に近づいてから）。
- AI クローラー全体不可（`robots.txt` の `Disallow: /`）は変更なし。今回の変更は一般検索エンジンの
  index 可否のみに影響する。
- ドキュメント: `docs/spec.md` §8「検索エンジンへの露出」「管理機能の露出低減」の記述を新方針に
  合わせて更新。
- テスト: 既存 426 件は無変更で緑（ロジック変更は `robotsTagFor`（非公開関数）と `generateMetadata`
  ／`sitemap()` のみで、既存テストが直接カバーしていた箇所ではない。新規テストは追加していない）。
- 検証: ローカルの `localhost:3000` は `npm run start`（`next start`、`.next` は 2026-09-16 ビルド）で
  動いており、今回のソース変更を実機反映するには再ビルド・再起動が必要（未実施。実行中のプロセスの
  `.next` を上書きする形になるため、CLAUDE.md の `.next` 競合の注意に従いユーザー確認前には行わない）。
  ロジックは `vitest run`（426/426 緑）と正規表現・コードレビューで確認。

### 2026-09-23 トップページ「気づきの入口」変更指示書 v1
- 目的: トップページの入口を「できなくなったと自覚している人」だけでなく、「前はできていたが
  最近やりにくくなった」ことに本人が気づいていない人にも開くため、ファーストビューの見出し・
  検索導線の文言を変更し、気づきを促す小さなチップとカードを追加した。気づく → 探す →
  誰かの経験を見る → 試す → 結果を残す → 次の一歩へ、という流れ自体は変更していない。
- 実装:
  - `src/components/search-box.tsx`（hero サイズのみ）: 見出しを「何ができなくて困っています
    か？」→「『前はできてたのに』と思うこと、ありませんか？」に、補足文・入力欄ラベル・
    placeholder も気づきの文脈に合わせて更新。「病名は必要ありません」の安心文言は残した。
    compact サイズ（`/experiences` のフォーム等）の文言は変更していない。
  - `src/lib/constants.ts`: `NOTICE_CHANGE_PROMPTS`（変化パターンのチップ 5 つ）と
    `NOTICE_CARDS`（日常の小さな変化の例カード 4 つ、各カードに検索クエリを 1 つ紐付け）を追加。
    既存の `SEARCH_EXAMPLES` は新しい文脈と矛盾しないため変更していない。
  - `src/app/page.tsx`: ヒーロー直後・8 枚コミック（`StoryStrip`）の前に「こんな変化、
    ありませんか？」チップ列と「これも、できなくなったことかも」カード 4 枚を追加。どちらも
    タップで `/experiences?q=<文言>`（AI アシスト無し＝通常のキーワード検索）へ遷移する。
  - `StoryStrip`（8 枚コミック、`src/components/story-strip.tsx`）は**変更していない**。画像に
    テキストが焼き込まれており「加工・差し替え・順番変更をしない」という既存の制約があること、
    既存の流れ（気づく→探す→試す→残す）とすでに整合していたことから、イラストの差し替えまでは
    今回のスコープに含めなかった。
- データ構造・検索 API・Road/Attempt の基本構造・ログイン方式は変更していない。
- 検証: `tsc --noEmit` エラーなし。ローカル DB に直接 `ILIKE` 相当のクエリを投げ、新カードの
  検索語のうち実データに一致するものが無いこと（「靴下」「ペットボトル」「クッション」は 0 件、
  「ボタン」「料理」はヒットする）を確認した。これは検索処理自体の不具合ではなく、ダミーデータ
  中心のローカル DB にその語を含む記録が無いだけ。ブラウザでの実見た目確認は未実施。
- **取り消し（同日）**: この直後に受け取った「Cloud Code UI・入力フォーム改善指示書 v2」§3-1 が
  「トップページの中心となる質問『何ができなくて困っていますか？』は変更しない」と明記していたため、
  ユーザー確認のうえ本変更（見出し・補足文・入力欄ラベル・placeholder・気づきチップ・気づきカード）
  はすべて元に戻した。詳細は次の「Cloud Code UI・入力フォーム改善指示書 v2」の記録を参照。

### 2026-09-23 記録を編集画面 入力項目簡略化
- 目的: 「記録を編集」（`/me/roads/[roadId]/attempts/[attemptId]/edit`）および新規記録
  （`/me/roads/[roadId]/attempts/new`）で共有している `AttemptForm` の入力負担を減らし、
  「何を試した？→どうなった？→何か気づいた？」の最低限の流れで記録できるようにした。
  データ構造（`method`/`result`/`triedAt`/`memo`/`isPublished`/`nextAction`／タグ）は変更していない。
- 画面から削除した入力（DB/API のカラム・スキーマ自体は変更なし）:
  - 音声入力（`VoiceInputButton`。テキスト入力のみに絞る）
  - 「次の一歩」セクション（`nextAction`）— Road 側の `nextAction` と役割が重なるため
  - 「試した時期」（`triedAt`）— 記録の必須条件ではなく、後から追加できるため
  - タグ入力欄 — ユーザーにタグを考えさせず、将来のシステム／AI 候補生成に寄せる方針のため
    （`initialTags` プロップと `syncTags()` 呼び出しごと削除）
- 残した入力: 「試したこと」（見出しを「どんな方法を試しましたか？」に変更）・「結果」（5 分類、
  無変更）・「メモ・気づき（任意）」（見出し・説明・placeholder を更新、最大 4000 文字は維持）・
  「公開設定」（このあと同日の v2 指示書でチェックボックス文言を変更。次項参照）。編集時の保存
  ボタンラベルを「変更を保存」→「保存する」に変更（新規作成時の「記録する」は変更していない）。
- **既存データを壊さない実装**: `AttemptForm` の保存ペイロードから `triedAt`/`nextAction`/タグの
  キー自体を外した（`null` を明示送信しない）。`PATCH /api/v1/attempts/[attemptId]`
  （`src/app/api/v1/attempts/[attemptId]/route.ts`）は元々 `input.field !== undefined` のときだけ
  該当カラムを更新する部分更新なので、UI から集めなくなった項目は編集時に既存値がそのまま残る。
  新規作成時も同項目はスキーマ上 optional のため、未送信で問題なく作成できる。
- 経験検索・公開／非公開の判定（`PUBLIC_ATTEMPT_WHERE`）・結果 5 分類・失敗記録を消さない方針は
  変更していない。
- ドキュメント: `docs/spec.md` §4 画面一覧の該当行（`attempts/new` / `attempts/[attemptId]/edit`）と
  §5.1 を今回の項目構成に合わせて更新。
- 検証: `tsc --noEmit` エラーなし。既存データ（DB 上の `triedAt`/`nextAction`/タグを持つレコード）
  が編集後も保持されることはコードレビュー（PATCH ハンドラの部分更新ロジック）で確認。ブラウザでの
  実見た目確認・`vitest`/e2e は未実施（作業時、ローカル `next-server` の状態が不安定だったため）。

### 2026-09-23〜24 Cloud Code UI・入力フォーム改善指示書 v2
- 目的: 「できる道」の思想・データ構造・API・既存機能を壊さず、トップページと入力フォームの
  分かりやすさを改善する。大幅な作り直しではなく、必要最小限のUI・文言変更として実装する
  （AI検索新規実装・高度なレコメンド・SNS機能・大幅なDB/API/画面再設計などは今回行わない）。
- **v1（同日先に実装した「トップページ変更指示書 v1」）との矛盾をユーザーに確認**:
  1. トップページの見出し「何ができなくて困っていますか？」— v2 §3-1 は「これは変更しない」と
     明記。v1 で変更済みだったため、**ユーザー確認のうえ元の見出し・文言・気づきチップ/カードを
     すべて削除してロールバック**（`src/components/search-box.tsx` / `src/app/page.tsx` /
     `src/lib/constants.ts` から `NOTICE_CHANGE_PROMPTS` / `NOTICE_CARDS` を削除）。
  2. Attempt の公開設定チェックボックス文言 — v1 は「この記録を『経験』として公開する」を維持、
     v2 §13 は「この経験を公開する」を基本とする。**ユーザー確認のうえ v2 の文言を採用**。
  上記以外は v1・v2 間に矛盾なし（v1 のトップページ以外の変更＝記録を編集画面の入力項目簡略化は
  v2 の方針とも整合するためそのまま維持）。
- 実装:
  - `src/components/search-box.tsx`: 見出し・補足文・入力欄ラベル・placeholder を元の文言
    （「何ができなくて困っていますか？」「あなたの困りごと」等）に戻した。
  - `src/app/page.tsx` / `src/lib/constants.ts`: 「こんな変化、ありませんか？」チップと
    「これも、できなくなったことかも」カード、および裏付けの定数 `NOTICE_CHANGE_PROMPTS` /
    `NOTICE_CARDS` を削除。
  - `src/components/attempt-form.tsx`（④ 公開設定）: チェックボックスの表示文言を「この記録を
    『経験』として公開する」→「**この経験を公開する**」に、説明文を v2 §14 の推奨文（「あなたの
    経験が、誰かの次の一歩になるかもしれません。成功した方法だけでなく、うまくいかなかった方法も、
    同じことで困っている人にとって大切な情報になります。」）をベースに、既存の実務的な補足
    （名前は非表示／あとから公開停止できる）を残して統合した。
  - `src/components/road-form.tsx`（「自分の道を作る」／v2 §5-10・§16）: 質問文言を自然な表現へ
    更新。「以前は何ができていましたか？」→「以前は、どうしていましたか？」、「何ができるように
    なりたいですか？」→「これから、何ができるようになりたいですか？」（+ hint「『完全にできる』
    ではなくても大丈夫です。」）、「困っている場面（任意）」→「どんな場面で困っていますか？」、
    「メモ（任意）」→「メモ・気づき」（+ hint を v2 の文言に更新）。「何ができなくなりましたか？」
    は v2 も同文言のため維持しつつ、hint から実態と食い違っていた「あとから変更できません」を削除
    （道の編集画面ではとっくに編集可能になっている。2026-09-11 の別指示で編集可否は既に修正済み
    だったが、作成画面側の hint 文言の更新が漏れていた）。入力順序（以前→できなくなった→やりたい
    →いつから→場面→メモ）は元から v2 §16 と一致していたため変更なし。音声入力は元々このフォームに
    あり、v2 §22「音声入力を利用できる箇所では維持」とも整合するためそのまま。
  - `src/components/road-edit-form.tsx` は対象外。v2 §4 は「自分の道を作る」（作成画面）のみを
    対象にしており、編集画面は別画面・別レイアウトとして元から確立していたため、スコープ外として
    変更していない（必要最小限の変更、の方針に沿う）。
- **意図的に実装しなかった項目（要判断のため保留）**:
  - v2 §8「いつ頃から難しくなりましたか？」の曖昧な時期選択肢（最近／半年くらい前／2024年頃など）。
    v2 自身が「`started_at` は DATE 型。曖昧な時期を選べるようにするなら DB/API との整合性を確認し、
    勝手に DB を変更しない」と釘を刺しており、実装するには「時期区分」用の新しいカラムなど設計判断
    が要る。今回は既存の正確な日付入力（`type="date"`、値があるときだけ「日付を消す」ボタン）の
    ままとし、UI・DB とも変更していない。着手する場合は改めてスキーマ案を提示する。
  - v2 §11「試したことを複数登録できることを分かりやすくする」: `/me/roads/[roadId]` の道詳細
    画面が、すでに `StepFlow`／`road-guide` の連結表示＋「試したことを記録」ボタン＋「小さなことでも、
    試したことと結果を残しておくと道になります」という文言で複数 Attempt の連続性を伝えている。
    v2 が例示する矢印つき図とほぼ同じ内容がすでに実装済みと判断し、新規の変更はしていない。
  - v2 §15「失敗の価値をUIに反映する」: `RESULT_META.failed` の description は既に
    「試したが、うまくいかなかった（これも大切な経験）」で、v2 の例（「この方法では改善しません
    でした」という事実ベースの記述）が意図する「失敗を隠さず、悪印象にもしない」を既に満たしている
    と判断。多くの画面でラベル文字列を直接参照しているため、リスクに見合う効果が薄いとみて変更を
    見送った。
- データ構造・検索 API・認証・Road/Attempt の基本構造は変更していない。
- **既存テストの追随**: `tests/unit/clear-field.test.tsx`／`tests/e2e/critical-flow.spec.ts`／
  `tests/e2e/road-create.spec.ts` に残っていた、変更前・変更後どちらか一方の文言に依存する
  セレクタ（ラベルテキスト・チェックボックス名）を、最終的な文言に合わせてすべて更新した。
- ドキュメント: `docs/spec.md` §4 画面一覧の `/` 行を元の説明に戻した。road-form・
  attempt-form の質問文言はもともと spec.md に一言一句引用されていなかったため、他の記述は
  変更不要と判断した。
- 検証: `tsc --noEmit` エラーなし。`npm run test`（vitest）426/426 緑（今回の文言変更で壊れた
  1 件を含め、テスト側を新しい文言に合わせて修正済み）。`npx playwright test` はローカルで未実行
  （CLAUDE.md の `.next` 競合の注意に従い、ユーザー確認なしに実行していない）。ブラウザでの実見た目
  確認も未実施。

### 2026-09-24 「経験を探す」ページ改善指示書 v1 — `notify-...` の原因調査とテストデータ汚染の一掃
- 目的: 検索結果カードに `notify-1789173667615...` のような内部的な文字列がタイトルとして
  表示される問題を修正する（指示書 §23「最優先」）。
- **調査結果（§22/§23）: UI・表示ロジックのバグではなかった。** `RoadCard`
  （`src/components/road-card.tsx`）のタイトルは `road.difficulty ?? road.goal ?? "困っていたこと"`
  で、ID へのフォールバックは無い。`notify-...` は **`road.difficulty`/`attempt.method` に実際に
  格納されていた文字列**で、原因は `tests/integration/admin-notify.test.ts` の「SNSからの簡易登録」
  テストケースだった。
  - `createQuickSubmission`（`src/lib/quick-submit.ts`）は匿名投稿の受け皿として **全テスト・全
    利用者で共有される 1 つの実ユーザー**（`ANON_SUBMITTER_SUB = "system:anonymous-submissions"`）
    を使う設計。このテストは `afterAll` で `googleSub` が MARK（`notify-<timestamp>`）で始まる
    User/AdminUser だけを消しており、共有の匿名ユーザーが所有する Road/Attempt はそのまま
    ローカル DB に残り続けていた（`tests/integration/quick-experiences.api.test.ts` は同じ状況を
    正しく後始末しており、`admin-notify.test.ts` だけが漏れていた）。
  - 残っていた `notify-...` Attempt は 9 件、うち 4 件は `moderationStatus: approved` で実際に
    公開検索に出る状態だった（残り 5 件は pending のまま。おそらく管理者が `/admin/moderation`
    でテスト由来と気づかず承認したもの）。
- **もっと大きな汚染を発見**: 調査を広げたところ、ローカル DB の「公開経験」データの大半が
  他の e2e テストの残骸だった。
  - `tests/e2e/branching-paths.spec.ts` の 2 テスト（`?mp=` ページ送り確認・ツリー分割確認）が
    `/api/test/login` → `POST /api/v1/roads` → `POST /api/v1/roads/{id}/attempts`
    （`isPublished: true`）を実アプリ API 経由で叩いて道を作るのに、**後始末が一切無かった**。
    `method` に `オオイホウホウ<timestamp>` / `ページ分割の方法 N` という目印文字列が入っており、
    調査時点でそれぞれ 4,850 件・2,328 件、DB 全 Attempt 9,856 件のうち 7,187 件（約73%）を占めていた。
  - さらに、e2e のモックログイン（`src/app/api/test/login/route.ts`）は作成する User の
    `googleSub` に必ず `e2e:` 接頭辞を付ける（本番では `E2E_TEST_LOGIN` を絶対に有効化しないため、
    本物の Google ログインでは絶対に出ない目印）。この接頭辞で数えたところ、User 3,417 件中
    3,411 件（99.8%）・Road 936 件中 775 件・Attempt 2,669 件中 2,492 件（うち公開中 2,344 件）が
    e2e 由来で、`branching-paths.spec.ts` 以外の複数の e2e 仕様にも後始末漏れが広く存在していた。
- **修正（コード）**:
  - `tests/integration/admin-notify.test.ts`: `afterAll` の先頭で
    `prisma.road.deleteMany({ where: { difficulty: { contains: MARK } } })` を追加。
    beforeAll で作る road（MARK を含む difficulty）と、匿名受け皿ユーザー経由で作る
    quick-submission の road を、所有ユーザーに関係なく確実に消す。
  - `tests/e2e/branching-paths.spec.ts`: 上記 2 テストの本体を `try/finally` で包み、
    `finally` で `page.request.delete(`/api/v1/roads/${road.id}`)` を呼ぶよう変更
    （`critical-flow.spec.ts` と同じパターン）。
- **データ削除（ユーザー確認のうえ実施。DB/API/テスト以外のコードは触っていない）**:
  1. `notify-...`／`オオイホウホウ...`／`ページ分割の方法 N` に一致する Road を特定して削除
     （397 Road・7,187 Attempt をカスケード削除）。
  2. 残った内訳を確認したところ、依然として大半が e2e 由来だったため、`googleSub` が `e2e:`
     で始まる User を一括削除（3,411 User・カスケードで Road 775 件・Attempt 2,492 件を削除）。
  3. 最終状態: User 6 件（`seed:taro`/`seed:hana`/`seed:mika` ＝正規のシードデータ、
     `system:anonymous-submissions`／`system:ai-seed-data` ＝システム用、実 Google アカウント 1 件）、
     Road 161 件、Attempt 177 件（うち公開中 47 件）。「経験を探す」の件数表示は、これで実データに
     近い数を反映するはずである。
- **本番への影響は無いと判断**: `/api/test/login` は `E2E_TEST_LOGIN=true` のときだけ有効
  （CLAUDE.md で本番設定を明示的に禁止）で、`admin-notify.test.ts` はローカル/CI 専用の統合テスト。
  本番 DB に対してこれらが実行された形跡はない。
- **残課題（今回は対応していない）**: `tests/e2e/` 配下で `deleteMany`/`request.delete` 等の
  後始末コードを一切持たないファイルが他に 9 本ある（`a11y` / `account` / `ads` / `permissions` /
  `quick-submit` / `road-create` / `road-edit` / `search-ai` / `search-restore`）。このうち
  `isPublished: true` を使っているのは `account.spec.ts` の 1 箇所のみで、これはアカウント削除の
  検証テストなので削除対象ユーザー自身が消える設計（実質後始末できている）。他は非公開データの
  作成にとどまるため「経験を探す」への汚染リスクは低いと見たが、User/Road テーブルが
  無期限に増え続ける点は変わらないため、必要なら改めて棚卸しする。
- 既存の RoadCard/MethodCard の表示ロジック・DB スキーマ・API は変更していない
  （§25「DB/APIを変更せずにUI・表示ロジックで解決する」を上回り、UI 変更すら不要だった）。
- 検証: `tsc --noEmit` エラーなし。`npm run test`（vitest）426/426 緑。データ削除後の件数を
  Prisma で直接確認（上記の最終状態）。ブラウザでの実見た目確認・`npx playwright test` は未実施。

### 2026-09-24 「自分の道」ページ改善指示書 v1 — localhost URL・テストデータの原因調査
- 目的: 「自分の道」（`/me`）に `http://localhost:3000/me/roads/.../attempts/new` という内部 URL や
  「いいい」「aa」「あああ…」といったテストらしき文字列が表示される問題を調査する。
- **調査結果: コードのバグではなかった。** `src/app/me/page.tsx` のタイトルは
  `road.difficulty ?? "（無題の道）"` で ID/URL へのフォールバックは無く、`getMyRoads`/`getMyRoad`
  （`src/lib/queries.ts`）は DB クエリ自体が `userId` でスコープ済み、`assertRoadOwner`/
  `assertAttemptOwner`（`src/lib/authz.ts`）が API 層でも所有者チェックを行っている。公開状態も
  `pending`/`approved` 等の内部値ではなく「公開中」「確認中」「見送り」「非公開」に変換済み。
  エラー画面（`src/app/error.tsx`）もスタックトレース等を出さない安全な文言のみ。
- **実データを直接確認**: 本番相当のユーザーアカウント（`googleSub: "110582840814252892801"`、
  表示名「天谷正史」＝このプロジェクトの開発者本人の実アカウント）配下の Road を調べたところ、
  4 件とも明らかな動作確認用の入力だった。
  - `difficulty: "何ができなくなりましたか？"` / `goal: "何ができるようになりたいですか？"`
    （フォームの質問文そのものを試しに入力したもの）、その Attempt の一つに
    `method: "http://localhost:3000/me/roads/<このroadId>/attempts/new"`
    （作成日 2026-09-09。ブラウザの URL を誤ってそのまま貼り付けたと見られる）。
  - `difficulty: "あああ"` / `"aa"` / `"いいい"` と、対応する `method: "いいいいい…"` /
    `"ああああ…"` / `"bb"` / `"おおお"` など。うち 1 件（`difficulty: "いいい"`）は
    2026-09-23 10:59 作成で、同日のこのセッション内で「いいい」を検索語として動作確認した直後に
    作られたもの（本人が実際に手を動かして試した記録）。
  - つまりテストの自動実行が残した汚染ではなく、**開発者本人が自分の実アカウントで手動確認した
    際の入力**だった。
- 対応: コード変更は無し。ユーザー（アカウント本人）確認のうえ、上記 4 Road・Attempt 6 件を
  `prisma.road.deleteMany`（カスケードで Attempt も削除）で削除。削除後、このユーザーの Road は
  0 件。
- 変更していないもの: Road/Attempt/公開設定/認証・権限の設計、DB スキーマ、API。
- 検証: `npm run test`（vitest）426/426 緑。削除後の件数を Prisma で直接確認。ブラウザでの実見た目
  確認・`npx playwright test` は未実施。

### 2026-09-24 管理者「経験の詳細」改善指示書 v1 — 「AI：判定できず」の原因調査と結果表示追加
- 目的: 管理者の経験詳細画面で AI 判定が常に「判定できず」になる原因を調べる／「試したこと」に
  加えて「結果」を直接表示する。
- **「AI：判定できず」は既知の仕様どおりの挙動であり、バグではなかった。**
  `src/lib/ai/moderation.ts` の `runModeration`（14 行目付近）は
  `if (!env.ai.configured) return FALLBACK;` で、`env.ai.configured`
  （`src/lib/env.ts`）は `Boolean(process.env.ANTHROPIC_API_KEY)`。このローカル環境の `.env` に
  `ANTHROPIC_API_KEY` が設定されていないため、AI を一切呼ばずに即座に
  `{ verdict: "unknown", reason: "AIチェックを実行できませんでした。運営が確認します。" }`
  を返している。「AI でもう一度チェック」ボタン →
  `POST /api/admin/posts/{id}/recheck`（`src/app/api/admin/posts/[attemptId]/recheck/route.ts`）
  → `moderateAttemptContent` → DB 保存 → 画面反映、という経路自体は正常に動作しており、
  途中でエラーが握りつぶされているわけでもない。
  - **この挙動は既にドキュメント化済み**（指示書 §4 ケースD「AI判定自体が現在利用できない仕様」に
    該当）: `docs/admin-manual.md`（トラブルシュート表）に「すべての新規公開が『確認待ち』に
    なってしまう→ `ANTHROPIC_API_KEY` 未設定の可能性。安全側で全件『確認待ち』になる仕様」、
    `docs/spec.md`（環境変数一覧）にも同旨の記載が既にある。CLAUDE.md の「仮データ」節にある
    「未設定でも決定的スタブで動く」（生成 AI 機能）とは異なり、**モデレーションには決定的スタブが
    無く、キー未設定時は常に `unknown`（＝安全側で必ず人間のレビューに回す）という設計**。
  - 指示書の「勝手に別仕様へ変更しない」に従い、スタブ判定やキー未設定時の自動承認などは
    追加していない。
- **修正した点（UIのみ、1箇所）**: `src/app/admin/posts/[attemptId]/page.tsx` の「経験の内容」に
  「結果」を追加（「試したこと」の直後）。値は `RESULT_META[attempt.result].label`
  （`src/lib/constants.ts`、既存の 5 分類の日本語ラベル）をそのまま使い、AI 等での文章生成はしない。
  `attempt.result` は DB 上 NOT NULL のため、空表示になるケースは無い。
- 確認して変更しなかった項目: 公開/非公開/保留ボタンと状態遷移（`ModerationDecisionButtons`/
  `PostAdminControls`）、道の文脈、操作ログ、管理者権限チェック（ページは `requireAdmin()`、
  moderate/status/recheck の 3 API はいずれも `requireAdminApi()` をサーバー側で必須にしている。
  フロントの表示制御だけに依存していない）、AI API キーはクライアント・ログに一切出ていない
  （`grep` で確認）。
- DB/API は変更していない。
- 検証: `tsc --noEmit` エラーなし。`npm run test`（vitest）426/426 緑。実際に `ANTHROPIC_API_KEY`
  を設定して AI 判定が `ok`/`ng` を返すところまでは確認していない（本セッションに実キーが無いため）。
  ブラウザでの実見た目確認・`npx playwright test` も未実施。

### 2026-09-24 管理画面 UI表示・カラー統一指示書 v1
- 目的: 管理画面（ダッシュボード／経験を確認／経験の詳細／公開されている経験／仮データ管理／
  操作ログ）で色や背景の使い方に統一性が無かったのを、「同じ意味には同じ色」という意味ベースの
  セマンティックカラーに揃える。カード本体の色は変えず、バッジ・ボタンだけで状態を示す方針。
- **見つかった不統一（実装確認して洗い出した）**:
  1. `StatusBadge`（`post-card.tsx`、moderationStatus のバッジ）: `approved`（公開中）が
     `--color-accent`（コーラル/オレンジ、トークンの意図は「アクセント・強調」であって
     「成功」ではない）で表示されていた。`rejected`（公開しない）は `--color-danger`（赤）で、
     エラーでないものを赤で表示していた。
  2. `ModerationDecisionButtons`/`PostAdminControls`（`admin-actions.tsx`）: 「公開する」
     「やっぱり公開する」ボタンが `--color-accent` 系、「公開しない」「公開を停止」ボタンが
     `--color-danger`（赤）だった。
  3. `SeedRowActions`（`seed-data-actions.tsx`）: `admin-actions.tsx` とは別に、ほぼ同じ
     `BTN`/`BTN_PRIMARY`/`BTN_DANGER`/`BTN_PLAIN` を独自に再実装しており、「公開」ボタンの色は
     同じく `--color-accent`、かつサイズが `admin-actions.tsx` 側（`px-3 py-1.5 text-sm`）と
     違っていた（`px-3 py-1 text-xs`）。
  4. `/admin/seed-data` の `StateBadge`（`PublishState` ベース）も `published` に
     `--color-accent` を使い、`post-card.tsx` の `StatusBadge` と別実装（色ロジック重複）。
     ラベルも `reviewing` が「確認中」で、`post-card.tsx`／`admin/posts` の「確認待ち」
     （`moderationStatus="pending"`）と表記が割れていた。
  5. `/admin`（ダッシュボード）の「確認が必要なもの」アラート枠も `--color-accent` 系。
  6. `AdminPostCard` の「結果」は `RESULT_LABEL`（`post-card.tsx` 内の独自コピー、
     `src/lib/constants.ts` の `RESULT_META` と同じ内容を重複定義）をプレーンテキストで表示する
     だけで、色もアイコンも無かった。経験詳細（`[attemptId]/page.tsx`）の「結果」表示（今回の
     直前の指示書で追加）も同様にプレーンテキストだった。
- **トークン追加（`src/styles/tokens.css`）**: `--color-status-success`/`-warning`/`-neutral`/
  `-danger`（+ 各 `-soft`）を追加。success/neutral/danger は既存の `--color-primary`/
  `--color-neutral`/`--color-danger` をそのまま意味づけしたエイリアスで新しい色は増やしていない。
  warning（確認待ち・保留）だけ、既存パレットに無かったため `#7d6015`
  （text, `--color-status-warning-soft` `#faf3d9` 背景に対し実測コントラスト比 約5.3:1 で AA 適合）
  を新規追加。既存の warm/やわらかいトーンに合わせた、派手すぎないマスタード系アンバー。
  `--color-result-*`（public 側の結果 5 分類の色。`failed` は既にレンガ色 `#b4480e` で純粋な赤
  `--color-danger` `#b3261e` とは別トークン）は今回変更していない — この指示書は管理画面限定
  （§23）であり、public 側の Road/Attempt カード・検索結果・自分の道など既存デザインへの影響が
  大きいため、今回のスコープ外と判断した。管理画面の結果表示も同じ `--color-result-*`/
  `ResultBadge` をそのまま再利用しており（後述）、public/admin で結果の見た目は統一されている。
- **新規共有コンポーネント `src/components/admin/admin-ui.tsx`**: `AdminBadge`（tone:
  success/warning/neutral/danger を渡すだけで高さ・padding・角丸・文字サイズ・枠線・アイコンが
  揃う）と `ADMIN_BTN`（success/neutral/danger の 3 種、ボタンの色・サイズを 1 箇所に集約）を追加。
  既存の `Button`/`LinkButton`（`src/components/ui.tsx`）は塗りつぶしスタイルで管理画面の
  アウトラインスタイルとは見た目が異なるため、大規模な差し替えはせず、管理画面内で重複していた
  アウトラインボタン実装（上記②③）だけを 1 箇所に統合した（指示書 §25「大規模なコンポーネント
  再設計は今回行わない」）。
- **修正した色**:
  - `StatusBadge`: `pending`→warning、`approved`→success（緑系）、`rejected`→neutral
    （赤をやめた）。
  - `VerdictBadge`: `ok`→success、`ng`→danger（維持）、`unknown`→neutral
    （「システムエラー」に見えないグレー系のまま、バッジ化して枠・背景を統一）。
  - 「保留中」バッジ（`AdminPostCard`）→warning（確認待ちと同系統。指示書 §7）。
  - 「公開する」「やっぱり公開する」→success（緑）、「公開しない」「公開を停止」→neutral
    （危険操作ではないため赤をやめた。指示書 §8/§14）、「削除」は danger のまま。
  - `StateBadge`（seed-data）: `private`→neutral、`reviewing`→warning、`published`→success、
    `rejected`→neutral。ラベルも「確認中」→「確認待ち」に統一。
  - ダッシュボードの「確認が必要なもの」枠 → warning。
  - 結果表示（`AdminPostCard`・経験詳細）: 独自の `RESULT_LABEL` プレーンテキストをやめ、公開面と
    同じ `ResultBadge`（`src/components/ui.tsx`、`RESULT_META`＋アイコン＋色）を再利用。
    「うまくいかなかった」を含め、新しい色を追加していない（上記のとおり `--color-result-*` は
    今回のスコープ外）。
- 確認して変更しなかった項目: カード本体の背景・枠線（もともと全カード共通の白＋
  `--color-border`。状態で全面着色していなかった）、AI カテゴリタグの赤（個人情報・医療断定等の
  実際の違反フラグなので danger のまま維持が妥当と判断）、各種フォームのエラー表示の赤
  （`role="alert"` の本物のバリデーションエラー）。
- 変更していないもの: DB スキーマ、API、認証、公開フロー、AI モデレーションのロジック、
  Road/Attempt のデータ構造、結果 5 分類そのもの、レイアウト構成。
- 検証: `tsc --noEmit` エラーなし。`npm run test`（vitest）426/426 緑（クラス名の変更のみで、
  既存テストは表示テキスト・ロールベースのセレクタを使っており影響なし）。`tests/e2e/admin.spec.ts`
  はボタンのテキスト（「公開する」「公開しない」「保留」等）で操作しており、今回の色変更では
  文言を変えていないため影響しないはずだが、`npx playwright test` 自体は未実行。ブラウザでの実見た目
  確認・コントラスト比の実機検証（今回は手計算のみ）も未実施。

### 2026-09-24 詳細画面カード表示改善 指示書 v3
- 目的: 管理者の経験詳細（`/admin/posts/[attemptId]`）で「操作」「AI 判定」「経験の内容」
  「道の文脈」「この経験の操作ログ」の 5 セクションが、ページ背景とほぼ同化して見える問題を直す。
- 原因: 各 `<section>` が `border border-[var(--color-border)]` は持つが、背景色を一切
  指定していなかった。ページ本体 (`body`, `src/app/globals.css`) の背景は
  `--color-canvas`（`#fbf7f0`、淡いベージュ）で、管理画面レイアウト（`src/app/admin/layout.tsx`）
  もこれを上書きしていないため、枠線だけが薄いベージュの上に浮いている状態だった。
- 対応: 既存の共通スタイル `.card`（`src/app/globals.css`、`background: var(--color-surface)`
  ＋ `border: 1px solid var(--color-border)` ＋ `border-radius: var(--radius-lg)` ＋
  `box-shadow: var(--shadow-card)`）と同じ配色になるよう、5 セクションすべてに
  `bg-[var(--color-surface)]`（白）を追加した。`.card` クラス自体への置き換えはせず、既存の
  `rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4` はそのまま維持し
  背景色だけ足す最小差分にした（一覧側の `AdminPostCard` も影なしで白背景＋枠線のみなので、
  一覧・詳細で見た目のルールを合わせる意味でも影は追加していない。指示書 §6 は影を必須として
  いない）。
- 確認して変更しなかった項目: 角丸（既存の `--radius-lg` のまま、全カード共通）、カード間の余白
  （`space-y-6`、既存のまま）、カード内 padding（`p-4`、一覧画面の `AdminPostCard` と揃っている
  ため変更なし）、文字色（`--color-ink`/`--color-ink-muted` は canvas/surface/sunken いずれでも
  AA 準拠とトークン定義済みのため、白背景化にあたり変更不要と判断）、状態バッジ（前回の
  「管理画面 UI表示・カラー統一指示書 v1」で導入した `AdminBadge`/`ResultBadge` をそのまま使用、
  カード自体を状態色で塗りつぶす変更はしていない）。
- 変更していないもの: DB、API、認証、権限、AI モデレーション、公開・非公開・保留の処理、
  Road/Attempt/Result の構造、データ内容、検索ロジック、レイアウト構成（セクションの並び順・
  中身は変更していない）。
- 検証: `tsc --noEmit` エラーなし。`npm run test`（vitest）426/426 緑。ブラウザでの実見た目
  確認（PC/スマートフォン）・`npx playwright test` は未実施。

### 2026-09-24 ドキュメント全体の矛盾チェック
- 目的: ユーザーから `docs/api.md`／`docs/spec.md` の個別の矛盾を2件指摘され修正した流れで、
  「資料の矛盾ないかチェックして」との依頼を受け、`spec.md`/`api.md`/`admin-manual.md`/
  `deployment.md`/`CLAUDE.md` を通読し、ドキュメント間・ドキュメント内・ドキュメント対実装の
  矛盾を洗い出した。
- **見つけて修正したもの**:
  1. `spec.md` ヘッダーの「最終更新: 2026-09-11」— 本文には 2026-09-23 の変更が既に反映されて
     いたため実態と不一致。今回の更新日 2026-09-24 に更新。
  2. `spec.md` §4 `/admin` の説明に「→『管理メニュー（2×2・4 項目）』」が残っていた —
     2026-09-10 の決定記録（本ファイル「管理メニューを上部ナビに一本化」）で
     **完全に削除済み**の機能。現在の `admin-nav.tsx` 自身のコメントも「ダッシュボード下部に
     『管理メニュー』を別途置かない」と明記しており、`admin-manual.md` は既に正しく追随していた
     （`spec.md` だけ取り残されていた）。該当行を削除し、実際のナビ構成の説明に置き換えた。
  3. `spec.md` §7「公開 GET のガード」の `X-Robots-Tag` 説明が「その他の公開ページは
     noindex,follow」とだけ書いており、`/experiences/[id]` の `index,follow` 例外
     （2026-09-20 改定）が抜けていた。**同じ `spec.md` の §8 表（444行目）では正しく
     「トップ＋経験詳細」が index 対象と書かれており、同一文書内で自己矛盾していた**。
     `src/middleware.ts` の `EXPERIENCE_DETAIL_PATH` を確認し、§7 側の説明に例外を追記して解消。
  4. `api.md` の同種の記述（`X-Robots-Tag` の説明・`robots.txt`/`sitemap.xml` の説明が計 3 箇所）
     も同じく 2026-09-20 の改定前のまま止まっていた（sitemap は「トップのみ」と書いていたが、
     `src/app/sitemap.ts` 自身のコメントが「2026-09-20 検索エンジン露出方針の改定」で
     経験詳細も列挙するようになったと明記）。`spec.md` と同じ内容に揃えて修正。
  5. `spec.md` §9 技術スタック「本番ホスティング: 未確定（標準 PostgreSQL + Prisma なので
     移行容易）」— `CLAUDE.md`／`deployment.md` は既に「さくら VPS に既にデプロイ済み」と
     具体的な構成（systemd・nginx・ポート等）まで書いており、明確に矛盾していた。実態に合わせて
     書き換えた。
  6. `spec.md` §9「現況: Vitest 198 / Playwright 106」— 本セッションで `npm run test` を複数回
     実行し実測 426/426 を確認済みだったため、198 は大きく実態とずれていた。426 に更新。
     Playwright は今回実行していないため 106 を正しい数字で上書きはせず、「未実測・古い可能性が
     ある」と明記するにとどめた（確認していない数字を推測で書かない）。
  7. `deployment.md` §2（開発側 Mac の手順）が「ローカル確認（推奨）」として `npm run build` を
     無条件に勧めており、`CLAUDE.md` 冒頭で最も強く注意している「`npm run dev` 中に
     `npm run build` を走らせると `.next` の奪い合いで dev サーバーが壊れる」という注意点への
     言及が無かった。実務上ハマりやすい箇所のため、該当コマンドの直前にひとこと注記を追加した。
- **確認したが問題なしと判断したもの**: `CLAUDE.md` は今回の変更（トップページのロールバック・
  記録画面簡略化・管理画面カラー統一等）を反映済みで内部矛盾なし。`admin-manual.md` は
  用語（「確認待ち」表記の統一含む）・操作説明とも実装・他ドキュメントと整合していた。
  `implementation-decisions.md` 自体に残る「道は公開前提」等の古い言い回し（51/1058行目）は
  過去の決定を記録した履歴的な記述であり、現在の仕様を主張するものではないため書き換えていない
  （ユーザーへ前回報告済み）。
- 変更していないもの: DB、API、コードの挙動そのもの（すべてドキュメントの記述を実装に合わせる
  修正で、逆方向の変更はしていない）。
- 検証: 各修正はすべて実装（`src/middleware.ts`／`src/app/sitemap.ts`／`admin-nav.tsx`／
  `CLAUDE.md`／`deployment.md` の記載）と突き合わせてから反映した。ドキュメントのみの変更のため
  `tsc`/`npm run test` への影響なし（未実行）。

### 2026-09-24 ドキュメント通りの実装になっているか確認（逆方向の検証）
- 目的: 直前のドキュメント間チェックに続き、ユーザーから「ドキュメント通りの実装になっているか
  確認」の依頼を受け、`spec.md`/`api.md` の具体的な記述を実装と突き合わせて検証した（前回は
  ドキュメント同士・ドキュメント内の整合性、今回はドキュメント→実装の一致）。
- 照合した項目と結果（いずれも実装ファイルを直接確認）:
  - レート制限プリセット（書き込み 60/分・AI 15/分・簡易登録 6/分）: `src/lib/ratelimit.ts` /
    `src/app/api/v1/quick-experiences/route.ts` と一致。
  - いいね（自分の経験は 403・冪等・通知は未読1件まで・取り消しでは通知を消さない）:
    `src/lib/likes.ts` と一致。
  - 既読引き継ぎの上限（1〜500件）: `src/lib/validation.ts` の `MAX_LOCAL_READ_IDS`
    （`src/lib/constants.ts` で 500）と一致。
  - 広告の表示箇所（検索一覧・道詳細の2画面のみ）・非パーソナライズ配信フラグ: `AdSlot` の
    import 元ファイルと `adsense-unit.tsx` の `requestNonPersonalizedAds = 1` で一致確認。
  - `attempts` テーブルのカラム構成: `prisma/schema.prisma` の `Attempt` モデルと一致。
  - API サーフェス（§7 の一覧）: `src/app/api` 配下の全 `route.ts` を列挙し突き合わせ。
  - 環境変数一覧（§10）: `src/lib/env.ts` の `process.env.*`/`optional()` 呼び出しと
    `src/lib/access-log.ts`（`ACCESS_LOG_SALT`）/`src/lib/bot-guard.ts`（`BLOCKED_IPS`）を
    洗い出して突き合わせ。
  - 「利用について」ページの見出し構成（10項目）: `src/app/terms/page.tsx` の `<h2>` と
    一言一句一致。
- **見つけて修正したもの**: `spec.md` §7 の API 一覧表で「既読（本人）」行が
  `POST /attempts/{attemptId}/read` だけを載せ、実在し §5.6.1（既読引き継ぎ）の説明が前提とする
  `GET /me/reads`（エクスポート）と `POST /me/reads/merge`（再ログイン時の統合）が抜けていた
  （`api.md` 側には既に両方とも記載されていた＝`spec.md` の要約表だけが古い状態）。2 エンドポイント
  を追記して解消。
- 上記以外は今回照合した範囲では実装とドキュメントの不一致は見つからなかった。
- 変更していないもの: DB、API、コードの挙動そのもの。
- 検証: ドキュメントのみの変更（1 行追記）。`tsc`/`npm run test` への影響なし（未実行）。
- **未確認（今回のスコープ外）**: §4 画面一覧の細部（各画面の表示項目の網羅性）、§9 の
  Playwright 実行数、E2E 経由でしか踏めない挙動（実ブラウザでの見た目・axe-core の a11y 結果）。

### 2026-09-24 トップページ微修正指示（ファーストビューのタグライン変更）
- 目的: ファーストビューの説明コピーを「サイトが技術で解決する」という印象から、「誰かの経験が
  次の一歩につながる」という「できる道」の考え方が伝わる表現へ変更する。
- **指示書の「現在の文言」が実在しなかった**: 指示書は現在のコピーを
  「『できない』を、技術と経験で『できる』に変える。」としていたが、`git log --all -S` で
  全履歴を検索してもこの文字列は一度も存在していなかった。ファーストビューの実際のテキスト要素
  （h1「できる道」／タグライン「『できない』を終点にしない。」／`SearchBox` の見出し・補足文／
  レイアウト側の SEO 用 `description`）をすべて確認し、いずれも一致しないことをユーザーに報告した
  うえで、対象要素をユーザーに確認して特定した（対象＝タグライン）。
- 実装: `src/app/page.tsx` のタグラインを「『できない』を終点にしない。」→
  「『できなかった』を、誰かの経験から『次の一歩』へ。」に変更（1 行）。
  文字サイズ・フォント・余白・配置・背景画像・検索フォーム・8 枚のストーリー画像・その他の文言は
  変更していない。同じ文言を使う他ページ（`terms/page.tsx`・`layout.tsx` の SEO
  `description`・`site-footer.tsx`）は指示書の対象外のため変更していない。
- ついでに `src/components/admin/admin-ui.tsx` の未使用 import（`IconCircleDashed`。前回の
  「管理画面 UI表示・カラー統一指示書 v1」作業の取り残し）を削除し、`npm run lint` の警告を解消
  （今回の指示書 §7「lint/typecheck 等が...通る」に沿って `npm run lint` を実行して発見）。
- ドキュメント: `docs/spec.md` §1「キャッチ」の説明に、フッター/SEO`description`/`/terms` で
  使う共通キャッチコピー（変更なし）と、今回変更したファーストビュー独自のタグラインは別文言で
  ある旨を追記（ユーザーからの「ドキュメントの更新」依頼を受けて反映）。
- 変更していないもの: デザイン・レイアウト・色・フォント・画像・8 枚のストーリー・検索機能・
  経験データ・登録導線・API・DB・管理画面・SEO 設定・sitemap・他ページ。
- 検証: `npm run lint` 警告 0 件（上記の未使用 import 削除後）。`tsc --noEmit` エラーなし。
  `npm run test`（vitest）426/426 緑（この文言を参照するテストは無し）。ブラウザでの実見た目
  確認（PC/スマートフォンでの折り返し含む）は未実施。

### 2026-09-24 管理画面内のカード枠線を緑に統一（「従来の緑と太さにする」指示）
- 背景: 「管理画面 UI表示・カラー統一指示書 v1」（同日先に実施）では、管理画面のカード本体は
  ニュートラルな枠線（`--color-border`）のまま維持し、状態はバッジだけで示す方針にしていた。
  今回、ユーザーから「管理画面内のカードの枠線を、従来の緑と太さにする」と指示を受け、
  管理画面のカード枠線をニュートラルから緑へ変更した（バッジ・ボタンの色ルールは変更していない）。
- 「従来の緑」の解釈: `border-[var(--color-primary)]`（1px）は `RoadCard`／`MethodCard`／
  `attempt-form.tsx`・`road-edit-form.tsx` の `Section`／`road-form.tsx` の `fieldset`／
  `/me` のカードなど、**公開・本人ページ全体で一貫して使われている定番のカード枠線**だと判断し、
  そのまま同じクラスを管理画面にも適用した（新しい太さ・色を作っていない。この公開側の慣例に
  太さ違いのバリエーションは無いため、「太さ」は既定の 1px のまま）。
- 対象にしたもの（実際に内容を表示する「カード」）:
  - `AdminPostCard`（`src/components/admin/post-card.tsx`。経験確認キュー／全経験一覧のカード）
  - 経験詳細（`src/app/admin/posts/[attemptId]/page.tsx`）の 5 セクション（操作／AI判定／
    経験の内容／道の文脈／操作ログ）
  - ダッシュボード（`src/app/admin/page.tsx`）の `StatCard`／`RecentBlock`
  - 仮データ一覧（`src/app/admin/seed-data/page.tsx`）の各行カード
  - 仮データ生成（`src/components/admin/seed-data-generator.tsx`）の生成候補カード
  - 管理者ログイン（`src/app/admin/login/page.tsx`）のログインカード
- **対象外にしたもの**（「カード」ではなく別種の UI 要素と判断）: フォーム入力欄（検索ボックス・
  select・テキスト入力）、空状態メッセージ（例:「該当する経験がありません。」— 公開側の
  `EmptyState` コンポーネントも `.card`＝ニュートラル枠線のため踏襲）、フィルタ切り替えピル、
  `admin/moderation` の絞り込みパネルや `admin/page.tsx` の「確認が必要なもの」コールアウト
  （`--color-primary-tint` の背景＋ニュートラル枠線の組み合わせで、個別データを表示する
  「カード」ではなくパネル/コールアウト扱い）、`admin/audit` のログ一覧コンテナ、
  管理画面ヘッダーの下線。これらは今回「カード」の範囲外と判断し変更していない。範囲の解釈に
  ずれがあれば指摘してもらう前提。
- ついでに `npm run lint` を実行し、前回発生していなかった新規の警告が無いことを確認。
- 変更していないもの: バッジ・ボタンの色（前回の統一ルールのまま）、DB、API、認証、権限、
  結果 5 分類、レイアウト構成。
- 検証: `tsc --noEmit` エラーなし。`npm run lint` 警告 0 件。`npm run test`（vitest）426/426 緑。
  ブラウザでの実見た目確認は未実施。

### 2026-09-24 管理画面「Markdownから複数の試したことを持つ道」を登録できるようにする
- 目的: ChatGPT 等（サービス外・API課金なしの定額利用）で作った Markdown を管理画面へ貼り付け、
  1 つの道（Road）に複数の「試したこと」（Attempt）を、試した順番のまま仮データとして取り込める
  ようにする。既存の AI API 生成（1 Road=1 Attempt）は変更しない。
- **実装前調査で分かったこと（指示書 §18）**:
  - `Attempt` に並び順専用のカラムは無い。全画面で表示順は `triedAt ?? createdAt`
    （`sortAttemptsChronologically`、`src/lib/serializers.ts`）に統一されている。
  - 1 つの `$transaction` 内で `Attempt.create()` を連続実行した場合に `createdAt` が
    本当に単調増加するかを実際の開発 DB で検証（4 件連続作成→ミリ秒単位で 4 件とも異なる値）。
    これにより新しいカラムを足さずに Markdown の順番を保持できることを確認した。
  - `SeedDataDTO`／`serializeSeedRoad`／`publishSeedData`／`unpublishSeedData`／`updateSeedData`
    はすべて「Road は Attempt を 1 件だけ持つ」前提だった（`road.attempts[0]` 決め打ち）。
- **データ構造**（DB スキーマは変更していない。既存の `roads`/`attempts` テーブルのまま）:
  - `src/lib/validation.ts`: `seedDraftSchema`（従来の 1 Road=1 Attempt 平坦形式）を
    Road 部分 (`seedRoadFieldsSchema`) と Attempt 部分 (`seedAttemptFieldsSchema`) に分割し、
    `seedDraftSchema` はその合成として維持（既存の AI 生成フローの挙動・バリデーションは不変）。
    新たに `seedRoadWithAttemptsSchema`（Road + `attempts[]`、1〜30 件）、
    `seedMarkdownParseSchema`（`{ markdown }`）を追加。`seedCreateSchema` は `items`（従来形式）
    と `roads`（新形式）の両方を受けられるよう拡張（どちらか一方があればよい）。
  - `SeedDataDTO.attempt`（単数・nullable）を `attempts`（配列、時系列順）に置き換えた
    （`src/lib/admin/seed-data.ts`）。呼び出し側（一覧ページ・編集ページ）も合わせて更新。
- **Markdown パーサー** (`src/lib/admin/seed-markdown.ts`、新規、AI を呼ばない純粋関数):
  `#`＝道の区切り、`##`＝道の項目 or 「試したこと」の区切り（`試したこと` で始まる見出しはすべて
  1 Attempt として扱い、番号・空白の表記ゆれを許容）、`###`＝試したことの項目、という行ベースの
  見出し解析。結果は 5 分類の完全一致のみ許可し、不一致は
  「結果「xxx」は対応していません」という指示書 §15 の例文に沿ったエラーにする。想定外の見出しは
  無視せずエラーとして報告する（指示書 §14「安全に解析エラーとして扱う」）。HTML/script は一切
  解釈しない（見出し行以外はすべてプレーンテキストの本文として扱うだけ）。
  - **フィールドの折りたたみ（実装上の判断）**: Markdown の `### 試した理由` と
    `### 次につながったこと` には対応する DB カラムが無い（`previousAttemptId` は指示書 §7 の
    指示どおり復活させていない）。この 2 つと `### 結果の詳細` は、既存の「気づき」欄
    （`Attempt.memo` / フォーム上は「気づき」）へラベル付きでまとめて格納する
    （例:「詳細本文\n\n試した理由：…\n\n次につながったこと：…」）。新しいカラムは追加していない。
  - `tests/unit/seed-markdown.test.ts`（14 件）: 1/3/6 Attempt、複数 Road、結果 5 分類、不正な
    結果、方法欠落、困っていたこと欠落、試したこと0件、空Markdown、道の見出しなし、想定外の見出し、
    見出しの表記ゆれ、を検証。

  **追記（実装当日、実際にユーザーが ChatGPT で作った Markdown を試して発覚した不具合の修正）**:
  最初の実装は「`#`＝道、`##`＝道の項目/試したこと、`###`＝試したことの項目」と見出しレベルを
  固定していた。ところが実際に ChatGPT が出した Markdown は「# できる道 仮データ」という文書
  タイトルを一番外側に置き、道以下がそのぶん 1 段深くなっていた（`## 道1` → `### 困っていたこと`
  → `#### 方法`）。レベル固定の実装だとこれが解析エラーになり、指示書の例（`# 道1` 直下）でしか
  通らなかった。**絶対的な見出しレベルではなく、見出しの親子構造（ネスト）から意味を判定する方式に
  作り直した**: Markdown 全体をまず見出しレベルに応じた木構造にし、「困っていたこと」等の既知の
  道の項目名、または「試したこと」で始まる見出しを**直接の子に持つ見出し**を「道」と判定する
  （何段目でもよい）。これにより文書タイトルの有無に関わらず解析できるようになった。
  併せて、道と道の間に入りがちな Markdown の水平線（`---`/`***`/`___` のみの行）が、直前の項目の
  本文（特に「次に試したいこと」のような最後のフィールド）に紛れ込む不具合も見つけて修正した
  （本文行から水平線だけの行を除外するようにした）。回帰防止のため、ユーザーが貼った実データと
  同じネスト構造（文書タイトル→道→困っていたこと 等→試したこと→方法 等の 4 階層）を再現した
  テストを追加（14 件目）。`docs/admin-manual.md` §6.5 と Markdown取り込み画面のヘルプ文言・
  placeholder も「見出しの深さは自由」である旨に更新した。
- **保存**: `persistSeedDrafts`（1 Road=1 Attempt 専用）を `persistSeedRoads`
  （Road ごとに Attempt を 1 件ずつ順番に `create`。`createMany` は使わない＝順序保証のため）に
  置き換え、`POST /api/admin/seed-data` が `items`（従来形式→内部で 1 Attempt の Road に正規化）
  と `roads`（新形式）の両方をこの同じ関数に渡す（指示書 §13「既存の保存処理を再利用」）。
  新規エンドポイント `POST /api/admin/seed-data/parse-markdown`（指示書 §13 で明示的に許可された
  専用エンドポイント）は解析だけを行い、保存しない。
- **公開・非公開の単位（実装上の判断）**: `publishSeedData`/`unpublishSeedData` を、Road が持つ
  Attempt を**すべて同時に**切り替えるよう変更した（従来は `attempts[0]` だけ）。指示書 §12
  「公開は1件ずつ」の「1件」を Road 単位と解釈した — 1 つの道の試行錯誤の一部だけを公開すると
  途中で切れた物語になるため。既存の AI 生成データ（常に Attempt 1 件）への挙動変化は無い。
- **保存後の編集の制限（意図的に対応しなかった）**: `updateSeedData`（`PATCH
  /api/admin/seed-data/{roadId}`）と一覧の「編集」画面は、複数 Attempt を持つ道でも従来どおり
  先頭（時系列で最初）の Attempt しか編集できない。Markdown取り込みの確認・編集は保存前（parse
  直後、ブラウザの state 上）で完結させる設計のため（指示書 §9）、今回はここを拡張しなかった
  （指示書 §16「不要な全面改修はしない」）。他の Attempt が編集で消えたり上書きされたりすることは
  無い（対象外なだけ）。編集ページに「この画面では最初の1件だけ編集できます」という注記を追加した。
- **UI**:
  - `src/components/admin/seed-draft-fields.tsx`: 既存の `SeedDraftFields`（Road+Attempt 1 組）は
    そのまま維持しつつ、`SeedRoadFields`（Road だけ）と `SeedAttemptFields`（Attempt だけ）を
    新規に切り出した。AI 生成画面 (`seed-data-generator.tsx`) は無変更。
  - `src/components/admin/seed-markdown-importer.tsx`（新規）: 貼り付け→解析→（エラー表示 or
    確認・編集画面）→保存、のクライアントコンポーネント。確認・編集画面は道ごとに
    `SeedRoadFields` 1 回＋`SeedAttemptFields` を試したことの数だけ描画し、道・試したこと単位で
    外す／試したことを追加できる。
  - `src/app/admin/seed-data/import-markdown/page.tsx`（新規）と
    `src/app/admin/seed-data/page.tsx`（「＋ AIで生成」「＋ Markdownから取り込む」の 2 択に変更、
    一覧カードは `attempts` 配列から件数・先頭 3 件の方法を表示するよう更新）。
- 変更していないもの: `POST /api/admin/seed-data/generate`（AI 生成本体）のロジック、AI モデレーション、
  公開・非公開の基本ルール（判定は変わらず `PUBLIC_ATTEMPT_WHERE`）、一般ユーザーの投稿フロー、
  経験検索、認証・管理者権限、sitemap/SEO、DB スキーマ（カラム追加なし）。
- ドキュメント: `docs/spec.md` §4（画面一覧に `import-markdown` 行を追加）・§5.10（作り方が
  2 通りになった旨）・§7（API 一覧に `parse-markdown` を追加）、`docs/api.md`
  （仮データ節を `SeedDraft`/`SeedRoadDraft` 両方の説明に更新）、`docs/admin-manual.md` §6.5
  （方法A/方法Bの手順、公開・非公開が道単位である旨、保存後編集の制限）を更新。
- テスト: `tests/unit/seed-markdown.test.ts`（13 件、新規）、
  `tests/integration/seed-data-markdown.test.ts`（8 件、新規。parse-markdown の解析・エラー、
  複数 Attempt の保存・順序保持・非公開/pending、公開/非公開が全 Attempt に効くこと、削除で
  全 Attempt が消えること、複数 Road の一括取り込み、`items`/`roads` 混在保存）、
  `tests/integration/seed-data.test.ts`（既存 15 件、`attempt`→`attempts[0]` に合わせて 2 箇所
  修正のうえ確認）。
- 検証: `tsc --noEmit` エラーなし。`npm run lint` 警告 0 件。`npm run test`（vitest）447/447 緑
  （既存 426 ＋ 新規 21）。ブラウザでの実見た目確認・実際の ChatGPT 生成 Markdown での動作確認・
  `npx playwright test` は未実施（`.next` 競合を避けるためユーザー確認なしに実行していない）。

### 2026-09-24 仮データAI生成（スタブ）で「結果」が再生成のたびに同じ並びになる不具合を修正
- 報告: 「マークダウンで同じ内容で再作成すると前と同じ」→ 確認の結果、指しているのは Markdown
  取り込みではなく、`ANTHROPIC_API_KEY` 未設定時の決定的スタブ生成（`localStubDrafts`,
  `src/lib/ai/seed-data.ts`）で「同じテーマに対して『もう一度生成する』を押すと、困りごと・方法は
  変わるのに `result`（5分類: success/partial/no_change/failed/ongoing）だけ毎回同じ並びで
  返ってくる」こと（ユーザーへの確認質問で「結果が前と同じになる」と特定）。
- 原因: `stubDraftAt` 内で `result` を `ATTEMPT_RESULTS[seq % 5]` として決めており、`seq` には
  呼び出し元 (`localStubDrafts`) の `offset`（＝そのテーマでこれまでに生成済みの件数の累計）を
  そのまま使っていた。管理画面の件数選択肢 `COUNT_OPTIONS` は `[5, 10, 15, 20]` で、すべて
  `ATTEMPT_RESULTS.length`（5）の倍数のため、`offset` は常に 5 の倍数になり `offset % 5` は
  常に 0 になる。そのため再生成のたびに `success, partial, no_change, failed, ongoing, ...` の
  同一の並びが返っていた（`difficulty`/`method` は別のプール順回転ロジックで正しく変わっていたため
  気づきにくかった）。
- 修正: `result` の循環開始位置を、`offset` から独立した `resultShift` で決めるようにした。
  `round = Math.floor(offset / count)`（＝これが何回目の生成か）に、5 と互いに素な数 (2) を掛けて
  `% 5` することで、`offset` が 5 の倍数でも開始位置が実際にずれるようにした（5 回に 1 回だけ
  元の並びに戻るが、毎回同じにはならない）。`stubDraftAt` に `resultSeq` 引数を新設し、既存の
  `seq`（`previouslyAble` の付与パターンに使用）・`poolIndex`（困りごと・方法のプール選択）とは
  独立させた。
- 副作用（意図的）: 併せて `seq` に渡す値を `out.length` から `offset + step` に変更した
  （`previouslyAble` の「3件に1件」パターンが、再生成のたびに同じ位置に固定されず offset に応じて
  ずれるようになった。困りごと・方法・結果と同じ「offset で変わる」挙動に揃えた）。
- 検証: 一時テストで offset=0/10/20/30/40/50 の `result` 列を出力し、修正前はすべて同一列、
  修正後は 0/10/20/30/40 で異なり 50（＝5 round 目）で 0 と一致する（設計どおり）ことを確認した
  うえで一時テストは削除。回帰防止として `tests/unit/seed-data.test.ts` の「offset ローテーション」
  describe 内に、offset 0/10/20 で `result` 列が互いに一致しないことを確認する恒久テストを追加。
- 変更していないもの: `difficulty`/`method` のプール回転ロジック、Markdown 取り込み機能
  （`seed-markdown.ts`。今回の報告のきっかけになったが原因はこちらではなかった）、AI API 生成
  （`ANTHROPIC_API_KEY` 設定時）の経路。

  **追記（同日、`offset` だけを直接渡す単体テストでは検出できなかった実運用上の不具合を追加修正）**:
  上記の `resultShift` 修正を一度「直った」として報告した後、ユーザーから
  「再解析しても同じです」という再報告があった。`localStubDrafts` に `offset` を直接渡すテストは
  緑だったため、実際の画面のフロー（`seed-data-generator.tsx` の「もう一度生成する」）をそのまま
  再現するテストを新たに書いて原因を特定した。
  - 実際の画面は、毎回の生成候補をすべて `historyRef` に積み上げ、次回生成時に `exclude`
    （→ `generateSeedDrafts` の `existing`）として渡す。困りごと本文は語彙が多く重複しにくいが、
    **`method`（試した方法）は使い回しの言い回しが少数しかなく**、2〜3 回の再生成で
    `existing` に含まれる method とほぼ衝突するようになる。
  - `localStubDrafts` は `isDraftDuplicate` で method が重複した候補を `continue` でスキップするが、
    このとき「試行回数」を数える `step` はスキップ分も含めて進む一方、`resultSeq` の計算に
    `step` をそのまま使っていた。重複スキップが増えるほど、実際に採用されて `out` へ積まれる件数
    （`out.length`）と `step` がずれていき、`result` の巡回位置が壊れる。さらに `step` が
    `maxPool` に達すると「重複を許してでも件数を満たす」フォールバックループへ切り替わり、
    そちらは `step` を 0 から数え直すため、運が悪いタイミング（今回は3回目の再生成）で
    `resultShift` の効果が実質打ち消され、以前と同じ並びに戻って見えた。
  - 修正: `resultSeq` の基準を、スキップの影響を受ける `step` ではなく、**実際に `out` へ積まれた
    件数 (`out.length`)** に変更した（プールから困りごとを選ぶ `poolIndex`・`previouslyAble` の
    パターンに使う `seq` は今回の不具合と無関係のため据え置き、`offset + step` のまま）。
    これにより、重複スキップの多寡に関わらず、1 回の生成内では常に
    `success→partial→no_change→failed→ongoing→...` の連続した巡回になり、生成回数をまたいでは
    `resultShift` の分だけ開始位置がずれる、という当初意図した挙動になる。
  - 検証: 画面と同じ「生成のたびに履歴を積み上げて次回 exclude に渡す」フローを 5 回連続実行し、
    修正前は 3 回目が 1 回目と完全に同じ `result` 列になることを確認したうえで、修正後は
    5 回とも互いに異なることを確認。回帰防止として
    `tests/unit/seed-data.test.ts` に `generateSeedDrafts` を使ったこの実フロー相当のテストを追加
    （`offset` を直接指定するだけのテストでは再現しないバグだったため、あえて `generateSeedDrafts`
    経由・履歴累積ありで書いた）。
- 検証: `tsc --noEmit` エラーなし。`npm run lint` 警告 0 件。`npm run test`（vitest）450/450 緑
  （既存 447 ＋ 新規 3）。

### 2026-09-25 Markdown取り込み: 箇条書き形式の実データに対応 ＋ 道は1回1件までに制限
- 報告: ユーザーが実際に使う Markdown（1 道・3 試したこと、「自分でツメを切る」の例）を貼ったところ、
  既存のパーサーでは解析できなかった。
- 原因（フォーマットの違い、2 点）:
  1. 「試したこと」（番号なし）という見出しが、個々の「試したこと1」「試したこと2」…をまとめる
     **ラッパー**になっていた。既存実装は道の直接の子だけを Attempt として扱っていたため、
     ラッパー自身を（中身のない）1 件の Attempt として誤認識していた。
  2. Attempt の項目（方法・試した理由・結果・結果の詳細・次につながったこと）が、見出しではなく
     「- 方法：〜」のような**箇条書き**で書かれていた。既存実装は項目を見出しの子としてしか
     読めなかったため、項目が 1 つも認識されず「方法がありません」「結果がありません」エラーに
     なっていた。
- 修正 (`src/lib/admin/seed-markdown.ts`):
  - `collectAttemptLeaves`（新規）: 「試したこと」見出しの子にさらに「試したこと」見出しがあれば
    それをラッパーとみなして再帰的に潜り、実際の Attempt（末端）だけを集める（何段ラップされても
    よい。道の見出し判定 `findRoadNodes` と同じ「絶対レベルではなく親子構造で判定する」方針を踏襲）。
  - `parseBulletFields`（新規）: Attempt ノードが見出しの子を持たない場合、本文を
    「- ラベル：値」の箇条書きとして解析する（ラベルは既存の `ATTEMPT_FIELD_MAP` をそのまま流用。
    値が改行で折り返されている場合は直前の項目に連結。対応していないラベル・解釈できない行は
    見出し形式と同様にエラーとして報告し、無視して通さない）。
  - `parseAttemptNode` は、Attempt ノードが見出しの子を持つか (`node.children.length > 0`) で
    見出し形式・箇条書き形式を自動判定する（どちらの形式でも解析できる。既存の見出し形式のテストは
    無変更で緑のまま）。
- **追加の変更判断（ユーザー確認済み）**: 上記のフォーマット対応と合わせて、「道データは1件だけに
  する」という指示を確認したところ、「Markdown取り込み機能そのものを、1回の取り込みでは道を1件
  までしか受け付けないようにする」ことだった（複数道の一括取り込み機能を縮小する、の意図）。
  `parseSeedMarkdown` で `findRoadNodes` の結果が 2 件以上なら
  「Markdownで登録できる道は1件までです（見出しが○件見つかりました）。道ごとにMarkdownを分けて、
  1件ずつ取り込んでください。」というエラーを返し、確認・編集画面へは進ませないようにした。
  **保存 API 側（`POST /api/admin/seed-data` の `roads` 配列・`persistSeedRoads`）は変更していない**
  （複数道を一度に保存できる基盤自体は残す。制限したのは Markdown 解析の入口だけ）。
  UI のヘルプ文言・プレースホルダー（`seed-markdown-importer.tsx`）と
  `docs/admin-manual.md` §6.5・`docs/spec.md` §5.10・`docs/api.md`（仮データ節）にも、
  この制限と箇条書き対応を追記した。
- テスト: `tests/unit/seed-markdown.test.ts` に、ユーザーが実際に貼った Markdown と同じ構造
  （ラッパー見出し＋箇条書き）の解析テスト、箇条書き形式での「対応していない項目」エラーのテストを
  追加。既存の「複数 Road を別々に解析できる」テストは、1 件制限の導入により
  「道が複数あるMarkdownはエラーになる」テストへ書き換え。「文書タイトルでラップされ…実データ」の
  回帰テストは、2 道 → 1 道 2 Attempt に修正（見出し 1 段深いネスト・水平線除去の回帰保証は維持）。
  `tests/integration/seed-data-markdown.test.ts` に、複数道 Markdown を `parse-markdown` に渡すと
  エラーになり DB に何も保存されないことを確認する統合テストを追加。
- 検証: `tsc --noEmit` エラーなし。`npm run lint` 警告 0 件。`npm run test`（vitest）453/453 緑。

### 2026-09-25 Markdown取り込み: 見出しを作らず箇条書きだけで複数の試したことを書く形式に対応
- 報告: 上記の修正の直後、ユーザーが別の実データ（「つめが切りにくい」の例）を貼ったところ、
  「これで方法が1つしかない」（試したこと2件のはずが1件しか出ない）という不具合が発生した。
- 原因: 今回の Markdown は「試したこと1」「試したこと2」のような個別の見出しを一切作らず、
  番号なしの「### 試したこと」見出し 1 つの下に、見出しを増やさず「- 方法：〜」を 2 回書き、
  それぞれの下にインデントして「試した理由」「結果」等をぶら下げる形式だった。直前の修正
  （箇条書き形式の対応）は「1つの Attempt ノードの中の箇条書きを 1 件ぶんの項目として読む」
  実装だったため、この形式では「試したこと」ノード 1 つの中に「方法」ラベルが 2 回出現し、
  後から出た「方法」の値で上書きされてしまい、結果として 1 件にまとまってしまっていた。
- 修正 (`src/lib/admin/seed-markdown.ts`):
  - `parseGroupedBulletAttempts`（新規）: 「方法」で始まる箇条書き行が来るたびに新しい Attempt の
    開始とみなして、箇条書き全体を複数の Attempt に分割する（インデントの有無は問わない。
    インデントで判定すると、ChatGPT が付けたりつけなかったりする表記ゆれに弱くなるため、
    あえて「方法」というラベル自体を区切りに使う設計にした）。
  - `hasAttemptNumber`（新規）: 見出しの元テキストが数字で終わるか（「試したこと1」は番号付き、
    「試したこと」は番号なし）を判定する。`normalizeHeading` は番号を取り除いた文字列を返すため
    番号の有無を区別できず、別途この判定関数を用意した。
  - `parseAttemptsUnderNode`（`collectAttemptLeaves` を置き換え）: 「試したこと」見出し 1 つから
    Attempt を 0 件以上取り出す処理を、3 パターンに整理した:
    1. 直接の子にさらに「試したこと」見出しがある（ラッパー） → 再帰的に集める（前回までの対応）。
    2. 見出しの子が無く、**番号なし** → 箇条書きを「方法」区切りで複数件に分割する（今回の対応）。
    3. それ以外（番号付き、または見出しの子がある） → そのノード自身を 1 件として解析する
       （見出し形式・単一の箇条書き形式は `parseAttemptNode` 内で自動判別、前回までの対応）。
  - `buildAttemptFromFields`（新規）: `parseAttemptNode` から、項目 (`fields`) が揃ったあとの
    バリデーション・`ParsedAttemptDraft` への組み立て処理を切り出し、`parseGroupedBulletAttempts`
    からも共通で使えるようにした（method/result 必須・結果5分類チェック・気づき欄への折りたたみの
    重複実装を避けるため）。
- テスト: `tests/unit/seed-markdown.test.ts` に、ユーザーが実際に貼った Markdown と同じ構造
  （番号なし「試したこと」+ 箇条書き2件）の解析テスト、1件だけの場合のテスト、「方法」より前に
  内容がある場合のエラーテストを追加。
- 検証: `tsc --noEmit` エラーなし。`npm run lint` 警告 0 件。`npm run test`（vitest）456/456 緑
  （既存 453 ＋ 新規 3）。UI（`seed-markdown-importer.tsx`）と `docs/admin-manual.md` §6.5 のヘルプ
  文言にもこの形式が解析できる旨を追記。

### 2026-09-25 表記ゆれに強い検索（pg_trgm、AI・外部サービス不使用）を追加
- 経緯: 「つめが切りにくい」で検索してもヒットしない、という報告から検索実装を調査（ILIKE 部分
  一致のみで、保存文言「つめを切ろうとしても、うまく切りにくく、…」と語順が違うためヒットしない
  ことが判明）。対応案として ANTHROPIC_API_KEY での従量課金 AI・Gemini 等の無料枠 AI を提示したが、
  ユーザーから「外のサービスは中止も考えられるので、サーバー内のローカルで処理したい」との明確な
  方針判断があり、AI・外部サービスに一切依存しない方式を選んだ。
- 検討過程（ユーザーに提示し、確認のうえ採用）:
  1. ローカル LLM（Ollama 等）はさくら VPS のスペック（メモリ約 2GB、mycarenote と相乗り、
     `next build` すらスワップ必須）では非現実的と判断（`docs/deployment.md` §1 を根拠に説明）。
  2. 本来の要求は「AI による意味理解」ではなく「表記ゆれに強い部分一致」なので、AI を使わず
     PostgreSQL 標準拡張 `pg_trgm`（トライグラム類似度）で対応できると判断。
  3. 実際に開発 DB（`postgres:16-alpine`）で `CREATE EXTENSION pg_trgm` を試し、**追加インストール
     不要で即座に使えること**を確認してから実装に着手（「プログラムの変更のみで対応できるか」という
     質問に対する裏付け）。
- 実装:
  - マイグレーション `20260925095803_add_pg_trgm_fuzzy_search`: `CREATE EXTENSION IF NOT EXISTS
    pg_trgm` ＋ `roads.difficulty/situation/goal/previously_able`・`attempts.method/memo` への
    GIN トライグラムインデックス（`gin_trgm_ops`）。
  - `src/lib/search-fuzzy.ts`（新規）: `fuzzySearchRoadIds` / `fuzzySearchAttemptIds`。
    `$queryRaw` で `similarity()` の `GREATEST` を各対象カラムに掛け、しきい値 0.1 超・
    `is_published=true AND moderation_status='approved'` の id を類似度順で返す。しきい値は
    実際の報告ケース（「つめが切りにくい」と保存文言の類似度が実測 0.125 だった）を踏まえて
    やや低めに設定した。
  - `src/lib/search.ts`: `TermOpts` に `ids?: string[]` を追加。指定時は `terms`/`q.q` による
    `ILIKE` OR の代わりに `{ id: { in: ids } }` で絞り込む（3 つの where ビルダー全てに反映）。
    表記ゆれ検索で確定した候補をそのまま渡すためのフック（既存の `terms` ロジックとは独立）。
  - `src/lib/queries.ts`: `searchRoads` / `searchMethods` の `opts` 型に `ids?: string[]` を追加
    （そのまま `buildXxxSearchWhere` へ渡すだけ。既読判定・ページング等の既存処理は無変更で再利用）。
  - `src/app/experiences/page.tsx`: 通常のキーワード検索（AIアシスト利用時はそのフォールバックも
    含む）で道・方法どちらも 0 件、かつ検索語 2 文字以上のときだけ、最後の手段として
    `fuzzySearchRoadIds`/`fuzzySearchAttemptIds` を呼び、見つかった id で再取得する。見つかった
    ときは `FuzzyFallbackNotice`（新規コンポーネント）で「近いことばで探しました」「AIや外部
    サービスは使っていません」と表示する（`AiAssistPanel` と対になる簡潔な通知）。
  - 意味の異なる同義語（「爪切り」→「つめ」等）までは拾えない（それには embedding が必要。
    Phase 2 として保留のまま）。あくまで語順・言い回しの表記ゆれに対する保険。
- 検証: 開発 DB に実際の報告内容に近いデータを作り、`similarity()` の生スコアを実測してから
  しきい値を決定。「つめが切りにくい」の実例で、修正前は 0 件・修正後は該当の道が見つかることを
  実際の開発 DB に対して確認した。
- テスト: `tests/integration/search-fuzzy.test.ts`（新規、8 件）: 語順違いでも見つかる／類似度が
  高い順に並ぶ／非公開・未承認は対象外／Attempt の method・memo でも見つかる／空文字は空配列／
  無関係な語では見つからない／`searchRoads`・`searchMethods` の `opts.ids` 絞り込み、を検証。
  （実装時の失敗談: テストデータの文言に MARK（テスト隔離用の一意文字列）を混ぜると、無関係な
  データ同士も MARK という共通文字列を共有してしまい類似度が底上げされ、「無関係なデータは
  ヒットしない」という検証が意味をなさなくなった。クリーンアップは MARK の前方一致検索ではなく
  作成した id を直接指定する方式に直した）。
- 変更していないもの: `GET /api/v1/experiences`（公開 JSON API）。AIアシスト検索 Phase 1 と同じく
  Web ページ (`/experiences`) のみのスコープとし、既存の Phase 1 のスコープ判断を踏襲した
  （REST API へ広げる要望は無かった）。通常のキーワード検索・AIアシスト検索のロジックは無変更。
- 検証: `tsc --noEmit` エラーなし。`npm run lint` 警告 0 件。`npm run test`（vitest）464/464 緑
  （既存 456 ＋ 新規 8）。ブラウザでの実見た目確認・`npx playwright test` は未実施（開発サーバーは
  非稼働だったため `.next` 競合の心配は無かったが、UI の実見た目は未確認）。

  **追記（同日、「つめ　切り」で0件だった追加報告への対応）**: 上記の pg_trgm 導入直後、
  「つめ　切り」（空白区切りの単語 2 つ）で検索すると 0 件になる、という別の報告があった。
  - 原因の切り分け: 通常のキーワード検索は `q.q` を**1 つのフレーズ**としてしか扱っておらず、
    「つめ　切り」という空白入りの文字列がそのまま保存文言に含まれていないと一致しなかった
    （空白を挟んだ 2 単語のつもりで入力しても、フレーズ全体の完全一致でしか照合されない）。
  - 当初は表記ゆれ検索（pg_trgm）側で対処しようとし、検索語を空白で単語分割して各単語の
    類似度も試す実装を書いたが、実測で **pg_trgm の `similarity()`/`word_similarity()` は
    2〜3 文字程度の短い単語の判定が苦手**なことが分かった（例:「つめ」単体は 0.07、
    「開け」単体は 0（文字列全体としては含まれているのに、境界パディングの都合で単語の
    切れ目が無い日本語の地の文の途中に埋まっていると一致しない）ことを実測で確認）。
  - **正しい直し場所は表記ゆれ検索ではなく、基本のキーワード検索だった**と判断し直した:
    `resolveTerms`（`src/lib/search.ts`）を、`q.q` に空白（半角/全角）が含まれる場合は
    フレーズ全体 ＋ 単語ごとに分割した語を `Set` で重複排除して返すよう変更。既存の
    「複数語は OR で照合する」仕組み（検索AI Phase 1 の `opts.terms` と全く同じ経路）に
    素通しで乗るため、`buildExperienceWhere`/`buildRoadLevelSearchWhere`/`buildMethodSearchWhere`
    側の変更は不要だった。空白を含まない 1 語だけの検索語は、分割しても要素数 1 のままなので
    従来と完全に同じ where になる（後方互換）。
  - `src/lib/search-fuzzy.ts` の単語分割コードは、上記の実測結果（短語の類似度判定に向かない）
    を踏まえて**撤回**し、フレーズ全体だけを見る元のシンプルな形に戻した。しきい値は境界の
    ケース（「つめ切り」がちょうど 0.1 だった）を拾えるよう `0.1 超` から `0.08 以上` に変更した
    （ここは残した改善点）。
  - テスト: `tests/unit/search.test.ts` に `resolveTerms` の単語分割を検証する回帰テストを追加
    （空白ありは単語ごとにも分かれる／空白なしの 1 語は従来どおり／`opts.ids` 指定時は
    `terms`/`q.q` の OR を使わない、の 5 件）。`tests/integration/search-fuzzy.test.ts` に
    残していた「短い単語の分割でも見つかる」テストは、実装を撤回したため削除した
    （この観点の回帰は `search.test.ts` 側でカバーする）。
  - 検証: `tsc --noEmit` エラーなし。`npm run lint` 警告 0 件。`npm run test`（vitest）469/469 緑
    （既存 464 ＋ 新規 5）。開発 DB で「つめ　切り」が実際に 2 件ヒットすることを直接確認した。

### 2026-09-25 Markdown取り込みの確認・編集画面で、試したことの並び順を入れ替えられるようにする
- 目的: Markdown取り込みで解析した「試したこと」は Markdown に書いた順で表示されるが、
  保存前に順番を直したい（Markdown を書き直さずに）という要望。
- 実装 (`src/components/admin/seed-markdown-importer.tsx`):
  - `moveAttempt(roadKey, attemptKey, "up" | "down")`（新規）: 対象の Attempt を配列内で
    1 つ上/下の要素と入れ替える。境界（先頭で「上へ」・末尾で「下へ」）は呼び出し元の
    ボタンを `disabled` にして防ぐ（関数側でも範囲外なら何もしない防御を入れている）。
  - 各「試したこと」カードに「↑ 上へ」「↓ 下へ」ボタンを追加（既存の「外す」の隣）。
  - **保存 (`persistSeedRoads`) は配列の順番どおりに Attempt を 1 件ずつ `create` する
    実装のため（既存仕様、2026-09-24 の指示書実装時に確認済み）、この並び替えは
    コード変更無しでそのまま保存後の試した順（表示順）に反映される**。バックエンド側の
    変更は不要だった。
- テスト: `tests/unit/seed-markdown-importer.test.tsx`（新規、5 件、Testing Library で
  `api.post` をモックして検証）: 解析直後は Markdown の順で表示される／「↑ 上へ」で1つ上と
  入れ替わる／「↓ 下へ」で1つ下と入れ替わる／先頭の「上へ」・末尾の「下へ」が無効／
  **並び替えたあとに保存すると、入れ替え後の順番で保存APIへ送られる**（一番肝心な検証）。
- 変更していないもの: 保存・公開・非公開のロジック、AI生成画面（`seed-data-generator.tsx`、
  こちらは元々 1 Road=1 Attempt なので並び替えの概念が無い）。
- 検証: `tsc --noEmit` エラーなし。`npm run lint` 警告 0 件。`npm run test`（vitest）474/474 緑
  （既存 469 ＋ 新規 5）。ブラウザでの実見た目確認・`npx playwright test` は未実施。

### 2026-10-01 「自分の道を作る」入力画面の入口を「今、どんなことで困っていますか？」に変更（＋音声入力ボタンの調整）

「できなくなったこと」に該当するか迷わず書き始められるよう、作成画面（`src/components/road-form.tsx`）の
入口を広げた。変えたのは見た目だけで、DB/API は変更していない。

- 先頭の項目を「今、どんなことで困っていますか？」（必須）にした。保存先は従来どおり `roads.difficulty`
- 並び順: 困っていること → これから何ができるようになりたいか（必須）→ 以前は、どうしていましたか？（任意）→
  いつ頃から困るようになりましたか？（任意）→ どんな場面で困っていますか？ → メモ・気づき
- 「以前は〜」は削除せず、ラベルに「（任意）」を付けて任意のまま（必須/任意の扱いは変えていない）
- 見出しを「あなたの『困っていること』から、道を作ります」にし、「解決していなくても大丈夫です。
  『やってみたけどうまくいかなかった』ことも残せます。」を添えた
- API の作成時の必須エラー文言は「困っていることを入力してください」に変えた（`roadCreateSchema`）
- 編集画面（`road-edit-form.tsx`）・道の表示・トップページの「何ができなくて困っていますか？」は変更していない

同日の追加調整（利用者の確認を受けて）:

- 音声入力ボタンを入力欄のすぐ下へ。文字数カウンタが独立した 1 行を占め、その下にボタンが来ていたため
  隙間が大きかった。`TextAreaField` に `actions` を追加し、カウンタと同じ行の左に置く。さらに textarea を
  `block`（inline-block の行の高さぶんの隙間を消す）＋ `mb-1`（Field の `space-y-1.5` を 4px に）にした。
  Tailwind v4 の `space-y` は前の要素の margin-bottom で付くため、詰めるのは textarea 側。
  `actions` を渡さない入力欄は従来どおり
- 音声入力ボタンの角丸を `--radius-pill` → `--radius-md`（入力欄と同じ 14px）に。共通部品なので
  トップの検索欄・経験検索フォームのボタンも同じ角丸になる
- 「どんな場面で困っていますか？」「メモ・気づき」にも音声入力ボタンを追加（自由記述 5 欄すべて）
- テスト: `tests/unit/road-form.test.tsx`（表示順・必須表示・プレースホルダー・音声入力 5 個と位置・
  角丸・非対応ブラウザ・送信内容）、`tests/unit/validation.test.ts`（エラー文言）、
  `tests/e2e/road-create.spec.ts`（並び順、音声ボタン 5 個と入力欄との隙間 8px 以内）

### 2026-10-01 「道を編集」画面の項目名を作成画面とそろえる

「道の更新・編集画面 修正指示」。作成画面の入口を「今、どんなことで困っていますか？」に変えたので、
同じ意味の項目が作成と編集で違う名前にならないよう、編集画面（`src/components/road-edit-form.tsx`）を
そろえた。変えたのはラベル・補足・並び順・画面内のエラー文言だけで、DB カラム・API・既存データは
そのまま（「できなくなったこと」として保存済みの `difficulty` を一括変換したりはしない）。

| 旧ラベル | 新ラベル |
|---|---|
| できなくなったこと＊ | 今、どんなことで困っていますか？＊ |
| やりたいこと・目標＊ | これから、何ができるようになりたいですか？＊ |
| 以前できていたこと | 以前は、どうしていましたか？（任意）＋作成画面と同じ補足 |
| いつ頃から難しくなったか | いつ頃から困るようになりましたか？ |
| 困っている場面 | どんな場面で困っていますか？ |

- 「この道について」の並びを 困っていること → なりたい姿 → 以前（任意）に（作成画面と同じ）
- 画面内のエラー文言も作成画面と同じ「『困っていること』を書いてください」「『できるようになりたいこと』を
  書いてください」に。PATCH のサーバー側文言は `roadUpdateSchema = roadCreateSchema.partial()` なので
  作成時と同じ「困っていることを入力してください」になる
- 状態・いまの進捗・次に試すこと・メモ・タグは変更なし
- 「これから、何ができるようになりたいですか？」の必須/任意: 指示書では、ローカル AI の実用性検証の結果で
  決める（採用するなら AI 候補を確認・編集する形、採用しないなら任意化）。検証結果がまだ無く、
  「結果が出る前に AI 機能を実装しない」ともあるので、**作成・編集とも必須のまま**にしておく。
  任意化するときは `road-form.tsx` の `REQUIRED_ORDER`、`road-edit-form.tsx` の画面内チェック、
  `validation.ts` の `roadCreateSchema.goal` の 3 か所をそろえて変える
- 編集画面への音声入力ボタン追加は指示に無いので行っていない
- 作成・編集以外の画面には古い言い方が残っている（今回の対象外）: `/me` の空状態「『できなくなったこと』を
  一つ書くところから」、道の詳細の「困っている場面」、管理画面の投稿詳細・仮データ編集のラベル、
  `layout.tsx` のメタ説明文、利用規約
- テスト: `tests/unit/road-edit-form.test.tsx`（新ラベル・並び・必須表示・既存データの表示・無変更保存で
  全項目が同値で送られる・任意項目が空でも保存・必須エラー文言）、`tests/e2e/road-edit.spec.ts`
  （ラベル更新、作成した内容が編集画面の同名欄に出て保存後も欠落しない）

### 2026-10-01 「道を編集」画面の色・デザインを作成画面とそろえる

指示書 §18。作成画面（`road-form.tsx` / `/me/roads/new`）で実際に使っているクラス・トークンを基準にし、
新しい色は追加していない。入力欄・必須マーク・補足文・文字数カウンタ・フォーカスは、どちらも共通部品
（`form.tsx` の `TextAreaField` / `TextField`）なので元から同じ。違っていたものだけを合わせた。

| | 作成画面（基準） | 編集画面（変更前 → 変更後） |
|---|---|---|
| カード下地 | `--color-primary-tint` | `--color-surface` → `--color-primary-tint` |
| カードの余白 | `p-5 sm:p-6` | `p-5` → `p-5 sm:p-6` |
| 項目の間隔 | `space-y-5` | `space-y-4` → `space-y-5` |
| ページ幅・間隔 | `max-w-6xl space-y-5` | `max-w-5xl space-y-8` → `max-w-6xl space-y-5` |
| エラー表示 | アイコン＋「入力した内容は残っています」 | 文言のみ → 同じ形 |
| 主ボタン | `py-3`・`aria-busy` | `py-2.5` → 同じ |

- 枠線 `--color-primary`、角丸 `--radius-lg`、影 `--shadow-card` は元から同じ
- 「キャンセル」は作成画面に対応するものが無いので、主ボタンと高さ（`py-3`）だけそろえ、下地を `--color-surface` に
- 編集画面のセクション見出しのアイコン（色は `--color-primary`）と「道を編集」の芽アイコンは残した。
  項目が多い編集画面でまとまりを見分ける手がかりで、新しい色ではないため
- テスト: `tests/unit/road-edit-form.test.tsx` にカード・主ボタン・エラー表示のクラス確認を追加

### 2026-10-01 「道を編集」画面にも音声入力ボタン

作成画面と同じく、自由記述の欄すべて（困っていること／なりたい姿／以前／場面／いまの進捗／次に試すこと／
メモの 7 欄）に `VoiceInputButton` を `TextAreaField` の `actions` で付けた。話した内容は既存の文の後ろに
空白区切りで足す（作成画面と同じ）。日付・状態（短い 1 行）・タグには付けていない。保存処理は変更なし。
テスト: `tests/unit/road-edit-form.test.tsx`（7 個・位置・追記して保存・非対応ブラウザ）、
`tests/e2e/road-edit.spec.ts`（7 個と入力欄との隙間 8px 以内）。

### 2026-10-01 「道を編集」画面 最終修正指示 — 道の詳細の見出しもそろえる

指示書の項目（用語・色・3 セクション構成・既存データ維持・保存処理）は前項までで満たしていたため、
編集画面そのものは変更なし。完了条件「旧表現がユーザー向け画面に残っていない」「新規作成 → 編集 → 更新まで
一貫」を確認したところ、作成・保存後に表示される道の詳細（`/me/roads/[roadId]` の「道のあらまし」）に
「以前できていた／できなくなった／やりたいこと／困っている場面」が残っていたので、作成・編集画面と同じ言葉
（以前は、どうしていましたか？／今、どんなことで困っていますか？／これから、何ができるようになりたいですか？／
どんな場面で困っていますか？）に変えた。縦フローの並び（以前 → 今 → これから → 場面 → 進捗 → 次に試すこと）は維持。

- 「これから、何ができるようになりたいですか？」の必須/任意は、ローカル AI の検証結果待ちのため変更なし（必須のまま）
- 公開側の経験詳細（`/experiences/[id]`「この人がたどった道」）、`/me` の空状態、管理画面、メタ説明文、
  利用規約の言い方は今回の対象外（他人の道の見せ方・サイトの説明で、作成→編集→更新の流れではないため）
- テスト: `tests/e2e/road-edit.spec.ts` の「作成した内容が編集画面の同じ名前の欄に出る」に、保存後の詳細の見出し確認を追加

### 2026-10-01 道の編集画面「既存データの項目対応」— 調査結果（コード変更なし・マイグレーションなし）

「編集画面で『困っていること』と『以前』が逆に表示される」報告の調査。

- 画面の項目 ↔ DB フィールドの対応は、作成画面・編集画面・API（POST / PATCH は zod で検証した値をそのまま
  `prisma.road.create/update` に渡す）・道の詳細・検索・審査・管理画面のすべてで一致している:
  困っていること（旧「できなくなったこと」）= `roads.difficulty`、これから（旧「やりたいこと・目標」）=
  `roads.goal`、以前（旧「以前できていたこと」）= `roads.previously_able`
- 報告の道（ローカル DB `9ce83419-…`、2026-09-29 作成・更新）は **DB に入っている値そのものが逆**だった
  （`previously_able` = 「足が動かせないので、運転ができなくなった」、`difficulty` = 「自分で自動車を運転して
  出かけていた」）。9/29 時点のコード（73f0567）も対応は正しく、入力時に欄を取り違えたものと考えられる
  （当時の作成画面は「以前は、どうしていましたか？」が先頭だった）
- 表示のマッピングを入れ替えると正しく入っている他の道がすべて逆になるため、マッピングは変えない。
  DB の一括変換も不要。ローカル DB で `previously_able` に「なくなった／できない／難しい／困って／にくい」を
  含み `difficulty` に含まない実データを探したところ、該当はこの 1 件だけ（実データ 238 件中、以前が入っているのは 46 件）
- この 1 件の直し方（編集画面で利用者が入れ替える／単一行の UPDATE）は利用者の確認待ち。本番 DB は未確認
- テスト: `tests/e2e/road-edit.spec.ts` に指示書のテスト 1〜4（既存データの表示、作成 → DB → 編集の往復、
  以前が空、困っていることを変えて再保存しても他の欄が動かない）を例文そのままで追加

### 2026-10-01 登録画面・編集画面の役割整理（登録は軽く、道は後から育てる）

- 登録画面（`road-form.tsx`）を 4 項目に: 今、どんなことで困っていますか？＊ → これから、何ができるように
  なりたいですか？＊ → 以前は、どうしていましたか？（任意）→ メモ・気づき。「いつ頃から困るようになりましたか？」
  「どんな場面で困っていますか？」を登録画面から外した（編集画面には残る。編集画面の項目は削除していない）
- API（`roadCreateSchema`）・DB は変更なし。`startedAt` / `situation` は作成 API で引き続き受け付ける
  （画面から送らないだけ）
- 登録画面の「メモ・気づき」と編集画面の「メモ」は同じ `roads.memo`
- 「これから、何ができるようになりたいですか？」の必須/任意はローカル AI 検証の結果待ちで変更なし（必須）
- 折りたたみ UI は今回入れない（指示どおり将来検討）
- 自動車の既存データは、前項の調査どおり DB の値そのものが逆（`difficulty` に「以前」、`previously_able` に
  「困っていること」の内容）。表示・保存の対応を入れ替えると他の正しい道が逆になるため、コードでは直さない。
  単一行の入れ替えを行うかは利用者の判断待ち
- テスト: 登録画面のユニット・e2e を 4 項目に合わせて更新（ラベル 4 つだけ・音声ボタン 4 つ・4 項目が
  difficulty/goal/previouslyAble/memo で送られる）。日付の「日付を消す」e2e は編集画面へ移した。
  `road-edit.spec.ts` に「メモ付きで登録 → 編集で全 10 項目を変えて保存 → 再読み込みして同じ欄に戻る・
  API の値も一致」を追加

### 2026-10-01 「道を編集」と「道を育てる」を分離

「道を編集」＝道そのもの、「道を育てる」＝その道のその後（現在の状態・次の一歩・記録）。DB・API は変更なし。

- `road-edit-form.tsx`（道を編集）: 作成画面と同じ 4 項目だけ（difficulty / goal / previouslyAble / memo）。
  PATCH もこの 4 項目だけを送る
- `road-grow-form.tsx`（道を育てる、新設）+ `src/app/me/roads/[roadId]/grow/page.tsx`: 以前の編集画面の
  「今の状態」「次の一歩・記録」をそのまま移した（startedAt / situation / status / progress / nextAction /
  memo / tags）。PATCH はこの 7 項目だけ。必須なし。ボタンは「戻る」「保存」
- 両画面とも自分の項目だけを送るので、片方の保存でもう片方の値は消えない（PATCH は省略した項目を変えない）
- memo は 1 カラムのまま。道を編集では「メモ・気づき」、道を育てるでは「メモ」として同じ値を表示・更新する
  （指示どおり分割しない。分けるなら別途設計）
- 履歴（時系列で積む）機能は作らない。現在値の上書き
- 共通部品（カード・エラー表示・ボタン行・音声入力・API エラー変換）を `road-form-parts.tsx` に切り出した
- 道の詳細（`/me/roads/[roadId]`）の右上: 「道を編集」を secondary に、新たに「道を育てる」（芽アイコン）を primary で並べた。
  主ボタンが 2 つ並ぶと強すぎるため、その後の記録を促す「道を育てる」を主にした
- 作成画面は 4 項目のまま変更なし。「これから〜」は必須のまま
- テスト: `tests/unit/road-edit-form.test.tsx` を両画面向けに書き直し（項目・既存データ表示・送る項目が自分の分だけ・
  空でも保存・必須エラー・見た目・音声入力）。`tests/e2e/road-edit.spec.ts` は日付・場面・音声入力の確認を
  道を育てる側へ移し、「詳細から 2 画面へ進める」「登録 → 道を編集 → 道を育てる → 再表示で双方の値が残る（テスト 1〜5）」を追加

### 2026-10-01 「道を育てる」と「試したこと」の役割整理＋「道を編集」ボタンを緑に

- 役割: 道を編集＝道そのもの／道を育てる＝今の状態・次の一歩（未来）／試したことを記録（Attempt）＝実際に
  試したことと結果（過去）。DB・API・試したことの記録画面は変更なし
- 道の詳細の「道を編集」を `variant="secondary"` から既定の primary（`LinkButton` の `--color-primary` /
  `--color-primary-hover` / `--color-primary-ink`。「道を育てる」「試したことを記録」と同じ）に戻した。
  新しい色は追加していない。2 つの区別はアイコン（鉛筆／芽）とラベルで付く
- 道を育てる: 説明文を「今の状態や、これからの一歩を整理します。分かるところだけで大丈夫です。」に。
  カード見出し「次の一歩・記録」→「次の一歩」。「次に試すこと」に補足（実際に試したことと結果は
  「試したことを記録」から残せる）とプレースホルダー「例：車への乗り移り方を調べてみる」を追加
- メモとタグは「道を育てる」の「次の一歩」カードに残した（memo の扱いは変えない指示。タグは外すと編集できる
  画面が無くなるため）
- テスト: ユニットの見出し・補足の確認を更新。e2e に「道を編集／道を育てるが同じ主ボタンのクラスで実際の
  背景色も同じ」「自分の道 → 道を編集 → 保存 → 道を育てる → 保存 → 試したことを記録 → 保存で、どの値も残る」を追加

### 2026-10-01 道を編集／道を育てる: 下部の戻る・キャンセルを外し、保存ボタンを全幅に

- 下部のボタン行（左: キャンセル／戻る、右: 保存）をやめ、作成画面の「この道を作る」と同じ全幅の主ボタン 1 つに。
  戻るのは画面上部の「← 道へ戻る」リンク
- 保存ボタンにアイコン: 道を編集「変更を保存」= 鉛筆（`IconPencil`）、道を育てる「保存」= 芽（`IconSprout`）。
  道の詳細の「道を編集」「道を育てる」ボタンと同じアイコン。依頼は「絵文字」だったが、サイト全体が SVG アイコンで
  統一されているため Unicode 絵文字ではなく既存アイコンを使った
- 部品は `road-form-parts.tsx` の `RoadFormButtons` → `RoadFormSubmit` に置き換え

### 2026-10-01 音声入力ボタンを緑に

`VoiceInputButton` を白地＋枠線から、既存の主ボタンと同じ緑（`--color-primary` 地・`--color-primary-ink` 文字・
hover は `--color-primary-hover`）に。聞き取り中は hover と同じ濃い緑のまま（ラベルも「聞き取り中…（押して停止）」に変わる）。
新しい色は追加していない。共通部品なので、作成・道を編集・道を育てるに加え、トップの検索欄・経験検索フォームの
音声ボタンも緑になる。

### 2026-10-01 音声入力ボタンを小さく・入力欄との間を少し広げる

- `VoiceInputButton`: 余白を `px-4 py-2 gap-2` → `px-3 py-1 gap-1.5`。利用者の指示で、このボタンだけ
  タップ領域の最小 44px（`--tap-min`。`globals.css` の `@layer base` で button 全般に付く）を `min-h-0` で外し、
  高さ約 28px に（他のボタンは 44px のまま）
- `TextAreaField` の `actions` 付き: 入力欄とボタンの間を 4px（`mb-1`）→ 8px（`mb-2`）

### 2026-10-01 「この道を作る」「道を作る」にアイコン

- 作成画面の「この道を作る」に「道」アイコン（`IconRoute`）。道を編集（鉛筆）・道を育てる（芽）の保存ボタンと同じく
  アイコン＋文字を中央にそろえた全幅ボタン
- 「自分の道」（`/me`）右上の「道を作る」（`LinkButton`）にも同じ `IconRoute`。空状態の文中リンク「最初の道を作る」は
  ボタンではないので付けていない
- テスト: ユニット（この道を作るのアイコン、音声ボタンの小ささ `min-h-0 px-3 py-1 gap-1.5`、入力欄との間 `mb-2`、
  actions なしの欄には余白が付かない）、e2e（/me の「道を作る」と「この道を作る」にアイコン、押すと作成画面へ）

### 2026-10-01 「試したことを記録」「記録を編集」を道の画面のレイアウトに統一

- `attempt-form.tsx`: 独自の白地カードをやめ、「道を編集」「道を育てる」と同じ `road-form-parts.tsx` の部品に
  （`RoadFormSection` = 淡いグリーン地・緑枠・`--radius-lg`・`sm:p-6`、`RoadFormError`、`RoadFormSubmit` =
  全幅の主ボタン＋ノートのアイコン）。4 カード（試したこと／結果／メモ・気づき／公開設定）の構成・文言はそのまま
- ボタン: 「記録する」（編集時は「保存する」）を全幅の主ボタンに。「キャンセル」は指示どおり残し、その下に控えめな
  白地ボタン（`--color-border` 枠）で中央に置いた。道を編集・道を育てるは利用者の指示でキャンセル／戻るを外しているが、
  今回の指示書は「キャンセル」を残す前提のため
- ページ（新規・編集とも）: `max-w-5xl space-y-8` → `max-w-6xl space-y-5`、戻るリンク → 見出し（アイコン付き）→
  説明文の並びを道を育てると同じに。戻り先・文言は変更なし
- 機能は変更なし: 入力項目、結果 5 択、公開設定（新規は OFF 既定）、保存ペイロード（method / result / memo /
  isPublished のみ）、バリデーション。音声入力は 9/23 に外したまま（指示書「音声入力は変更しない」）
- テスト: `tests/unit/attempt-form.test.tsx` を新設（カード 4 枚の見た目、全幅の主ボタンと控えめなキャンセル、エラー表示、
  5 択、公開 OFF 既定・必須チェック、新規 POST と編集 PATCH の送信内容）。`tests/e2e/road-edit.spec.ts` に
  「自分の道 → 試したことを記録（見た目・幅が道を育てると同じ）→ 入力 → 記録 → 自分の道に表示・既存データ維持」を追加

### 2026-10-01 「試したことを記録」にも音声入力ボタン

9/23 の入力項目簡略化で外した音声入力を、利用者の指示で戻した。道の画面と同じ `VoiceInputButton`（緑・小さめ）を
`TextAreaField` の `actions` で「どんな方法を試しましたか？」「メモ・気づき（任意）」の 2 欄に付ける。話した内容は
既存の文の後ろに空白区切りで足す。保存内容・バリデーションは変更なし。
テスト: `tests/unit/attempt-form.test.tsx`（2 欄にボタン・位置と色、追記して記録、非対応ブラウザでは出ない）。

### 2026-10-01 「試したことを記録」のキャンセルボタンを外す

利用者の指示で、記録ボタンの下に残していた「キャンセル」を削除。道を編集・道を育てると同じく下部は全幅の
「記録する」（編集時「保存する」）だけで、戻るのは画面上部の「← （道の見出し） へ戻る」リンク。

### 2026-10-01 試したことの「結果」ボタン: 選択中は濃い緑の地＋白い枠

選択中の結果ボタンを、結果ごとの色の枠＋淡い地（`--color-result-*` / `-soft`）から、主ボタンと同じ濃い緑の地
（`--color-primary`）＋白い枠（`--color-surface`）に。濃い緑の上で読めるよう、選択中は文字・説明文・アイコンも
`--color-primary-ink`（白）にした。未選択は従来どおり白地＋`--color-border` 枠、アイコンは結果ごとの色。新しい色は追加していない。

### 2026-10-01 トップ「8枚の紹介画像」をスマホでは横スクロールに

- 変更前: スマホ（md 未満）は 1 列で縦に 8 枚、md 以上は 2 列 × 4 行の固定グリッド（9 月の指示書でスライダー・ドット・
  自動再生を持たない方針だった）。今回の指示でスマホのみカルーセルに変更。md 以上はそのまま
- `story-strip.tsx` を client component に。リストは 1 つのまま、クラスで切り替え:
  スマホ = `flex overflow-x-auto snap-x snap-mandatory`、各画像 `w-[85%] shrink-0 snap-start`（右に次の画像が約 15% 弱のぞく）、
  スクロールバー非表示、`overscroll-x-contain`。md 以上 = `md:grid md:grid-cols-2 md:overflow-visible`
- ドット 8 個（`md:hidden`）: スクロール位置に最も近い画像を現在位置として `aria-current`。押すとその画像へスクロール
  （`prefers-reduced-motion` のときは smooth にしない）。押せる範囲は 24px 四方（見た目は 8px の点。このボタンだけ
  最小 44px の高さを `min-h-0` で外した）
- 「横にスワイプして続きを見る →」を小さくドットの下に。一度横に動かしたら消える（保存はしない。再読み込みで再表示）
- 自動スクロールなし（タイマーを持たない）
- 画像・順番は変更なし（1254×1254、縦横比維持、トリミングなし）。代替テキスト（alt）だけ、コード上の文言が差し替え前の
  画像のもの（「やりたいことがある…」等）だったので、現在の画像に焼き込まれた見出し・本文に合わせて直した
- テスト: `tests/unit/story-strip.test.tsx`（順番・alt・レスポンシブのクラス・ドット・案内・タイマーなし）、
  `tests/e2e/story-strip.spec.ts`（desktop: 2 列 × 4 行／mobile: 1 枚目が領域の 8 割以上で正方形、2 枚目が右にのぞく、
  ページの横はみ出しなし、自動で動かない、スクロールでドット追従・案内が消える、ドットで 8 枚目へ、縦スクロール可）

### 2026-10-01 トップ 8 枚カルーセルの最終調整

- 初期位置: マウント時に `scrollLeft = 0`（戻る／再読み込みでブラウザが横位置を復元しても必ず ① から）
- ドット: 現在位置 = 横に長い緑（16×8px、`--color-primary`）、他 = 淡い灰色の点（8×8px、`--color-border`）。
  変更前は「緑の塗り」と「緑の枠だけ」で差が小さかった。新しい色は追加していない。幅の変化は
  `prefers-reduced-motion` ではアニメーションしない
- 「横にスワイプして続きを見る →」: 文言そのまま、`text-xs` → `text-[11px]`・`opacity-70`、ドットとの間を詰めた
- PC（md 以上）の 2 列 × 4 行、画像・順番・自動送りなしは変更なし

### 2026-10-01 トップページ レイアウト微調整（方法カードの横スライド・ヒーロー下地）

- 共通部品 `src/components/swipe-carousel.tsx` を新設し、8 枚ストーリーのカルーセルの仕組みを移した
  （スマホのみ横スクロール・85% 幅で次がのぞく・スナップ・ドット・任意の案内・1 件目から開始・自動送りなし。
  md 以上は呼び出し側が渡すレイアウト）。`story-strip.tsx` はこれを使う server component に戻した（見た目・動きは同じ）
- 「いろいろな方法が試されています」: スマホ（md 未満）は `SwipeCarousel`（ドットのみ、案内なし）。md 2 列 / lg 3 列は従来どおり。
  カードの中身・「この道を見る」リンク・rise-in アニメーションは変更なし
- ヒーロー: スマホ（sm 未満）の白い下地を 55% → 72% にして、イラストが見出し・サブコピー・検索欄より目立たないように。
  sm 以上は従来どおり（55% の白＋左から効く白グラデーション）。背景画像・位置は変更なし
- テスト: `tests/unit/swipe-carousel.test.tsx`（クラス・リンク維持・ドット・案内なし・タイマーなし）、
  `tests/e2e/story-strip.spec.ts` に方法カード（PC 3 列／スマホ横スライド・ドット追従・リンク遷移）とヒーロー下地（スマホ 0.72／PC 0.55、
  見出し・検索欄・ボタンが見える）を追加

### 2026-10-01 「/try」（SNS 簡易登録）最終UI調整

- 指示書は「試したことを記録」ページ宛てだったが、内容（上部イラスト・困っていたこと／試したこと 400 文字・
  「試したことを登録する」・運営確認の注意文）から `/try`（`src/app/try/page.tsx` / `quick-submit-form.tsx`）と判断
- 幅: 指示書の目安は 560〜640px だが、現状すでに `max-w-2xl`（672px、9/6 から）。目安に合わせると現状より狭くなり
  「細すぎるのを広げる」目的に反するため変更なし（中央配置・スマホ 1 列も維持）
- 説明文「困っていたことと、試してみた方法を…」: 14px のまま、色を補助色 → 本文色（`--color-ink`）、行間を広めに
- 入力欄「困っていたこと」「試したこと」: rows 2 / 3 → どちらも 4（約 118px）。プレースホルダー・400 文字は変更なし
- 注意文 2 つ（運営確認／個人情報・利用について）: 12px → 13px・行間広め。文言は変更なし
- 結果 5 択（PC 2 列）・ボタン・送信内容・バリデーションは変更なし
- テスト: `tests/unit/quick-submit-form.test.tsx`（新設）、`tests/e2e/quick-submit.spec.ts` に高さ・横はみ出し・結果の列数

### 2026-10-01 /try の導入イラストを try_image.png に差し替え

`public/try.png` を削除し `public/try_image.png`（1774×887、2:1。旧画像と同じ寸法なので `width` / `height` /
`sizes` は変更なし、alt も内容に合うのでそのまま）に。ファイル名を変えたので、本番の `next/image` キャッシュ
（`.next/cache/images`）やブラウザに旧画像が残っていても新しい画像が出る。
- テスト: `tests/unit/try-page.test.tsx`（新設。画像が `/try_image.png`・1774×887・ファイルが public にあり旧 `try.png` は無い、
  説明文・注意文の見た目）、`tests/e2e/quick-submit.spec.ts` に「try_image.png が実際に読み込まれ 2:1」を追加

### 2026-10-02 /try の OGP 画像を ogp20261002.png に差し替え

- `src/app/try/page.tsx` の `SHARE_IMAGE` を `/ogp.png`（1734×907）→ `/ogp20261002.png`（1726×911、≒1.89:1。
  大きい画像カード推奨の 1.91:1 にほぼ一致するので変換しない）。`openGraph.images` の width / height も合わせた。
  twitter:image も同じ画像
- SNS（X / Facebook / LINE 等）は画像 URL ごとにキャッシュするため、差し替え時はファイル名を変える方針
  （同名上書きだと古い画像が出続ける）。既にシェア済みの投稿のカードは SNS 側の再取得まで古いまま
- OGP 画像を使っているのは `/try` だけ（サイト共通の og:image は無い）。旧 `public/ogp.png` は同日に削除（下記）
- テスト: `tests/unit/try-page.test.tsx` に metadata の画像 URL・寸法・ファイル存在、`tests/e2e/quick-submit.spec.ts` の
  og:image / twitter:image / 画像取得の URL を更新し、og:image:width / height を追加

### 2026-10-02 使っていない画像を削除

`public/` のうち、コード（src・設定・テスト・スクリプト）から参照の無い画像を削除した（Git 履歴から復元可能）。
- `1.png`〜`7.png`: 旧トップの「できる道で、できること」カード等の画像（9/3 作成。カード削除後は参照なし）
- `ogp.png`: `ogp20261002.png` に差し替えた旧 OGP 画像
残したもの（参照あり）: `head.png`（トップのヒーロー）、`7-scene.png`（トップの CTA）、`brand-icon.png`（ヘッダー・フッター）、
`comic1〜8.png`（8 枚ストーリー）、`try_image.png`（/try の導入イラスト）、`ogp20261002.png`（/try の OGP）

### 2026-10-02 OGP 画像を全ページ共通に

- これまで OGP 画像を持つのは `/try` だけで、トップ等をシェアしても画像が出なかった。ルートレイアウト（`src/app/layout.tsx`）の
  metadata に既定の `openGraph`（type / siteName / locale / images）と `twitter`（summary_large_image / images）を追加し、
  全ページで `ogp20261002.png` を使うようにした
- 画像の URL・寸法は `src/lib/ogp.ts` の `OGP_IMAGE` に 1 か所にまとめ、`/try` もこれを参照
- Next.js の metadata は openGraph / twitter をページ側で定義すると丸ごと上書きする。og:title / og:description は
  レイアウトでは指定せず、SNS が各ページの `<title>` / description を使うようにした（レイアウトに書くと全ページが同じ題になるため）
- テスト: `tests/unit/ogp.test.ts`（共通画像・レイアウト既定・/try が同じ画像）、`tests/e2e/quick-submit.spec.ts` に
  「トップ・経験を探す・利用についての og:image / twitter:image が共通画像」を追加

### 2026-10-03 簡易登録 /try へのサイト内導線 ＋ ログイン後の戻り先修正

登録数を増やすため、ログイン不要の `/try` へサイト内から行けるようにした。DB・API・`/try` ページ本体・
トップのヒーロー／固定質問／8 枚ストーリー・道／記録フォームの入力項目は変更していない。

- 導線（詳細は `docs/spec.md` §5.4）: ヘッダー「経験を教える」／トップ下部 CTA を「経験を教える（ログイン不要）」主＋
  「自分の道を作る」副の 2 ボタンに／検索 0 件に `/try?problem=<検索語>` ボタン／経験詳細サイドカードの主ボタンを
  `/try?problem=<困りごと>` に替え「ログインして自分の道を作る」を文字リンクで残す／ログイン画面に
  「ログインせずに経験を教える」カード／道の見える化の空表示のリンクを `/try` に
- `/try` 完了画面に「もう1件教える」（method・result・errors を空にして `done=false`。difficulty は残す）と
  「ログインして自分の道として残す」（`/login?next=/me/roads/new`）を追加

**不具合: 未ログインで `/me/roads/new` を開くとログイン後に `/me`（一覧）に着地する**

- 原因: `src/app/me/layout.tsx` が未ログイン時に一律 `redirect("/login?next=/me")` していた。layout は
  自分の配下のどのパスが要求されたかを知る手段が無いため、元のパスを next に入れられなかった
- 直し方: `src/middleware.ts` が `/me` / `/me/*` のときだけリクエストヘッダー `x-dekiru-pathname` に
  パス＋クエリを載せて `NextResponse.next({ request: { headers } })` で渡す（`X-Robots-Tag`・`/admin` の
  `Cache-Control` 付与はそのまま）。layout は `headers()` でそれを読み、`src/lib/login-next.ts` の
  `loginNextFor()` で `/login?next=<encodeURIComponent(パス)>` を作る
- オープンリダイレクト対策: `loginNextFor` は `/me`・`/me/…`・`/me?…` 以外（外部 URL・`//host`・`/\host`・
  `/meeting` のような前方一致だけのもの・ヘッダー無し）を `/login?next=/me` に落とす。ログイン画面側も
  `safeNextPath()` で `/` 始まりかつ `//`・`/\` 始まりでないものだけを `callbackUrl` に使う
  （`google-signin.tsx` と E2E 用 `dev-login.tsx` の両方）
- テスト: `tests/unit/login-next.test.ts`、`tests/unit/quick-submit-form.test.tsx`（もう1件教える）、
  `tests/e2e/try-entry-links.spec.ts`（検索 0 件→/try、ヘッダー→/try・375px で横スクロール無し、
  ログイン画面→/try、/me/roads/new→ログイン→作成画面に戻る）

### 2026-10-05 経験詳細に「この道をSNSで紹介」（SNS共有機能追加指示書）

- 置き場所: 経験詳細「この人がたどった道」見出しの右、「参考になった」の隣。誤タップを避けるため、ハートとは
  別アイコン（共有）・枠なしの控えめな見た目にし、押すと選択肢パネルが開く 2 段階にした（その場で外部へ飛ばない）
- パネル: 「自動では投稿されません」の注記 → 共有される文章のプレビュー → 「Xで紹介する」
  （`https://x.com/intent/post?text=…&url=…` を新しいタブで開くだけ。X API・自動投稿はしない）／
  「リンクをコピー」（URL だけ）／「ほかのアプリで共有」（`navigator.share` がある環境だけ表示）。
  Facebook 等の個別ボタンは増やしていない（スマホは OS 標準共有で足りるため）
- 共有文: `src/lib/share.ts` の `buildShareText()`。材料は**ページに公開表示している**困りごと（無ければやりたいこと）・
  公開 Attempt の方法と結果だけ（メモ・気持ち・投稿者・内部 ID は受け取らない）。サーバー側で組み立てて
  クライアントへ文字列で渡す。優先順位は 困りごと ＞ 方法（時系列で代表 3 件まで、超えたら「など、N つの方法」）＞
  結果（件数をそのまま。全部うまくいかなかった/変化なしなら「どれも十分な改善にはつながりませんでした」、
  成功に書き換えない）＞ 結びの一文。X の重み付き 280（日本語 2・URL 23）に収まるまで 結び → 方法の長さ → 件数 の順に削る
- URL: 既存の `env.site.url` を基点に `/experiences/{id}`（`experienceShareUrl()`）
- OGP は変更していない（経験ごとの title/description ＋ 共通画像で問題なし。canonical は未設定のまま）
- 共有数は数えない・表示しない。DB/API の変更なし
- テスト: `tests/unit/share.test.tsx`、`tests/e2e/share.spec.ts`

### 2026-10-06 SNS共有UI 最終調整（経験ページ SNS共有UI 最終調整指示書）

- パネルは従来どおり初期状態で閉じる。閉じ方を追加: パネル右上の「閉じる」（文字。× アイコンは「X（旧Twitter）」と
  紛れるため使わない）・Esc。閉じたらフォーカスを「この道をSNSで紹介」へ戻す。トリガーの左右余白を詰め、
  412px 幅のスマホでも「参考になった」と横一列に収まるようにした（文字サイズ「大」などでは自然に折り返す）
- 共有文（`src/lib/share.ts`）:
  - 件数の表記: 9 以下は「3つの方法」、10 以上は「12件の方法」（「12つ」を出さない）
  - 結果の件数内訳の行（「結果は『少しできた』1件、…」）をやめ、SNS では概要だけにする。代わりに事実に沿う場合だけひとこと:
    うまくいった系とうまくいかなかった系が両方 →「うまくいった方法だけではなく、うまくいかなかった方法も残っています。」／
    全部うまくいかなかった・変化なし →「どの方法も、十分な改善にはつながりませんでした。」／全部継続中 →「いまも試している途中です。」／
    方法 1 件 →「結果は『（ラベル）』でした。」／それ以外（うまくいった＋継続中など）は書かない（成功・効果を断定しない）
  - 結びの一文（「うまくいかなかった方法も含めて…」）は上の結果のひとことに統合して削除。末尾は「↓ 実際の「道」を見る」
  - 困りごとの末尾に句読点が無ければ「。」を足す。指示書例の絵文字（🍳）は内容から安全に選べないため付けない
- OGP: 実際の HTML で og:title / og:description / og:image / twitter:card・title・description・image が経験ごとに出ていることを確認。
  canonical だけ無かったため `alternates.canonical: /experiences/{id}`（`/try` と同じ書き方）を追加。og:url は
  ページで openGraph を定義するとルートの共通画像設定が丸ごと上書きされるため付けていない


### 2026-10-06 SNS共有UI デザイン改善（大きなパネル → コンパクトな共有カード）

- トリガー「この道をSNSで紹介」は「参考になった」と同じ枠付きピルのまま（同日のユーザー指示「参考になったと同じにして」を優先。
  指示書 §2 の「視覚的に区別」とは矛盾するため、区別はアイコン・文言のみ）
- 共有カード: 既存の `.card`（白・枠線・角丸・影）を流用した小さなカード。見出し「この道を誰かに教える」＋
  「この経験が、同じことで困っている人のヒントになるかもしれません。」／「投稿内容」ラベル＋小さめ文字のプレビュー（全文表示。
  共有文自体が X の上限で短いので高さ制限は付けない）／「Xで紹介する」（既存 primary の緑）・「リンクをコピー」（secondary）／
  「ほかのアプリで共有」（文字リンク・OS 共有がある環境だけ）／最下部に小さく「自動では投稿されません。内容を確認してから投稿できます。」
- 表示方式: スマホ（< sm）はボタンの下にその場で開く。sm 以上はボタン直下に重ねるポップオーバー（幅 26rem・影 `--shadow-lift`）で、
  開いてもボタン・道の位置を動かさない。ボトムシート/モーダルはサイト内に前例が無いため採用していない
- 閉じる: 右上「閉じる」（× は「X（旧Twitter）」と紛れるので文字）・トリガー再押下・Esc・カード外のクリック/タップ
- 共有文の短縮: 方法は 3 件までは全部、4 件以上は代表 2 件＋「など、N つ/件の方法」。各方法は 20 字程度で切る。
  混在時のひとことは「うまくいかなかった方法も含めて、実際の試行錯誤が残っています。」。末尾は「↓ この人がたどった道」

### 2026-10-06 経験詳細ページ 情報設計・UI改善（困りごと → できるようにしたいこと → 試してきた方法）

- 「12件目を見たい」は内部状態ではなく、e2e（`branching-paths.spec.ts` のページ分割テスト）が作った道の goal の文字列。
  データなのでそのまま表示する（隠す・言い換えるロジックは入れていない）
- ユーザー確認（2026-10-06）: 「困っていたこと」= 現在のページタイトル（Road.difficulty）。同じ文をカード内に重ねない。
  「できていたこと」（previouslyAble）は困りごととは別の情報として小さく残す（未登録なら出さない。「まだ登録されていません」はやめた）。
  situation（困っている場面）は経験詳細では従来どおり表示しない（公開範囲を広げない）
- ページ上部: タイトルの上に小さく「困っていたこと」（difficulty が無い古いデータはタイトルが goal になるのでラベル無し）
- 道のカード: 説明「困りごとから、実際に試してきた方法を順番に見ることができます。」→ できていたこと（控えめ）→
  できるようにしたいこと（強調。goal が無ければ出さない。以前の「この困りごと」等の補完はやめた）→
  見出し「試してきた方法」＋件数（「4つの方法」「12件の方法」）＋「うまくいかなかった方法も含めて残っています。」
- 方法カード（経験詳細のみ。一覧 dense は従来どおり）: 1 段目 方法ラベル＋方法（太字）／2 段目「結果」＋結果バッジ（5 分類）＋できた度・時期／
  3 段目 現在 → 気づき → そのときの気持ち → 次に試すこと（本文 text-sm）。ラベル文言（方法A・現在：等）は既存 e2e の決定どおり変えていない
- ページ送り: 「1 / 2 ページ」をやめ「1〜11件目 / 全12件」（1 件だけなら「12件目」）、一覧の先頭にも「全12件のうち 1〜11件目を表示しています」。
  `paginateDetailRows` が `firstNumber` / `lastNumber` / `total` を返す。分割ロジック自体は不変
- 下部 CTA: 「あなたも同じことで困っていますか？」「あなたが試した方法も、誰かの次の一歩になるかもしれません。…」／ボタン「自分が試した方法を残す」（リンク先 /try?problem= は不変）

### 2026-10-06 経験詳細 方法カードの二層化（最終UI整理指示書）

- 第 1 層（常に表示）: 方法ラベル＋方法 →「結果」＋結果バッジ（5 分類）＋できた度（値があるときだけ。0% 補完はしない）＋時期 →
  「現在：」（state_after。指示書の「短い結果説明」に当たる既存データはこれだけなので、ここに出す）
- 第 2 層（各カード独立の `<details>`、初期は閉じる）: 気づき → そのときの気持ち → 次に試すこと。ラベルを上に置いて項目ごとに読みやすく。
  トグルは「＋ 詳しく見る（気づき・気持ち・次に試すこと）」→ 開くと「− 閉じる」。括弧内は実際に入っている項目だけ。高さ 44px（--tap-min）
- 指示書との差分: §3 は「現在」も折りたたむ側に挙げているが、§2 の短い結果説明と同じ文になるため、第 2 層では繰り返さない。
  「データ量が少なければ最初から開く」（§4）は、カードごとに開閉状態が違うと流れが読みにくくなるため採用せず、常に閉じた状態から始める
- 一覧（dense）の方法カードは変更なし。DB 変更なし

### 2026-10-06 経験詳細 最終仕上げ（結果と「現在」の重複整理・「詳しく見る」統一）

- 結果説明: その Attempt の state_after を結果（バッジ＋できた度＋時期）の直下にラベル無しで出す。結果と同じ意味の「現在：」ラベルはやめた
  （これまでの e2e の決定「道の詳細では『現在：』に統一」を、この指示書で上書き）
- 「現在」: state_after が無い最新の方法に Road.progress（道全体の現在の進捗）を補ったときだけ、意味が違うので「詳しく見る」の中に
  「現在：」として残す。詳細の順は 気づき → そのときの気持ち → 現在 → 次に試すこと（存在する項目だけ）
- 「詳しく見る」: 括弧書き（中身の項目名）をやめ「＋ 詳しく見る」/「− 閉じる」に統一
- 方法A/B/C: 内部記号ではなく、独立した方法の区別（A, B, C）と previous_attempt_id による「その方法の次に試した方法」（C-2 等）を表す。
  番号表記にすると親子関係が伝わらないので維持
- テスト: `tests/unit/branching-card.test.tsx`（結果説明・現在の振り分け、プレースホルダー無し）、`tests/e2e/branching-paths.spec.ts` を更新

### 2026-10-06 「経験を探す」一覧ページ UI・情報設計改善（一覧＝道を探す / 詳細＝道を読む）

- 見出し: h1「困りごとから、誰かの道を探す」＋「『これ、どうしたらいい？』と思ったことを検索してみてください。同じことで困った人が
  実際に試したことと、その結果（うまくいかなかったことも）を読めます。」。ナビ・<title> の「経験を探す」は不変
- 検索欄: ラベル「何に困っていますか？」（大きめ）、補助「例：字が読みづらい、料理がしにくい、外出しづらい。…」、placeholder「例：字が読みづらい」、
  入力欄を少し大きく。「AIで探す」はキーワード検索の一部なので検索欄の下のまま
- 絞り込み: 常時表示は 分野（タグ）・並び順 だけ。表示する種類・結果で絞る・既読/未読 は「詳細条件」（`<details>`）に折りたたみ、
  どれかが指定されているときは最初から開く。URL パラメータ・検索ロジックは不変
- 結果見出し: 「誰かが試した道」／検索語あり「『〇〇』で見つかった、誰かが試した道」。件数は「N件の道」
- 道カード（RoadCard）: 方法の列挙をやめ、困っていたこと（主役）→ タグ 3 件まで（残りは「ほかN件」）→「Nつ/N件の方法を試した」→
  結果の内訳（公開 Attempt の result を 5 分類の順に機械集計、2 件以上は件数）→ この道を見る。difficulty が無い古いデータは goal を
  「できるようにしたいこと」として出す（以前の「困っていたこと」という仮文字列はやめた）。既読/未読・自分の投稿バッジは不変
- 0 件: 「まだ同じ経験は見つかりませんでした」＋「あなたが試した方法を残すと、次に同じことで困る人の道になるかもしれません。」。/try ボタンは不変
- 方法カード（kind=method/both）は変更なし
- 既知の制約（未対応）: キーワード検索は文字列一致なので「字が読みづらい」「料理がしにくい」のような言い換えはローカルのシードでは 0 件になる。
  AIアシスト（?ai=1）・意味検索（?sem=1、本番未有効）で補える範囲。検索ロジックは今回変えていない
- e2e: `branching-paths.spec.ts` の 12 方法テストに後始末が無く、実行のたびに「検索の深い方法テストの道」が一覧に残っていた（ローカルで 22 本）。finally で削除するよう修正

### 2026-10-06 「経験を探す」一覧 最終改善（カードの主役＝困っていたこと）

- データ確認: カードの「困っていたこと」は Road.difficulty（入力フォームの「困っていること」）で正しい。スクリーンショットの
  「検索の深い方法テストの道」は表示の問題ではなく、e2e（12 方法テスト、作成者「Deep」）がローカル DB に残した道の difficulty の値。
  本番では e2e を流さない（E2E_TEST_LOGIN を設定しない）ので出ない。テスト側は同日に後始末を追加済み。DB の既存データは変更していない
- 長い困りごと: カードでは CSS の `line-clamp-3` で 3 行まで（文章は改変しない・全文は詳細ページ）。短い困りごとはそのまま。2 列グリッドは行内で高さがそろう
- 結果の色: 既存の結果トークン（failed は茶系 #b4480e で強い赤ではない）をそのまま使う。変更なし

### 2026-10-06 一覧カード「困っていたこと」のデータ確認（表示側の修正なし）

- 入力→表示の追跡: 通常登録フォーム「困っていること」(road-form) と /try「困っていたこと」(quick-submit) → API/validation の `difficulty`
  → `roads.difficulty` → `searchRoads`（RoadCardDTO.difficulty）→ RoadCard「困っていたこと」。詳細ページのタイトル・検索対象も同じ `difficulty`。
  Road に title / name 相当の項目は無い
- 「検索の深い方法テストの道」は `roads.difficulty` に実際に入っている値。e2e（branching-paths.spec.ts の 12 方法テスト、作成者「Deep」）が
  作ったもので、previouslyAble「以前はできていた」・goal「12件目を見たい」・方法「ふつうの方法 1〜12」。本当の困りごとのデータは存在しない
  → UI で偽装・データ書き換えはしない。ローカル DB の 22 本はユーザー判断待ち（テストには後始末を追加済み）
- 整合を保証する e2e を追加: `tests/e2e/road-card.spec.ts`（困りごとで検索→カードの困っていたこと・方法数・結果内訳が実データどおり→
  「この道を見る」先の h1 と一致）

### 2026-10-06 ヘッダーの文字サイズ切替（標準・大・特大）が効かない／標準に戻る問題の修正

- 仕組み（`html[data-font-scale]` → `--font-scale` → html の font-size）自体は動いていた。実測で見つかった原因は 2 つ:
  1. 保存値の適用が hydration 後の `useEffect` だけだったため、ページを開くたびに標準サイズで表示され、遅い端末では
     load 完了後もしばらく標準のまま（その間ボタンも反応しない）。→ `src/lib/font-scale.ts` の `FONT_SCALE_INIT_SCRIPT` を
     layout の `<head>` で描画前に実行（`<html suppressHydrationWarning>`）。head スクリプトが出ない画面（404 等）向けに
     `useEffect` での再適用も保険として残す
  2. 小さいラベル（バッジ・日付・注意文など 28 箇所）が `text-[11px]` / `text-[13px]` の px 固定で拡大されなかった。
     → `text-[0.6875rem]` / `text-[0.8125rem]` に置換（標準時は同じ大きさ）。**文字サイズは px で固定しない**
- 確認: Chromium / WebKit（iPhone 幅）で 標準 16px → 大 18.4px → 特大 21.12px、ページ遷移・リロード後も保持、横スクロールなし

### 2026-10-06 ヘッダーナビ: 太字を「自分の道」固定 → 現在ページに変更

- 2026-09-03（ヘッダーUI改善 v1）で `自分の道` のみ常に `font-semibold` にしていたのを撤回し、ユーザー判断で
  「いま開いているページの項目だけ太字（`font-bold`）」に変更。配下ページも含む（/experiences/[id] → 経験を探す、/me/roads/… → 自分の道）
- `src/components/header-nav-link.tsx`（`usePathname` で判定、`aria-current="page"` も付与）。リンクの文言・遷移先・色は不変

### 2026-10-07 トップのストーリー画像を 8 枚 → 6 枚に差し替え

- ユーザーが `public/comic1〜6.png` を新しい画像（「高い棚の物が取りにくい」1 つの困りごとを ①気づく → ②何に困っているか考える →
  ③同じ経験を探す → ④これならできそう → ⑤やってみる → ⑥どうだった？ と追う構成）に差し替え、`comic7/8.png` を削除。サイズは同じ 1254×1254
- `story-strip.tsx` の SLIDES を 6 件にし、alt を新しい画像に焼き込まれた見出し・吹き出しの文字に合わせて書き直し。リストの読み上げ名は
  `できる道の紹介（${SLIDES.length}枚）`。PC は 2 列 × 3 行、スマホは横スクロール＋ドット 6 個（SwipeCarousel は変更なし）
- unit / e2e テスト・`docs/spec.md`・CLAUDE.md の「8 枚」を 6 枚に更新
- 注意: ファイル名が同じなので、`/_next/image` の最適化キャッシュ（`.next/cache/images`）が古い画像を一度返すことがある（ローカルで確認。
  再取得で新画像になる）。本番反映時は `.next/cache/images` を消してから再起動すると確実

### 2026-10-07 トップのヒーロー画像を文字なしの横長ビジュアルに差し替え（指示書「トップヒーロー更新指示」）

- ユーザーが `public/head.png` を新画像（2164×726、約 3:1）に差し替え。左 0〜35% が明るいキッチン（文字用の余白）、
  37〜57% に女性、右に空と川沿いに続く道。**画像に文字は無い**ので、ブランドメッセージ「できないが、できるに変わる。
  あなたのペースで。」（文言不変）は HTML で右上の空の上に重ねる（白 75% の角丸下地＋淡い影。女性の顔・道に掛けない）
- 旧実装（高さ 36rem・右寄せで左を大きくカット・PC は画像全体に白 55%）は新画像に合わないため変更:
  - xl（1280px）以上: ヒーローを画面幅いっぱい（`xl:mx-[calc(50%-50vw)]`）にし、画像を全面背景（`object-[15%_center]`）。
    1152px 幅に収めると検索エリア（高さ約 500px）に合わせて画像が約 1.5 倍に拡大され、右の道が切れる・女性が大きすぎるため。
    見出し・検索はキッチン部分に置き、白グラデーションは左側だけ（画像全体は白くしない）
  - sm〜xl 未満: 画像全体を 3:1 の帯で見せ、その下に見出し・検索（横長画像に文字を重ねると女性に被る）
  - スマホ: 画像の右側（女性・空・道）を 2:1 の帯で見せ、その下に見出し・検索。スマホ専用画像は作らない
  - `body { overflow-x: clip }` を追加（100vw がスクロールバー幅を含むため、Windows 等で横スクロールが出ないように）
- ヘッダー・検索・音声入力・具体例チップ・6 枚の紹介画像は変更なし。文字サイズ「特大」の PC ではヒーローが高くなり画像の拡大で
  右の道が一部切れるが、文字は女性に重ならない
- e2e `story-strip.spec.ts` のヒーローのテストを新レイアウトに合わせて書き換え。同ファイルの「いろいろな方法」2 件は
  本変更前から失敗している（カードの縦位置が 61px ずれる。ローカル DB のデータ由来とみられる。未対応）

### 2026-10-07 トップ微調整: スマホのブランドメッセージを 14px → 15px

- 指示書「トップページ 微調整指示」。スマホ（640px 未満）だけ `text-sm` → `text-[0.9375rem]`。タブレット 16px・PC 20px と位置は不変。
  16px 以上にすると 375px 幅で枠が女性の髪に掛かるため 15px に留めた
- ヒーロー直下の余白（画像の帯 → 「できる道」まで 24px）は確認のうえ変更なし。画像・トリミング・検索 UI の順序・6 枚の紹介画像も不変

### 2026-10-07 固定ヘッダーの裏にアンカー移動先の見出しが隠れる問題（指示書「固定ヘッダーの表示修正指示」）

- 原因: `scroll-padding-top: 5rem`（80px）固定。PC のヘッダー（73px）基準で、スマホではヘッダーが 2 段（117px、
  文字サイズ「特大」で 196px）になるため、#main・見出しへの移動先が 37〜117px ヘッダーの裏に入っていた
- 対応: `src/components/header-height-sync.tsx` がヘッダー（`[data-site-header]`）の実寸を ResizeObserver で
  `--header-height` に入れ、`scroll-padding-top: calc(var(--header-height, 4.5rem) + 0.5rem)`。文字サイズ切替にも追従。
  ヘッダーの sticky・構造・デザインは不変、ヘッダーを小さくしてもいない
- 結果: 375/390/768/1280px × 標準/特大で、見出しはヘッダー下端の 8〜11px 下に止まる（PC は従来 7px → 8px でほぼ同じ）
- 補足: 指で普通にスクロールしている途中に本文がヘッダーの下を通るのは固定ヘッダーの性質で、これは変えていない
  （ヘッダーは不透明の白なので文字が透けて重なることはない）

### 2026-10-07 スマホ固定ヘッダーのコンパクト化（指示書「スマートフォン固定ヘッダーのコンパクト化」）

- sm 未満だけ（`max-sm:` クラスのみ追加。PC・タブレットは計測値も見た目も不変）:
  - 1 段目 = ロゴ・文字サイズ・ログイン/アカウント、2 段目 = ナビ（経験を探す／経験を教える／自分の道を横いっぱいに配置）
  - 文字サイズは「A 標準 ▾」の 1 ボタンにまとめ、押すと 標準・大・特大 を開く（`font-size-control.tsx`。Escape・外側タップで閉じる。
    sm 以上は従来の 3 ボタン）。未ログインでも使うのでアカウントメニューには入れない
  - 余白を詰め（py-3.5 → py-1.5、行間 gap-y-2 → 0.5）、ナビのタップ領域は高さ 44px（--tap-min）に
- ヘッダー高さ（375/390px）: 未ログイン 117 → 103px、ログイン 157（3 段）→ 103px、特大 196/225 → 159/161px。
  特大ではロゴ行が 22px 足りず 1 段目が折り返す（3 段）が従来より低い
- アンカー移動の位置補正は `--header-height` の実測なので自動で追従（見出しはヘッダー下 8〜11px）
- 既知（本変更とは無関係・未対応）: a11y e2e「トップ」(mobile) がカルーセルの「横にスワイプして続きを見る →」
  （11px・opacity-70）のコントラスト不足（3.47）で失敗。特大ではヒーローのブランドメッセージ（rem 指定）が大きくなり女性の顔に掛かる

### 2026-10-08 承認後に道の公開項目を変えたら、その道の承認済み経験を再審査する（セキュリティレビュー H-2）
> ⚠️ この節のうち **A（道の PATCH での再審査）は同日中に撤回**した（次節「2026-10-08 H-2 の見直し」参照）。
> **D（審査本文に道の progress / nextAction を追加）は維持**している。以下は当時の記録。
- 発見: security-and-hardening によるレビューで、承認済みの経験を持つ道を `PATCH /api/v1/roads/{id}` で
  書き換えると AI 審査を通らずに公開面へ出ることが分かった（「道を編集」「道を育てる」どちらの画面からも）。
  2026-09-09 の道モデレーション廃止時、「外れるのはタイトルとタグだけ」として両者を経験の審査本文へ
  移したが、(1) 以前の `ROAD_MODERATED_FIELDS` にあった `progress` / `nextAction` が審査本文から漏れ、
  (2) PATCH 時の再審査そのものも失われていた。`progress` は公開経験詳細の「現在」、道の `nextAction` は
  公開 API に出る。
- 変更（D）: `moderateAttemptContent` の審査本文に道の `progress`（「いまの進捗」）と `nextAction`
  （「道で次に試すこと」）を追加。プロンプトの構造は変えていない。
- 変更（A）: `PATCH /api/v1/roads/{id}` で公開項目（`ROAD_PUBLIC_FIELDS` = difficulty / goal /
  previouslyAble / situation / progress / nextAction）かタグが**実際に変わった**ら、その道の
  `isPublished=true` かつ `moderationStatus=approved` の経験を既存の `applyModerationOnPublish` で 1 件ずつ
  再審査する（`src/lib/moderation.ts#remoderateApprovedAttemptsOfRoad`）。ok なら公開維持、ng / unknown は
  公開中の経験を編集したときと同じく pending に戻り運営へ通知。`AI_MODERATION_ENABLED=false` は既存関数の
  挙動（即 approved）のまま。
  - 変更の判定は保存前後に DB から読んだ値どうしで比べる（PATCH に含まれていても trim・タグ名の正規化後に
    同じなら再審査しない）。memo / status / startedAt だけの変更では再審査しない（公開面に出ないか、日付のみ）。
- 維持した方針: **道自体は審査状態を持たない**（2026-09-09 を維持。マイグレーションなし）。公開可否は
  これまでどおり経験（Attempt）だけが持ち、道の公開情報の変更は「その道の公開済み経験に影響する変更」として
  経験の再審査で扱う。道の編集のロック（2026-09-11 に廃止）も戻さない。
- 対象外（意図的）: 保留中（pending。既に運営の確認待ち）と却下済み（rejected）は再審査しない。
  rejected を対象にすると AI の ok で運営の却下が覆るため。なお「本人が公開をオフ→オンにすると rejected の
  経験も AI 再審査で approved に戻り得る」問題は既存の別課題として残す（今回は触らない）。
- 件数上限: 設けない（まず正しい動作を優先）。公開中の経験が多い道では編集の応答が「1〜3 秒 × 件数」
  遅くなり得る。API コスト・応答時間・同時実行が問題になったら別途最適化を検討する。
- UI: 変更なし。保存後に遷移する道の詳細（`/me/roads/[roadId]`）で、保留に戻った経験は既存の
  「確認中」「運営が内容を確認しています」表示になる（試したことを編集して pending に戻ったときと同じ）。
- 既存データ: 今回より前に承認後に書き換えられた道は自動では再審査されない（必要なら管理画面の
  AI 再チェックで個別に）。
- テスト: `tests/unit/moderation.test.ts`（審査本文に progress / nextAction が入る）、
  `tests/integration/road-remoderation.test.ts`（再審査の対象・トリガー・結果、AI はモック）。

### 2026-10-08 H-2 の見直し: 道の編集での再審査（A）を撤回し、D は維持。道と試したことの役割を分離
- 方針（ユーザー判断）: **道は自由に育てられる情報**、**試したことは公開コンテンツとして AI 審査する情報**と
  分離する。道の審査は復活させない（`Road.moderationStatus` なし・編集ロックなし・マイグレーションなし）。
- 撤回（A）: `PATCH /api/v1/roads/{id}` の保存前後比較と、その道の公開中・承認済み経験の再審査
  （`ROAD_PUBLIC_FIELDS` / `readRoadPublicSnapshot` / `roadPublicContentChanged` /
  `remoderateApprovedAttemptsOfRoad`）を削除。道の編集（タグ・progress・nextAction を含む）では AI を
  呼ばず、経験の状態も変えない。
  - 撤回理由（A の最終レビュー指摘）: 道の編集 1 回で経験数分の AI 呼び出し（M-2、日常的な
    「いまの進捗」更新でも発生・費用増幅の経路）、同時編集で古い AI 判定が新しい判定を上書きし得る（M-1）、
    途中失敗で一部の経験だけ再審査され再送でも直らない（L-1）、経験数に比例した管理者メール（L-2）、
    運営が承認した経験が道の編集のたびに AI で再審査される（L-3）。A を外すとこれらの道編集起因の経路は
    なくなる（`applyModerationOnPublish` 自体の「審査中の運営判断が AI 結果で上書きされ得る」性質は既存のまま）。
- 維持（D）: 試したことの公開・編集時の審査本文に道の `progress`（いまの進捗）/ `nextAction`
  （道で次に試すこと）を含める。
- 追加: 管理画面の AI 再チェック（`POST /api/admin/posts/{id}/recheck`）が道の `progress` /
  `nextAction` / **タグ**を審査本文に含めていなかった（タグは 2026-09-09 からの漏れ）。審査対象の select と
  入力の組み立てを `src/lib/moderation.ts#ATTEMPT_MODERATION_SELECT` / `toAttemptModerationInput` に
  共通化し、公開・編集時の審査と再チェックで審査対象が常に一致するようにした。再チェックの権限・
  「状態は変えず AI 判定だけ記録する」仕様は変更なし。
- 受容したリスク: 承認後に道を編集すると、その道の経験が次に公開・編集されるか運営が AI 再チェックする
  までは、編集後の道の記述が審査されないまま公開経験と一緒に表示される（H-2 の中心部分は残る）。
  運営が「承認後に道が編集された経験」を見つけられる仕組みを管理画面に別途用意する（次節）。
- 既存データ: A は DB 構造を変えていない。A が本番で動いていた間に再審査された経験の AI 判定・pending への
  変化はそのまま残す（pending になった経験は運営の確認待ちキューで判断する）。
- テスト: `tests/integration/road-remoderation.test.ts` を `road-edit-moderation.test.ts` に置き換え
  （道の編集で AI を呼ばない・経験の状態が変わらない／試したことの公開・編集と AI 再チェックで最新の
  progress / nextAction / タグが審査本文に入る）。

### 2026-10-08 管理画面「承認後に道が編集された経験」（H-2 の見直し・案1）
- 目的: 道は AI 審査しない（前節）ので、「承認済み・公開中の試したことがある道が、その後編集された」ことを
  運営が発見できるようにする。道の編集で AI を呼ぶ／経験を保留にする／編集をロックする／道に審査状態を
  持たせる、はいずれもしない。
- 案の比較: 案1（DB 変更なし・`roads.updated_at` で近似）／案2（`roads.public_content_updated_at` を 1 列追加して
  公開項目の実変更時だけ記録＝正確だがマイグレーションが必要）／案3（管理者メール＝一覧で見つけられず
  送信量・本番メール未稼働の問題）。**ユーザー判断で案1**（猶予 5 秒・仮データ除外・3 か所表示）。
  案1 の誤検知が運用上つらければ案2 を次段とする。
- 判定（`src/lib/admin/queries.ts#roadEditedAfterReview`。Prisma では表をまたぐ列比較ができないので生 SQL）:
  公開中・承認済み（`publicAttemptSql`）で仮データでない道の経験のうち、`roads.updated_at` が経験の最終確認時刻
  `COALESCE(GREATEST(ai_checked_at, moderated_at), updated_at)` より `ROAD_EDIT_GRACE_SECONDS`（5 秒）以上あと、
  かつ同じ道のどの公開中・承認済み経験の最終確認時刻 ± 5 秒にも重ならないもの。後者は、経験の承認時に
  `bumpRoadUpdatedAt` が道の `updated_at` を進めることによる誤検知（AI 承認直後の経験・兄弟経験が全部出る）を除くため。
  AI 無効時（`AI_MODERATION_ENABLED=false`）の承認は ai_checked_at / moderated_at が残らないので経験の `updated_at` を使う。
- 表示（最小限・既存の構造に追加）: ダッシュボード「確認が必要なもの」に件数カード（確認待ち 0 件でもこれがあれば
  「✓ 確認が必要な経験はありません」は出さない）／`/admin/posts` のタブ「承認後に道が編集された」
  （`?status=road-edited`、`ROAD_EDITED_FILTER`。ModerationStatus とは別の擬似値）＋説明文／経験詳細の上部に注記
  （道の更新日時・この経験の最終確認日時）。
- 運営の対応: 既存の「AI でもう一度チェック」（前節で道の progress / nextAction / タグも審査対象に）。
  ai_checked_at が進むので一覧から外れる。状態は変えない既存仕様のまま。新しいボタン・状態・監査アクションは追加しない。
- 既知の限界: 誤検知＝memo / status / startedAt だけの編集・値を変えない保存（フォームは全項目を送る）も出る。
  見逃し＝道の編集後に同じ道の別の経験が承認されると `updated_at` が上書きされて外れる（その場合、編集後の道の記述は
  その経験の AI 審査本文で一度見られている）。経験の result / triedAt だけの編集など、審査を伴わない経験の更新は
  AI 無効時の確認時刻（updated_at）を進めるため、AI 無効環境では見逃しになり得る。
- 性能: 公開中・承認済み経験 × 同じ道の経験の NOT EXISTS。ダッシュボード表示ごとに 1 回、一覧の絞り込み時に 1 回、
  詳細で 1 件分。現状の件数では問題にならない想定（増えたら `attempts(road_id)` の既存インデックスと件数を見直す）。
- テスト: `tests/integration/admin-road-edited.test.ts`（承認後の更新を出す／承認 ±5 秒の bump・兄弟経験の承認・
  運営判断が新しい場合は出さない／AI 無効時のフォールバック／保留・却下・非公開・仮データは出さない／
  実際の道 PATCH 後に出て AI 再チェックで外れる・状態は変わらない／一覧・詳細・ダッシュボードに反映）。
