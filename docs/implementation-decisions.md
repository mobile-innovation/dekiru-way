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

### 2.3 公開単位は Attempt（指示書 14）／road.visibility との関係
- 検索・経験詳細に出るのは **`is_published = true` の Attempt だけ**。
- 経験詳細では親 Road の記述フィールド（`previously_able` / `difficulty` / `goal` /
  `situation` / `progress` / `next_action` / タグ）を**文脈として一緒に表示する**。
  これは「困ったこと → 試したこと → 結果 → 現在 → 次」を追うために必要（指示書 6-③）。
- ただし **同じ Road の非公開 Attempt は一切露出しない**（`experiences/{id}` の `siblings` も
  `is_published = true` に限定）。
- `road.visibility`（private / public、**初期値 public**・道の詳細画面で切替可）は「自分の道ページ全体を他人が閲覧できるか」を
  制御する**別概念**。MVP では公開経験の閲覧導線は Attempt 単位のみで完結しており、
  `road.visibility = public` は将来の「本人の道ページ公開」用のフラグとして保持している
  （現状 UI からトグルはできるが、他人向けの道ページ URL は未実装）。

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
| Edge ミドルウェア | `src/middleware.ts` + `screenEdgeRequest()` | 環境変数 IP ブロックリスト / 既知 AI クローラー UA を 403 / 全レスポンスに `X-Robots-Tag: noai, noimageai` |
| アプリ層ガード (状態あり) | `src/lib/bot-guard.ts#inspectPublicRead` | IP 単位のレート (60s) とバースト (10s)、`page=1,2,3..` の高速連続巡回、同一クエリ連打を検知。段階的に 429 → 一時ブロック (10分)。UA プロファイル: 通常 / UAなし / スクリプト系 (`curl`, `python-requests` 等) で閾値を変える |
| 公開読み取りラッパ | `src/lib/public-api.ts#handlePublicRead` | 5 つの公開 GET (`experiences`, `experiences/{id}`, `experiences/paths`, `tags`, `tags/{id}/experiences`) を包み、ガード + アクセスログ + `X-Robots-Tag` |
| SSR ページガード | `src/lib/page-guard.ts#guardPublicPage` | `/`, `/experiences`, `/experiences/{id}`, `/experiences/paths` の SSR も同じ bot-guard 状態で判定。ブロック時は `RateLimitedNotice` を表示 |
| robots.txt | `src/app/robots.ts` | 一般クローラーは `/api/` `/me/` `/login` を Disallow。既知 AI クローラーはサイト全体を Disallow。**これ単独は防御にしない** (§8) |
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
- **表示する種類を選べる**：絞り込みフォームに `kind`（`road` / `both` / `method`）を追加。
  **既定は `road`（道だけ）**。方法カードは検索語を入れて `both` / `method` に切り替えたときだけ出る
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
