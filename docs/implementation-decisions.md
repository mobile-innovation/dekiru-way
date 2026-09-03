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
| 写真ストレージ | **S3 互換（`@aws-sdk/client-s3`）／開発は docker の MinIO** | DB には `storage_url` のみ保持（指示書 15）。本番は R2 / S3 等へ差し替え可能。 |
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
- `road.visibility`（private / public、初期値 private）は「自分の道ページ全体を他人が閲覧できるか」を
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

## 4. アップロード（指示書 15）

- 受け付けるのは `image/jpeg` / `image/png` / `image/webp` / `image/gif`。
- 検証: MIME ホワイトリスト ＋ **マジックバイト**（`detectImageType`）＋ サイズ上限 **5MB** ＋
  1 記録あたり **8 枚**まで。
- 保存キーは `attempts/<attemptId>/<uuid>.<ext>`。DB には公開 URL（`storage_url`）を保存。
- MinIO バケットは匿名 read 可（`docker-compose.yml` の `minio-setup`）。公開写真を
  `storage_url` で直接表示するため。本番で非公開バケット＋署名 URL にする場合は
  `src/lib/storage.ts` に集約済みなので差し替え可能。

---

## 5. AI（指示書 12）

- 3 エンドポイント: `experience-search` / `summarize-experiences` / `suggest-next-step`。
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
| AI API と公開 API の分離 (§14) | ルーティング上の分離 | `/api/v1/ai/*` は認証必須 (suggest-next-step) もしくはレート厳格 + スタブ。`GET /api/v1/experiences` の大量取得で学習データを作れる前提の設計にしない |

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
