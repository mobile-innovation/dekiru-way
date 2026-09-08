# できる道 サービス仕様書（現行版）

> この文書は「いま実装されているもの」をまとめた現行仕様書です。
> 決定の経緯・変更履歴は [`implementation-decisions.md`](implementation-decisions.md)、
> API の詳細は [`api.md`](api.md)、運営者向けの手順は [`admin-manual.md`](admin-manual.md) を参照してください。
> 最終更新: 2026-09-09

---

## 1. サービス概要

**できる道（dekiru-way）** は、日常生活で「できなくなったこと」に対する試行錯誤を持ち寄り、
同じことで困っている人の「次の一歩」につなげる Web アプリです。

- キャッチ: 「できない」を終点にしない。誰かの試行錯誤を、誰かの次の一歩へ。
- うまくいった方法だけでなく、**少しできた／変化なし／うまくいかなかった／継続中** も
  価値ある経験として残す。
- **SNS ではない。** プロフィール・フォロー・タイムライン・コメントは持たない。
- **画像・写真の投稿／添付は扱わない**（プライバシー保護のため、サービス側で受け付けない）。
  記録は文章と音声入力が中心。

---

## 2. 中心概念とデータの単位

| 用語 | 実体 | 説明 |
| --- | --- | --- |
| **道**（Road） | `roads` | 一人の「困りごと・目標」から始まる試行錯誤のまとまり。タイトル／以前できていたこと／できなくなったこと／やりたいこと／場面／進捗／次に試すこと／メモ／タグ など |
| **試したこと**（Attempt） | `attempts` | 道の中で試した 1 つの方法と結果。方法・結果（5 分類）・時期・気づき・できた％・気持ち・その後の状態・次に試すこと・前に試した方法（因果） |
| **経験**（Experience） | 独立テーブルなし | 「公開された Attempt」を経験と呼ぶ。他ユーザーはこれを検索・閲覧する |

### 結果の 5 分類（変更不可・色だけに頼らず必ず文言を添える）

| 値 | 表示 |
| --- | --- |
| `success` | できるようになった |
| `partial` | 少しできた |
| `no_change` | 変化はなかった |
| `failed` | うまくいかなかった |
| `ongoing` | まだ試している |

### 「道」の見せ方

道は専用の視覚テーブルを持たず、Road＋Attempt から**枝分かれ型フロー**として生成する。
「以前できていた → できなくなった → やりたい → 試した → 結果 → 現在 → 次」を、
カード・線・点・矢印の UI で表現する（`BranchingPaths`）。方法が 11 件以上のときは
表示上 10 件ごとにページ分割し、親子（前に試した方法）でつながる枝はページ境界で分断しない。

---

## 3. 利用者と権限

| 区分 | 認証 | できること |
| --- | --- | --- |
| 未ログイン | 不要 | 公開経験の検索・閲覧、道の見える化、SNS 簡易登録（`/try`）、利用規約閲覧 |
| ログイン利用者 | Google OAuth（Auth.js / NextAuth v5、JWT セッション Cookie） | 上記＋自分の道・試したことの作成／編集／削除、公開切替、いいね、既読、アカウント設定・削除 |
| 運営者（管理者） | メール＋パスワード（利用者の Google ログインとは**完全に別系統**・独立セッション Cookie） | `/admin/*` で内容モデレーション・状態変更・AI 再チェック・操作ログ閲覧 |

- 所有者チェックは必ずサーバー側（`src/lib/authz.ts`）。UI でボタンを隠すだけにしない。
- 公開経験に氏名・アバターは一切含めない（スキーマ上も最小限）。
- Google プロフィール名・画像はサービス上で表示・編集しない。認証・所有者判定にのみ使う。

---

## 4. 画面一覧

### 公開（ログイン不要）

| パス | 内容 |
| --- | --- |
| `/` | トップ。ヒーロー（`head.png` 背景）＋困りごとの検索フォーム＋具体例チップ、8 枚のストーリー、試した結果の見かた、実データの道プレビュー、CTA。**広告は出さない。** ログイン中で未読の「いいねが届いた」通知があれば最上部に通知ボックス |
| `/experiences` | 経験を探す。**道カード**（困りごと別）と**方法カード**（検索語が方法本文に当たったもの）を出し分け。フィルタ: 検索語 `q` / 結果 `result` / タグ `tag` / 表示種類 `kind`（道・方法・両方）/ 並び `sort`（recent・helpful・tried）。道カードと方法カードは独立ページング（`page` / `mp`）。ログイン中は各カード右上に既読／未読バッジ。道カード 2 件のあとに広告枠 1 つ（`ADS_ENABLED` 時のみ） |
| `/experiences/[id]` | 道の詳細（`id` = 公開 Attempt の id）。「この人がたどった道」枝分かれ表示、見出し右に「参考になった」（いいね）ボタン。ログイン中に開くと既読登録。道の内容のあとに広告枠 1 つ（`ADS_ENABLED` 時のみ）、右サイドに「この情報について」＋「自分の道を作る」CTA |
| `/experiences/paths` | 道の見える化（一覧）。枝分かれ＋各方法から詳細への導線 |
| `/try` | **SNS 向け簡易登録**。ログイン不要・1 画面・最小 3 入力（困っていたこと／試したこと／試した結果）。`?problem=` で困っていたことを事前入力可。OGP / Twitter カード設定あり。`robots: noindex` |
| `/login` | ログイン（Google、または開発時はモックログイン） |
| `/terms` | 利用について（機械的大量取得・外部 AI 学習利用の禁止など） |

### 本人用（ログイン必須・`/me/*`）

| パス | 内容 |
| --- | --- |
| `/me` | 自分の道の一覧。各道の公開中／確認中の件数、道の公開・非公開 |
| `/me/account` | **アカウント設定**。あなたのデータ（自分の道／試したこと／公開した経験 の件数）＋アカウント削除。プロフィール編集項目は持たない |
| `/me/roads/new` | 道を作る（段階入力可） |
| `/me/roads/[roadId]` | 道の詳細（本人ビュー）。試したことの一覧、公開トグル、道の公開設定、編集、削除 |
| `/me/roads/[roadId]/edit` | 道を編集。**タイトル・できなくなったことは一度値が入ると変更不可** |
| `/me/roads/[roadId]/attempts/new` | 試したことを記録（音声入力対応、タグ、**公開トグルは新規で既定 ON**） |
| `/me/roads/[roadId]/attempts/[attemptId]/edit` | 記録を編集 |

**広告は `/me/*`・各フォーム・ログイン画面には出さない。**

### 管理画面（運営者用・`/admin/*`／一般ヘッダー・フッターは非表示）

| パス | 内容 |
| --- | --- |
| `/admin` | ダッシュボード。「確認が必要」→「現在の状況」→「最近の動き」→「管理メニュー」 |
| `/admin/login` | 運営者ログイン（メール＋パスワード、10 回失敗で約 1 分ロック） |
| `/admin/moderation` | 確認待ちの**経験**キュー（古い順）。困ったこと→試したこと→結果／AI の理由・カテゴリ／SNS 簡易登録の運営メモ。公開する／公開しない |
| `/admin/roads` | 確認待ちの**道**キュー（状態フィルタ・検索） |
| `/admin/roads/[roadId]` | 道の全項目＋AI 判定＋この道の経験一覧＋操作ログ |
| `/admin/posts` | 全経験の一覧（状態フィルタ・キーワード検索）。公開停止・再公開・AI 再チェック |
| `/admin/posts/[attemptId]` | 経験の全項目＋AI 判定＋操作ログ |
| `/admin/audit` | 全操作ログ（誰が・いつ・何を・どの対象に） |

---

## 5. 主な機能

### 5.1 経験の記録と公開

1. `/me/roads/new` で道を作る。作成時に「できなくなったこと」から**ローカル AI**（任意）でタイトルを補える。
2. 道に「試したこと」を追加。結果は 5 分類から選ぶ。
3. 公開トグル（新規は既定 ON）で「経験として公開」する。
4. 道の公開範囲（`visibility`）は**既定 public**。道の詳細画面でいつでも非公開に切り替え可能。
5. タイトル・できなくなったことは一度確定すると変更不可（道の同一性を保つため）。

### 5.2 経験の検索・閲覧

- 検索対象カラム: `roads.difficulty` / `roads.situation` / `roads.goal` / `roads.previouslyAble` /
  `attempts.method` / `attempts.memo` / `tags.name`。
- 検索語が**困りごと・目標・場面・タグ**に当たれば「道カード」、**方法本文・気づき**にだけ当たれば「方法カード」。
- 「表示する種類」の選択肢は **道 → 方法 → 両方** の順。**既定は「道だけ」**（`kind=road`）。方法カードは `method` / `both` に切り替えたときだけ出る。
- 検索条件はすべて URL クエリに乗る。他ページから素の `/experiences` に戻ったときは、同じセッション内の前回の検索を自動復元する（`RestoreSearch`／`sessionStorage`）。タブを閉じるか、記憶から 60 分（`RESTORE_MAX_AGE_MS`）経つとリセット。「条件をクリア」で即時に忘れる。
- ページング上限: `limit ≤ 50`、`page ≤ 100`、かつ `(page-1)*limit < 500`（超過は 400）。全件取得 API は無い。
- 内部 ID（`user_id` / `google_sub` / `road_id`）は公開レスポンスに出さない。

### 5.3 AI 内容モデレーション

**目的**: 運営が不適切な内容（個人情報・医療的断定・誹謗中傷・宣伝・公序良俗違反）を止める。

- **経験の公開**（Attempt を `isPublished=true` で作成／公開中の本文を編集）→ AI 審査。
- **道の登録・編集**（審査対象項目が変わったとき）→ AI 審査。
- 判定: `ok` → 自動的に **公開（approved）** ／ `ng`・`unknown`（`ANTHROPIC_API_KEY` 未設定を含む）
  → **確認待ち（pending）** になり運営レビューへ。
- **公開ゲートは 1 箇所に集約**（`src/lib/search.ts#PUBLIC_ATTEMPT_WHERE`）:
  公開面に出るのは「Attempt が `isPublished` かつ `approved`」**かつ**「その親 Road も `approved`」のときだけ。
- `AI_MODERATION_ENABLED=false` で審査を無効化（AI を呼ばず即 approved）。E2E は自動で false。
- 運営が手動で `approved` / `rejected` にした後は、AI 再チェックを通さない限り状態は変わらない。
- 状態は `pending` / `approved` / `rejected` の 3 値。`Attempt` と `Road` の両方に持つ。

### 5.4 SNS 向け簡易登録（`/try`）

- ログイン不要。氏名・連絡先などの個人情報フィールドは持たない。
- 入力は困っていたこと／試したこと（各 400 字以内・trim・制御文字除去・空白畳み込み）／結果の 3 つ。
- 保存: 匿名の受け皿となるシステム利用者（Google ログイン不可・公開面に出ない）が所有する
  `Road`（`difficulty` のみ・`visibility=private`・`moderationStatus=approved`）＋
  `Attempt`（`isPublished=true` だが **`moderationStatus=pending` 固定**。AI 判定に関わらず自動公開しない）。
- 通常の書き込み（60/分）より厳しい **6/分・IP 単位** のレート制限。
- 運営が `/admin/moderation` で確認して公開する。運営メモに「SNSからの簡易登録（未ログイン）」が付く。

### 5.5 いいね（参考になった）

- **他人の公開経験**にのみ。自分の経験にはボタンを出さず、API でも `403`。
- 経験詳細（`/experiences/[id]`）の「この人がたどった道」見出しの右。未評価＝灰色の輪郭「参考になった」、
  評価済み＝赤い塗り「参考になりました」。色だけに頼らず `aria-pressed` と文言で状態を示す。
- **いいね数はどこにも表示・返却しない。検索順位にも使わない。**
- 1 ユーザー 1 経験につき 1 件（DB UNIQUE）。取り消し可。未ログインで押すとログインへ誘導。
- いいねを受けると投稿者へ通知（`notifications.type = "attempt_liked"`）。誰がいいねしたかは持たない。
  ログイン後トップの最上部に「あなたの経験に『いいね』が届いています。」のボックス（件数・氏名なし）。
  「閉じる」で全既読化。取り消しても出した通知は消さない。

### 5.6 既読 / 未読

- 検索して見つけた経験を「自分がもう見たか」を判別するための、完全に個人用の状態。
- **検索結果に出ただけでは既読にしない。** 経験詳細を開いた時点で登録（クライアントから 1 回 POST、
  失敗しても表示は妨げない）。未ログイン・自分の経験のときは登録しない。
- 検索結果カード（道カード・方法カード）の右上に「✓ 既読 / ○ 未読」バッジ（アイコン＋文字）。
  未読は淡い緑、既読は白の背景。**既読数・閲覧数は表示しない。検索順位にも使わない。**
- 検索の絞り込みに **「既読だけ / 未読だけ」**（`?read=read` / `?read=unread`）。ログイン中のみ表示・有効
  （未ログインは無視）。道カードは「その道の公開経験を 1 つでも読んだか」で判定。
- ユーザーごとの状態。`attempts` に `is_read` は追加しない（専用テーブル `attempt_reads`）。

### 5.7 アカウント設定・削除

- `/me/account` で「自分の道／試したこと／公開した経験」の件数を表示（カウンターカラムを持たず毎回集計）。
- ヘッダー右上はユーザーメニュー（アカウント設定／ログアウト）。「アカウントを削除」はメニューに直接置かない。
- 削除は確認パネル（消えるもの・取り消せないこと・Google アカウントは残ることを明示）を挟む。
- `DELETE /api/v1/me`: 認証セッションの本人のみ。`user` を消すと FK の `ON DELETE CASCADE` で
  `roads` → `attempts` → `road_tags` / `attempt_likes` / `attempt_reads` / `notifications` まで一括削除
  （本人が公開していた経験も検索・閲覧から消える）。`tags`（共有マスタ）と Google アカウントには触れない。
  削除後にセッション Cookie を破棄。匿名受け皿ユーザーは削除不可（`403`）。

### 5.8 広告

- 表示は **検索一覧**（道カード 2 件のあと・3 件以上あるときだけ 1 枠）と **道詳細**（内容のあと・
  CTA より前に 1 枠）の **2 画面のみ**。トップ・自分の道・各フォーム・ログイン・アカウントには出さない。
- `ADS_ENABLED=true` のときだけ描画。無効時は何も描画しない（レイアウトに影響を残さない）。
  広告プロバイダは未接続で、有効時も控えめなプレースホルダのみ。
- 経験カード（白＋緑の実線枠の `<article>`）とは明確に別（生成り背景＋破線枠＋「広告」表示、
  `<aside aria-label="広告">`）。経験情報に見せない。
- **検索順位には一切影響しない。** 広告はレンダリング時に結果へ差し込むだけ（検索ロジック無変更）。
- ターゲティングは非個人情報のみ: 検索語／道の記述を `src/lib/ads.ts` が「動作カテゴリ」
  （clothing / cooking / mobility …）にだけ変換。生テキスト・氏名・病名・健康状態は出力しない。
  広告データは DB に持たない（外部配信）。

### 5.9 AI 補助（断定しない）

- `POST /api/v1/ai/experience-search`（いまの状況から探すヒント）、
  `POST /api/v1/ai/summarize-experiences`（経験の整理）。いずれも補助レイヤーで、
  `ANTHROPIC_API_KEY` 未設定ならスタブ応答。医療的助言・診断はしない。
- ローカル AI（Ollama 互換、任意）: 道タイトルの自動生成のみ。`LOCAL_AI_MODEL` 未設定なら無効。

---

## 6. データモデル

| テーブル | 主なカラム | 関係・削除 |
| --- | --- | --- |
| `users` | `google_sub`(unique), `display_name`, `avatar_url` | → roads / attempt_likes / attempt_reads / notifications（すべて cascade） |
| `roads` | `user_id`, `title?`, `previously_able?`, `difficulty?`, `goal?`, `started_at?`, `situation?`, `memo?`, `status?`, `progress?`, `next_action?`, `visibility`(既定 **public**), `moderation_status`(既定 pending) ＋ AI 判定・手動判断カラム | `user` cascade。attempts / road_tags は cascade |
| `attempts` | `road_id`, `method`, `result`(enum 5), `tried_at?`, `memo?`, `achievement_percent?`, `feeling?`, `state_after?`, `next_action?`, `previous_attempt_id?`, `is_published`(既定 false／フォームは新規 ON), `moderation_status`(既定 pending) ＋ AI 判定・手動判断カラム | `road` cascade。likes / reads / notifications は cascade。`previous_attempt` は SetNull |
| `tags` | `name`(unique) | 共有マスタ。ユーザー削除では消えない |
| `road_tags` | `road_id` + `tag_id`（複合 PK） | 両側 cascade |
| `admin_users` | `email`(unique), `password_hash`(scrypt), `display_name?`, `is_active`, `last_login_at?` | 利用者とは無関係 |
| `admin_audit_logs` | `admin_id`, `action`, `attempt_id?`, `road_id?`, `detail?`, `created_at` | `admin` cascade。ログは消せない |
| `attempt_likes` | `attempt_id` + `user_id`（UNIQUE）, `created_at` | 両側 cascade |
| `attempt_reads` | `user_id` + `attempt_id`（UNIQUE）, `read_at` | 両側 cascade |
| `notifications` | `user_id`, `type`(`attempt_liked`), `attempt_id?`, `is_read`, `created_at` | user / attempt cascade |

- `ModerationStatus` enum: `pending` / `approved` / `rejected`。
- `Visibility` enum: `private` / `public`（既定 public）。
- **`attempt_photos` は廃止済み。** 画像関連カラム・オブジェクトストレージは存在しない。

---

## 7. API サーフェス（`/api/v1`）

詳細・リクエストボディは [`api.md`](api.md)。認証は JWT セッション Cookie。

| 区分 | エンドポイント |
| --- | --- |
| 認証 | `POST /auth/google`, `POST /auth/logout`, `GET /me`, **`DELETE /me`（アカウント削除）** |
| 道（本人） | `GET/POST /roads`, `GET/PATCH/DELETE /roads/{roadId}`, `GET /roads/{roadId}/paths` |
| 試したこと（本人） | `GET/POST /roads/{roadId}/attempts`, `GET/PATCH/DELETE /attempts/{attemptId}` |
| 経験（公開） | `GET /experiences`, `GET /experiences/{id}`, `GET /experiences/paths` |
| タグ（公開） | `GET /tags`, `GET /tags/{tagId}/experiences` |
| 簡易登録（公開） | `POST /quick-experiences` |
| いいね（本人） | `POST/DELETE /attempts/{attemptId}/like` |
| 既読（本人） | `POST /attempts/{attemptId}/read` |
| 通知（本人） | `POST /notifications/read` |
| AI 補助 | `POST /ai/experience-search`, `POST /ai/summarize-experiences` |
| 管理（運営者） | `POST /api/admin/login`, `POST /api/admin/logout`, `POST /api/admin/moderation/{attemptId}`, `PATCH /api/admin/posts/{attemptId}`, `POST /api/admin/posts/{attemptId}/recheck`, `PATCH /api/admin/roads/{roadId}`, `POST /api/admin/roads/{roadId}/moderate`, `POST /api/admin/roads/{roadId}/recheck` |
| 開発専用 | `POST/DELETE /api/test/login`（`E2E_TEST_LOGIN=true` のときのみ） |

**共通:** エラーは `{ "error": { "code", "message", "details"? } }`。
`code`: `bad_request`(400) / `unauthorized`(401) / `forbidden`(403) / `not_found`(404) /
`conflict`(409) / `payload_too_large`(413) / `unsupported_media_type`(415) / `rate_limited`(429) / `internal`(500)。

**公開 GET のガード:** IP 単位のレート／バースト制限、`page` 高速連続巡回・同一クエリ連打の検知 →
`429`（`Retry-After` 付き、悪質時は一時ブロック）。既知の AI クローラー UA は `403`。
全レスポンスに `X-Robots-Tag: noai, noimageai`。

---

## 8. 非機能・プライバシー・不正対策

| 項目 | 方針 |
| --- | --- |
| アクセシビリティ | WCAG 2.1 A/AA。色だけで情報を伝えない、ラベルと `aria-*` の関連付け、キーボード操作、文字サイズトグル（標準／大／特大）、`prefers-reduced-motion` 尊重。主要画面は axe-core で重大違反 0 を確認 |
| レート制限 | メモリ内（単一プロセス前提）。プリセット: 書き込み 60/分、AI 15/分。簡易登録は 6/分・IP 単位 |
| スクレイピング対策 | `src/middleware.ts`（IP ブロックリスト・AI クローラー UA 遮断）＋ `src/lib/bot-guard.ts`（巡回・バースト検知）＋ ページング上限＋ `robots.txt`（`/api/` `/me/` `/login` `/admin/` `/try` を Disallow、AI クローラーは全体不可） |
| 個人情報 | ユーザー属性は最小限。公開経験に氏名・アバターを含めない。画像投稿なし。AI 審査・広告カテゴリ変換に個人識別情報を渡さない。アクセスログの識別子は匿名化 |
| モデレーション独立性 | 管理者セッションは利用者と別 Cookie・別テーブル。ガードは middleware ではなく Server Component layout ＋ API ハンドラ |
| 監査 | 管理操作は `admin_audit_logs` に記録。消せない |

---

## 9. 技術スタック

| 領域 | 採用 |
| --- | --- |
| フロント／バック | Next.js 15（App Router, TypeScript）フルスタック・1 リポジトリ |
| DB | PostgreSQL 16 + Prisma 6（`@@map`/`@map` でスネークケース物理名） |
| 認証（利用者） | Auth.js（NextAuth v5）+ Google OAuth、JWT セッション Cookie。DB アダプタは使わず `users` を自前 upsert |
| 認証（管理者） | `node:crypto` の scrypt パスワード＋HMAC-SHA256 署名トークン（鍵は `AUTH_SECRET`） |
| AI | Anthropic Claude（`@anthropic-ai/sdk`）。キー未設定時はスタブ。ローカル AI は Ollama 互換（任意） |
| スタイル | Tailwind v4（`@theme` のデザイントークン `src/styles/tokens.css`） |
| 画像・写真 | ユーザー投稿なし。`next/image` はサイト内静的アセットのみ |
| テスト | Vitest（unit / integration、実 DB）、Playwright + axe-core（E2E / a11y）。現況: Vitest 203 / Playwright 106 |
| インフラ（開発） | docker compose（PostgreSQL のみ、ホスト側ポート 5433） |
| 本番ホスティング | 未確定（標準 PostgreSQL + Prisma なので移行容易） |

---

## 10. 設定（環境変数）

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | ○ | PostgreSQL 接続文字列 |
| `AUTH_SECRET` | ○ | 利用者セッション署名＋管理セッション署名の鍵 |
| `SITE_URL` | △ | OGP `og:image` / `og:url` / canonical の絶対 URL 基点。本番は https の本番ドメイン。未設定は `http://localhost:3000` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | △ | Google OAuth。未設定でも公開検索は動く（ログイン画面で未設定の旨を表示） |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | ✕ | 未設定なら AI 補助はスタブ、モデレーションは全件「確認待ち」。既定モデル `claude-sonnet-5` |
| `AI_MODERATION_ENABLED` | ✕ | `false` で公開時の AI 審査を無効化（即 approved）。既定 true。E2E は自動で false |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ✕ | 初期管理者ブートストラップ用（`db:seed` / `admin:create` のみ参照） |
| `ADMIN_SESSION_TTL_HOURS` | ✕ | 管理セッション有効時間（既定 8） |
| `LOCAL_AI_URL` / `LOCAL_AI_MODEL` / `LOCAL_AI_TIMEOUT_MS` | ✕ | ローカル AI（道タイトル自動生成）。`LOCAL_AI_MODEL` 空で無効 |
| `ADS_ENABLED` | ✕ | `true` で検索一覧・道詳細に広告スロットを描画（既定 false。プロバイダ未接続時はプレースホルダのみ） |
| `BLOCKED_IPS` | ✕ | 手動ブロックする IP（カンマ区切り） |
| `ACCESS_LOG_SALT` | ✕ | アクセスログの識別子匿名化ソルト |
| `E2E_TEST_LOGIN` | ✕ | `true` で開発／E2E 用モックログイン（`/api/test/login`）を有効化。**本番では設定しない** |

---

## 11. スコープ外（初期版では実装しない）

- SNS 機能全般: フォロー／フォロワー、コメント、DM、いいね数の公開、ランキング、フィード、プロフィール、自己紹介
- 画像・写真・動画の投稿／添付
- いいね・広告費用による検索順位の操作
- ポップアップ広告・画面全体を覆う広告、トップ画面への広告
- 「アカウントだけ削除して公開経験を匿名で残す」方式
- 他人向けの「道ページ」公開 URL（`road.visibility` はフラグとしては保持）
- 類似検索・全文検索・ベクトル検索（検索は部分一致 `ILIKE`）
- 個人情報・ユーザー識別情報を広告ターゲティングへ渡す設計
