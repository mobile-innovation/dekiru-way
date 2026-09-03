# できる道 (dekiru-way)

> 「できない」を終点にしない。誰かの試行錯誤を、誰かの次の一歩へ。

できなくなったことを一つ入力すると、同じことで困った人が**どんな方法を試して、どうなったか**が
見つかる Web アプリ。うまくいった経験だけでなく、**少しできた・変化なし・うまくいかなかった・
継続中**も価値ある経験として残す。

---

## 技術構成

| 領域 | 採用 |
| --- | --- |
| Frontend / Backend | Next.js 15 (App Router, TypeScript) フルスタック |
| DB | PostgreSQL 16 + Prisma 6 |
| 認証 | Auth.js (NextAuth v5) + Google OAuth（JWT セッション Cookie） |
| ストレージ | S3 互換（開発は MinIO）。DB は `storage_url` のみ保持 |
| AI（補助） | Anthropic Claude（キー未設定時はスタブ） |
| テスト | Vitest（unit / integration）、Playwright + axe-core（E2E / a11y） |

設計判断の詳細は [`docs/implementation-decisions.md`](docs/implementation-decisions.md)、
API 仕様は [`docs/api.md`](docs/api.md)。

---

## 必要なもの

- Node.js 20 以上（開発は 22/25 で確認）
- Docker（PostgreSQL と MinIO をローカル起動）

---

## セットアップ & 起動

```bash
# 1. 環境変数
cp .env.example .env
#   ローカルで認証フローを試すだけなら、まず E2E_TEST_LOGIN=true のモックログインで動く。
#   Google 実ログインを使うなら AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET を設定
#   （リダイレクト URI: http://localhost:3000/api/auth/callback/google）。

# 2. インフラ（PostgreSQL:5433 / MinIO:9000, コンソール:9001）
docker compose up -d

# 3. 依存関係
npm install

# 4. DB マイグレーション + シード
npx prisma migrate deploy
npm run db:seed

# 5. 開発サーバー
npm run dev
# → http://localhost:3000
```

### 主な npm スクリプト

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー |
| `npm run build` / `npm run start` | 本番ビルド / 起動 |
| `npm run db:up` | docker compose 起動 |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | シード投入（`failed` を含む公開経験サンプル） |
| `npm run db:reset` | DB リセット＋再マイグレーション |
| `npm test` | Vitest（unit + integration、DB 必須） |
| `npm run test:e2e` | Playwright（mobile + desktop、a11y 含む） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |

---

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | ○ | PostgreSQL 接続文字列。ローカル既定は `postgresql://dekiru:dekiru@localhost:5433/dekiru` |
| `AUTH_SECRET` | ○ | Auth.js のセッション署名鍵（`openssl rand -base64 32`） |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | △ | Google OAuth クレデンシャル。未設定でも公開検索は動く。ログイン画面で未設定の旨を表示 |
| `STORAGE_ENDPOINT` / `STORAGE_REGION` / `STORAGE_BUCKET` / `STORAGE_ACCESS_KEY_ID` / `STORAGE_SECRET_ACCESS_KEY` / `STORAGE_PUBLIC_BASE_URL` / `STORAGE_FORCE_PATH_STYLE` | ○ | S3 互換ストレージ。ローカル既定は MinIO |
| `ANTHROPIC_API_KEY` | ✕ | 設定すると AI 補助が実 API 呼び出しに。未設定ならスタブ |
| `ANTHROPIC_MODEL` | ✕ | 既定 `claude-sonnet-5` |
| `BLOCKED_IPS` | ✕ | 手動ブロックする IP のカンマ区切り（管理画面の代替） |
| `ACCESS_LOG_SALT` | ✕ | アクセスログのクライアント識別子を匿名化するソルト |
| `E2E_TEST_LOGIN` | ✕ | `true` で開発/E2E 用モックログイン（`/api/test/login`）を有効化。**本番では絶対に設定しない** |

### プロキシ配下での注意（Rate Limit の識別子）

クライアント識別は `X-Forwarded-For` の先頭ホップ → `X-Real-IP` の順。リバースプロキシ /
ロードバランサ配下では、信頼できるプロキシが付けた値だけを見るよう構成すること
（そうしないと `X-Forwarded-For` を偽装してレート制限を回避される）。

---

## 手で確認するフロー

1. 未ログインで `/` に困りごとを入力 → `/experiences` にシードの公開経験（`failed` 含む）が出る
2. カード →`/experiences/{id}` で「以前できていた → できなくなった → やりたい → 試した → 結果 →
   現在 → 次」を確認、「同じ困りごとへの、いろいろな方法」で複数の道を確認
3. `/login` でログイン（Google もしくはモック）
4. `/me/roads/new` で道を作成（段階入力）
5. `/me/roads/{id}/attempts/new` で `failed` を保存 → もう 1 件 `success` を保存
6. `/me/roads/{id}` に両方が時系列で並び、`failed` も残っていることを確認
7. 各記録の「経験として公開」トグル、道の公開設定、編集、削除

---

## テスト

```bash
docker compose up -d              # DB / MinIO
npx prisma migrate deploy && npm run db:seed
npm test                          # Vitest: 89 件（lib ロジック + 道ツリー/ページ分割 + 検索の出し分け/ページ送り + 認可 + bot-guard の結合）
npm run test:e2e                  # Playwright: 70 件（重要シナリオ / 道の作成・文字数表示 / 権限 / 枝分かれ道・10件ページ分割 / 検索カードの出し分け・種類指定・ページ送り / できた％・気持ち / スクレイピング対策 / axe）
```

E2E は `E2E_TEST_LOGIN=true` でモックログインを使う（Google OAuth 不要）。
`playwright.config.ts` の `webServer` が毎回クリーンな本番ビルドを**専用ポート 3100**
（`E2E_PORT` で変更可）で起動するため、`npm run dev`（3000）や他アプリと衝突しない。
DB / MinIO（docker）は事前に起動しておくこと。

---

## 公開API・スクレイピング対策（追加指示書 v1）

「公開＝自由に大量取得できる」設計にはしていない。人間の検索・閲覧はそのまま、
機械的な大量取得・自動巡回・外部AI学習目的の収集を難しくする多層防御:

- **Rate Limit / バースト制限 / 連続巡回検知**（`src/lib/bot-guard.ts`）— IP 単位。`page=1,2,3…`
  の高速巡回や同一クエリ連打を検知し、段階的に `429` → 一時ブロック
- **ページング上限** — `limit ≤ 50`、`page ≤ 100`、`(page-1)*limit < 500`。`limit=10000` は `400`。
  全件取得 API は無い
- **既知 AI クローラーの遮断**（`src/middleware.ts`）— GPTBot / ClaudeBot / CCBot / Bytespider 等の
  UA は `403`。全レスポンスに `X-Robots-Tag: noai, noimageai`
- **`robots.txt`**（`src/app/robots.ts`）— `/api/` と AI クローラーを Disallow（単独の防御にはしない）
- **レスポンス最小化** — `user_id` / `google_sub` / `road_id` など内部 ID を公開面に出さない
- **アクセスログ**（`src/lib/access-log.ts`）— 匿名化した識別子で記録。生 IP・認証情報は残さない
- **利用規約**（`/terms`）— 機械的大量取得・外部AIの学習/データセット化目的の収集を禁止と明示
- 詳細と閾値・限界は `docs/implementation-decisions.md` §7-bis

## 既知の制約 / 未実装

- **本番ホスティング未確定**（標準 PostgreSQL + Prisma なので移行容易）。
- レート制限はメモリ内（単一プロセス前提）。水平スケール時は共有ストアへ。
- MinIO バケットは匿名 read 可（公開写真を直接配信）。非公開運用なら署名 URL 化が必要。
- `road.visibility = public`（本人の道ページの公開）はフラグのみ保持。他人向けの道ページ URL は未実装。
- 検索は部分一致（`ILIKE`）。類似検索・AI 検索・全文検索は未実装（拡張点は `src/lib/search.ts` に集約）。
- Prisma 6 の `package.json#prisma` 設定に非推奨警告が出る（動作影響なし。Prisma 7 で `prisma.config.ts` へ移行予定）。
- 初期版として SNS 機能（フォロー / いいね / コメント / DM / ランキング / フィード）は意図的に非実装。

---

## ディレクトリ

```
prisma/                 スキーマ・マイグレーション・シード
src/
  app/                  画面 + API Route Handlers (/api/v1/*)
  components/            UI・フォーム・各画面のクライアント部品
  lib/                  db / auth / authz / api / search / storage / ai / validation ...
  styles/tokens.css     デザイントークン
tests/
  unit/  integration/  e2e/
docs/                   api.md / implementation-decisions.md
docker-compose.yml      PostgreSQL + MinIO
```
