# できる道 (dekiru-way)

> 「できない」を終点にしない。誰かの試行錯誤を、誰かの次の一歩へ。

できなくなったことを一つ入力すると、同じことで困った人が**どんな方法を試して、どうなったか**が
見つかる Web アプリ。うまくいった経験だけでなく、**少しできた・変化なし・うまくいかなかった・
継続中**も価値ある経験として残す。

**画像・写真の投稿／添付は行わない**（プライバシー保護のため、サービス側で画像そのものを受け付けない）。記録は文章と音声入力が中心。

---

## 技術構成

| 領域 | 採用 |
| --- | --- |
| Frontend / Backend | Next.js 15 (App Router, TypeScript) フルスタック |
| DB | PostgreSQL 16 + Prisma 6 |
| 認証 | Auth.js (NextAuth v5) + Google OAuth（JWT セッション Cookie） |
| AI（補助） | Anthropic Claude（キー未設定時はスタブ） |
| テスト | Vitest（unit / integration）、Playwright + axe-core（E2E / a11y） |

設計判断の詳細は [`docs/implementation-decisions.md`](docs/implementation-decisions.md)、
API 仕様は [`docs/api.md`](docs/api.md)、
管理画面の日常運用は [`docs/admin-manual.md`](docs/admin-manual.md)（運営者向け・実装の話は無し）。

---

## 必要なもの

- Node.js 20 以上（開発は 22/25 で確認）
- Docker（PostgreSQL をローカル起動）

---

## セットアップ & 起動

```bash
# 1. 環境変数
cp .env.example .env
#   ローカルで認証フローを試すだけなら、まず E2E_TEST_LOGIN=true のモックログインで動く。
#   Google 実ログインを使うなら AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET を設定
#   （リダイレクト URI: http://localhost:3000/api/auth/callback/google）。

# 2. インフラ（PostgreSQL:5433）
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
| `npm run admin:create -- <email> <password> [表示名]` | 管理画面にログインできる運営者を作成／パスワード再設定 |
| `npm test` | Vitest（unit + integration、DB 必須） |
| `npm run test:e2e` | Playwright（mobile + desktop、a11y 含む） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `next lint` |

---

## 環境変数

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | ○ | PostgreSQL 接続文字列。ローカル既定は `postgresql://dekiru:dekiru@localhost:5433/dekiru` |
| `SITE_URL` | △ | サービスの公開 URL。OGP（`og:image` / `og:url`）や canonical の絶対 URL 基点。**本番は https の本番ドメイン必須**。未設定は `http://localhost:3000` にフォールバック |
| `AUTH_SECRET` | ○ | Auth.js のセッション署名鍵（`openssl rand -base64 32`） |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | △ | Google OAuth クレデンシャル。未設定でも公開検索は動く。ログイン画面で未設定の旨を表示 |
| `ANTHROPIC_API_KEY` | ✕ | 設定すると AI 補助が実 API 呼び出しに。未設定ならスタブ。**投稿モデレーションもこのキーを使う**（未設定だと公開投稿はすべて「不明」＝運営レビュー待ちになる。`AI_MODERATION_ENABLED=false` で審査自体を無効化＝即承認） |
| `ANTHROPIC_MODEL` | ✕ | 既定 `claude-sonnet-5` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✕ | 初期管理者のブートストラップ用（`npm run db:seed` と `npm run admin:create` のみ参照。実行時の認証には使わない）。dev の既定は `admin@example.com` / `dekiru-admin` |
| `ADMIN_SESSION_TTL_HOURS` | ✕ | 管理セッションの有効時間（既定 8）。署名鍵は `AUTH_SECRET` を流用するので管理画面利用時は `AUTH_SECRET` が必須 |
| `BLOCKED_IPS` | ✕ | 手動ブロックする IP のカンマ区切り（管理画面の代替） |
| `ACCESS_LOG_SALT` | ✕ | アクセスログのクライアント識別子を匿名化するソルト |
| `E2E_TEST_LOGIN` | ✕ | `true` で開発/E2E 用モックログイン（`/api/test/login`）を有効化。**本番では絶対に設定しない** |
| `ADS_ENABLED` | ✕ | `true` で検索一覧・道詳細の 2 枠に広告スロットを描画（既定 false）。プロバイダ未接続の間はプレースホルダのみ。トップ・自分の道・各フォームには出さない |

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
8. 未ログインで `/try?problem=ボタンがとめにくい`（SNS 向け簡易登録）→ 困っていたことが入った状態で
   試したこと・結果を入力して登録 → 「確認待ち」で保存され、`/admin/moderation` に並ぶ（承認前は公開面に出ない）
9. 別アカウントで `/experiences/{id}`（他人の経験）を開き「この経験は参考になりましたか？」のハートを押す
   → 投稿者でログインするとトップ上部に「いいねが届いています」の通知（件数・氏名は出ない）。自分の経験にはハートは出ない
10. ログイン状態で `/experiences` を検索 → カード右上が「未読」。カードから経験詳細を開いて検索に戻ると「既読」に変わる
   （既読数などの数字は出さない。未ログインでは常に未読扱いで既読保存もしない）
11. ヘッダー右上のユーザーメニュー → 「アカウント設定」（`/me/account`）で 自分の道／試したこと／公開した経験 の件数を確認 →
   「アカウントを削除」→ 確認 → 本人の道・試したこと・公開経験がまとめて消えてログアウトされる（Google アカウントは残る）

---

## 管理画面（内容モデレーション）

**投稿**（`Attempt` の「経験として公開」）は、公開のタイミングで **AI 審査**を通す。
審査本文には、その経験が属する道の記述（できなくなったこと等）・タグも含める。

- AI 判定が **OK** → そのまま公開
- **NG / 不明**（`ANTHROPIC_API_KEY` 未設定時も含む）→ 保留（`moderationStatus = pending`）。
  公開検索には出さず、本人の画面では「確認中」表示。運営が管理画面で **許可 / 却下**する
- 公開中の投稿を本人が書き換えた場合も再審査され、NG/不明なら自動で保留に戻る
- **公開検索に出るのは「投稿が `isPublished` かつ承認済み」のときだけ**。道 (Road) 自体は
  モデレーション状態を持たず、道が公開面に出るかは「承認済みの公開経験を 1 つ以上持つか」で決まる

管理画面（`/admin`、Google ログインとは別のメール＋パスワード）。開くと最初に
「確認が必要」（件数＋意味＋操作）→「現在の状況」→「最近の動き」→「管理メニュー」の順で並び、
何を確認すればいいかが一目で分かるようにしている。画面上の表示名は「投稿」ではなく「経験」を使う
（API/DB/コード上の呼び名は変更していない）:

| 画面 | 内容 |
| --- | --- |
| `/admin` | ダッシュボード。確認が必要な件数・現在の状況・最近の動き・管理メニュー |
| `/admin/moderation`（経験を確認） | 経験の確認待ちキュー。AI の理由・カテゴリを見て公開する / しない |
| `/admin/posts`（公開されている経験） | 全経験の一覧（状態フィルタ・検索）、公開停止・再公開・AI 再チェック |
| `/admin/posts/{id}` | 経験の全項目＋AI 判定＋操作ログ |
| `/admin/audit` | 全操作ログ（誰が・いつ・何をしたか） |

「利用者」「通報・対応」は未実装のためリンクにせず、管理メニューに「準備中」とだけ表示する
（ダミー画面は作らない）。

```bash
npm run admin:create -- you@example.com "your-password" "表示名"   # 運営者を作成
# dev は npm run db:seed でも admin@example.com / dekiru-admin が作られる
```

実装: スキーマ `ModerationStatus`（`Attempt` のみ）/ `admin_users` / `admin_audit_logs`、
公開ゲートは `src/lib/search.ts#PUBLIC_ATTEMPT_WHERE`（投稿が `isPublished` かつ承認済み）に一元化、
AI 審査は `src/lib/ai/moderation.ts`（`moderateAttemptContent`）+
`src/lib/moderation.ts`、管理認証は `src/lib/admin/*`（`AUTH_SECRET` 署名の独立セッション cookie）、
ダッシュボード集計・最近の動きは `src/lib/admin/queries.ts`。
`/admin/*` では一般利用者向けヘッダー・フッターを出さない（`src/components/site-chrome.tsx`）。
admin 主要画面は axe-core (wcag2a/wcag2aa) で違反 0 件を確認済み。

---

## テスト

```bash
docker compose up -d              # DB
npx prisma migrate deploy && npm run db:seed
npm test                          # Vitest: 193 件（lib ロジック + 道ツリー/ページ分割 + 検索の出し分け/ページ送り/公開で浮上 + 認可 + 同一オリジン強制 + bot-guard + 投稿モデレーション/保留/管理認証/SNS簡易登録/いいね/既読/アカウント削除/広告カテゴリ の結合）
npm run test:e2e                  # Playwright: 106 件（重要シナリオ / 道の作成・文字数表示 / 権限 / 枝分かれ道・10件ページ分割 / 検索カードの出し分け・種類指定・ページ送り・既読絞り込み / できた％・気持ち / スクレイピング対策 / 管理画面モデレーション / SNS簡易登録 / いいね / 既読 / アカウント設定・削除 / 広告配置 / 検索状態の復元 / axe）
```

E2E は `E2E_TEST_LOGIN=true` でモックログインを使う（Google OAuth 不要）。
`playwright.config.ts` の `webServer` が毎回クリーンな本番ビルドを**専用ポート 3100**
（`E2E_PORT` で変更可）で起動するため、`npm run dev`（3000）や他アプリと衝突しない。
DB（docker）は事前に起動しておくこと。

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
- **書き込みは同一オリジンからのみ**（`src/lib/api.ts#assertSameOrigin`）— `POST` / `PATCH` /
  `PUT` / `DELETE` は `Sec-Fetch-Site` / `Origin` を検証し、別サイト発なら `403`。`SameSite=Lax`
  セッション Cookie への CSRF 二重防御
- **`robots.txt`**（`src/app/robots.ts`）— `/api/` と AI クローラーを Disallow（単独の防御にはしない）
- **レスポンス最小化** — `user_id` / `google_sub` / `road_id` など内部 ID を公開面に出さない
- **アクセスログ**（`src/lib/access-log.ts`）— 匿名化した識別子で記録。生 IP・認証情報は残さない
- **利用規約**（`/terms`）— 機械的大量取得・外部AIの学習/データセット化目的の収集を禁止と明示
- 詳細と閾値・限界は `docs/implementation-decisions.md` §7-bis

## 既知の制約 / 未実装

- **本番ホスティング未確定**（標準 PostgreSQL + Prisma なので移行容易）。
- レート制限はメモリ内（単一プロセス前提）。水平スケール時は共有ストアへ。
- 投稿モデレーションの AI 審査は公開操作に同期実行（Claude 呼び出し 1〜3 秒）。将来は非同期キューへ。
- 管理画面は投稿モデレーション中心（利用者管理・IP ブロック UI・通報導線は未実装。`bot-guard` の運用フック関数は用意済み）。
- 検索は部分一致（`ILIKE`）。類似検索・AI 検索・全文検索は未実装（拡張点は `src/lib/search.ts` に集約）。
- Prisma 6 の `package.json#prisma` 設定に非推奨警告が出る（動作影響なし。Prisma 7 で `prisma.config.ts` へ移行予定）。
- 初期版として SNS 機能（フォロー / いいね / コメント / DM / ランキング / フィード）は意図的に非実装。

---

## ディレクトリ

```
prisma/                 スキーマ・マイグレーション・シード
src/
  app/                  画面 + API Route Handlers (/api/v1/*、/admin、/api/admin/*)
  components/            UI・フォーム・各画面のクライアント部品（admin/ に管理画面部品）
  lib/                  db / auth / authz / api / search / ai / validation / moderation / likes / reads / admin ...
  styles/tokens.css     デザイントークン
tests/
  unit/  integration/  e2e/
docs/                   api.md / implementation-decisions.md / admin-manual.md
docker-compose.yml      PostgreSQL
```
