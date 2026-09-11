# できる道 サービス仕様書（現行版）

> この文書は「いま実装されているもの」をまとめた現行仕様書です。
> 決定の経緯・変更履歴は [`implementation-decisions.md`](implementation-decisions.md)、
> API の詳細は [`api.md`](api.md)、運営者向けの手順は [`admin-manual.md`](admin-manual.md) を参照してください。
> 最終更新: 2026-09-11

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
| **道**（Road） | `roads` | 一人の「困りごと・目標」から始まる試行錯誤のまとまり。以前できていたこと／できなくなったこと／やりたいこと／場面／進捗／次に試すこと／メモ／タグ など。一覧の見出しは「できなくなったこと」 |
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
| `/experiences` | 経験を探す。**道カード**（困りごと別）と**方法カード**（検索語が方法本文に当たったもの）を出し分け。フィルタ: 検索語 `q` / 結果 `result` / タグ `tag` / 表示種類 `kind`（道・方法・両方）/ 並び `sort`（recent・helpful・tried）/ AIアシスト `ai=1`（§5.2.1）。道カードと方法カードは独立ページング（`page` / `mp`）。ログイン中は各カード右上に既読／未読バッジ。道カード 2 件のあとに広告枠 1 つ（`ADS_ENABLED` 時のみ） |
| `/experiences/[id]` | 道の詳細（`id` = 公開 Attempt の id）。「この人がたどった道」枝分かれ表示、見出し右に「参考になった」（いいね）ボタン。ログイン中に開くと既読登録。道の内容のあとに広告枠 1 つ（`ADS_ENABLED` 時のみ）、右サイドに「この情報について」＋「自分の道を作る」CTA |
| `/experiences/paths` | 道の見える化（一覧）。枝分かれ＋各方法から詳細への導線 |
| `/try` | **SNS 向け簡易登録**。ログイン不要・1 画面・最小 3 入力（困っていたこと／試したこと／試した結果）。`?problem=` で困っていたことを事前入力可。OGP / Twitter カード設定あり。`robots: noindex` |
| `/login` | ログイン（Google、または開発時はモックログイン） |
| `/terms` | 利用について（機械的大量取得・外部 AI 学習利用の禁止など） |

### 本人用（ログイン必須・`/me/*`）

| パス | 内容 |
| --- | --- |
| `/me` | 自分の道の一覧。カード内に検索の道カードと同じく試したこと（先頭 3 件・方法テキスト＝最大 3 行＋結果）を表示。各方法の右に公開状態（公開中／確認中／見送り／非公開）。カード右上に「公開表示」ボタン（検索で見える経験詳細 `/experiences/{id}` を開く。公開中の経験が 1 件以上あるときだけ押せる）。試したことが 1 件も無い道があるときは「試したことを記録すると経験として公開されます」のカードを上部に出す。各道の公開中／確認中の件数 |
| `/me/account` | **アカウント設定**。あなたのデータ（自分の道／試したこと／公開した経験 の件数）＋アカウント削除。プロフィール編集項目は持たない |
| `/me/roads/new` | 道を作る（段階入力可） |
| `/me/roads/[roadId]` | 道の詳細（本人ビュー）。試したことの一覧、各試したことの公開トグル、道の編集、削除 |
| `/me/roads/[roadId]/edit` | 道を編集。**できなくなったことは一度値が入ると変更不可** |
| `/me/roads/[roadId]/attempts/new` | 試したことを記録（音声入力対応、タグ、**公開トグルは新規で既定 ON**） |
| `/me/roads/[roadId]/attempts/[attemptId]/edit` | 記録を編集 |

**広告は `/me/*`・各フォーム・ログイン画面には出さない。**

### 管理画面（運営者用・`/admin/*`／一般ヘッダー・フッターは非表示）

| パス | 内容 |
| --- | --- |
| `/admin` | ダッシュボード。「確認が必要なもの」→「現在の状況」→「最近の動き（最近公開された経験／最近の管理操作）」→「管理メニュー（2×2・4 項目）」。準備中の項目は表示しない |
| `/admin/login` | 運営者ログイン（メール＋パスワード、10 回失敗で約 1 分ロック） |
| `/admin/moderation` | 確認待ちの**経験**キュー（新しい順）。困ったこと→試したこと→結果／AI の理由・カテゴリ／SNS 簡易登録の運営メモ。公開する／公開しない／**保留**（今は公開できない記録を却下せず脇に置く。上部で「保留していない（既定）／保留している」を切り替え） |
| `/admin/posts` | 全経験の一覧（状態フィルタ・キーワード検索）。公開停止・再公開・AI 再チェック |
| `/admin/posts/[attemptId]` | 経験の全項目＋AI 判定＋操作ログ |
| `/admin/seed-data` | 仮データ管理（一覧・状態・作成日時・AI生成表示／1 件ずつ 編集・公開・非公開・削除） |
| `/admin/seed-data/generate` | AI 仮データ生成（キーワード＋件数 → 確認・編集 → 非公開で保存） |
| `/admin/seed-data/[roadId]/edit` | 仮データ 1 件の編集 |
| `/admin/audit` | 全操作ログ（誰が・いつ・何を・どの対象に） |

---

## 5. 主な機能

### 5.1 経験の記録と公開

1. `/me/roads/new` で道を作る。「できなくなったこと」が一覧の見出しになる（別途タイトルは持たない）。
2. 道に「試したこと」を追加。結果は 5 分類から選ぶ。
3. 公開トグル（新規は既定 ON）で「経験として公開」する。
4. できなくなったことは一度確定すると変更不可（道の同一性を保つため）。

道そのものに公開 / 非公開の設定は無い（**道は公開前提**）。公開面に出るかどうかは、その道で
「経験として公開」した Attempt が承認済みかどうかだけで決まる。

### 5.2 経験の検索・閲覧

- 検索対象カラム: `roads.difficulty` / `roads.situation` / `roads.goal` / `roads.previouslyAble` /
  `attempts.method` / `attempts.memo` / `tags.name`。
- 検索語が**困りごと・目標・場面・タグ**に当たれば「道カード」、**方法本文・気づき**にだけ当たれば「方法カード」。
- 「表示する種類」の選択肢は **道 → 方法 → 両方** の順。**既定は「道だけ」**（`kind=road`）。方法カードは `method` / `both` に切り替えたときだけ出る。
- 道カードの既定並び（`sort=recent`）は `roads.updatedAt` 降順。**その道の経験が公開可（`approved`）になったときも `updatedAt` が進む**ので、新しい公開経験が付いた道が上に来る。`helpful` / `tried` は従来どおり。
- 検索条件はすべて URL クエリに乗る。他ページから素の `/experiences` に戻ったときは、同じセッション内の前回の検索を自動復元する（`RestoreSearch`／`sessionStorage`）。タブを閉じるか、記憶から 60 分（`RESTORE_MAX_AGE_MS`）経つとリセット。「条件をクリア」で即時に忘れる。
- ページング上限: `limit ≤ 50`、`page ≤ 100`、かつ `(page-1)*limit < 500`（超過は 400）。全件取得 API は無い。
- 内部 ID（`user_id` / `google_sub` / `road_id`）は公開レスポンスに出さない。

#### 5.2.1 AIアシスト検索（Phase 1）

`/experiences` の「AIで探す」チェックを入れて検索すると `?ai=1` が付き、次の追加処理が入る
（チェック無し＝従来の純キーワード検索と完全に同じ。AI は経験を生成せず、検索語を広げるだけ）。

1. **意図展開** `expandSearchIntent`（`src/lib/ai/search.ts`）が困りごと文を関連語・言い換えに展開する。
   `ANTHROPIC_API_KEY` 未設定・AI 失敗時は決定的なローカル展開にフォールバックし、展開語（`terms`）は必ず 1 つ以上返る。
   AI 出力は文字列のみ・各 30 字以内・最大 8 語・先頭は必ず元フレーズ、に正規化する。
2. **ハイブリッド絞り込み** `terms` を `buildExperienceWhere` 系（`src/lib/search.ts`）へ渡し、
   既存の対象カラム（困りごと・目標・場面・以前できていた・タグ／方法本文・気づき）への `ILIKE` OR を語ごとに増やす。
3. **関連度の並べ替え** 取得後の 1 ページ分だけ `rankBySearchRelevance`（`src/lib/search-rank.ts`）で
   スコア降順に安定ソート（DB の並び順・`buildExperienceOrderBy` は変えない。helpful/tried と同じ後処理）。
4. **フォールバック** AIアシストで 0 件なら、同じクエリを `terms` 無しで再検索して通常のキーワード結果を返す。

公開ゲートは `PUBLIC_ATTEMPT_WHERE` のまま。非公開・未承認データが `ai=1` 経路で混ざることはない。
`POST /api/v1/ai/experience-search` も同じ `expandSearchIntent` を返す（`{ keywords, terms, rephrased, disclaimer }`）。

**Phase 2（未着手・保留）**: pgvector + Embedding によるベクトル類似検索。必要になるインフラ・判断＝
docker イメージを `pgvector/pgvector:pg16` へ差し替え／本番 DB コンテナ入れ替え／`CREATE EXTENSION vector`／
Embedding 専用テーブルと公開・非公開・編集・削除に追随する同期＋バックフィル／
Embedding プロバイダの選定（Anthropic に Embeddings API は無い。モデル名は環境変数化しハードコードしない）。

### 5.3 AI 内容モデレーション

**目的**: 運営が不適切な内容（個人情報・医療的断定・誹謗中傷・宣伝・公序良俗違反）を止める。

- **経験の公開**（Attempt を `isPublished=true` で作成／公開中の本文を編集）→ AI 審査。
  審査本文には、その経験が属する道の記述（できなくなったこと／やりたいこと／場面／
  以前できていたこと）・タグも含める（道の公開テキストも 1 回はチェックされる）。
- 判定: `ok` → 自動的に **公開（approved）** ／ `ng`・`unknown`（`ANTHROPIC_API_KEY` 未設定を含む）
  → **確認待ち（pending）** になり運営レビューへ。
- **公開ゲートは 1 箇所に集約**（`src/lib/search.ts#PUBLIC_ATTEMPT_WHERE`）:
  公開面に出るのは「Attempt が `isPublished` かつ `approved`」のときだけ。**道 (Road) 自体は
  モデレーション状態を持たない**。道が公開面に出るかは「承認済みの公開経験を 1 つ以上持つか」で決まる。
- `AI_MODERATION_ENABLED=false` で審査を無効化（AI を呼ばず即 approved）。E2E は自動で false。
- 運営が手動で `approved` / `rejected` にした後は、AI 再チェックを通さない限り状態は変わらない。
- 状態は `pending` / `approved` / `rejected` の 3 値。`Attempt` のみが持つ。

### 5.4 SNS 向け簡易登録（`/try`）

- ログイン不要。氏名・連絡先などの個人情報フィールドは持たない。
- 入力は困っていたこと／試したこと（各 400 字以内・trim・制御文字除去・空白畳み込み）／結果の 3 つ。
- 保存: 匿名の受け皿となるシステム利用者（Google ログイン不可・公開面に出ない）が所有する
  `Road`（`difficulty` のみ）＋
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

#### 5.6.1 既読引き継ぎ（未ログイン⇄ログイン）

経験の検索・閲覧はログイン不要のまま、既読は次のように扱う（2026-09-11）。

- **未ログイン中**：既読にした Attempt id をブラウザの `localStorage` にだけ保存する（個人情報は持たない・
  端末/ブラウザをまたいだ同期はしない＝「このブラウザで見た経験」の意味）。経験詳細を開いた時点で追加、
  検索結果カードは表示後にこの一覧を見てバッジだけを更新する（サーバーには何も送らない）。
- **ログイン中**：従来どおりサーバー側（`attempt_reads`）で管理。挙動は変えない。
- **ログアウト時**：ログアウトの直前にアカウント側の既読 id 一覧を取得し、ブラウザ側へ統合してから
  ログアウトする（**ログアウトしただけで既読を消さない**）。
- **再ログイン時**：ヘッダーがログイン中に描画するタイミングで、ブラウザに残っている既読 id をアカウント側へ
  1 回だけ統合する（集合として統合・重複登録しない）。成功したらブラウザ側は空にする。
- 通信に失敗しても画面上の既読状態は消えない（ログアウト取得の失敗はログアウト自体を止めない。
  統合送信の失敗はブラウザ側の記録を残し、次回また試す）。
- 非公開・削除された経験は、既読履歴があっても検索・詳細に再表示されない（表示は従来どおり
  `PUBLIC_ATTEMPT_WHERE` だけが決める。既読 id はどのページにも「新しい経験」を出現させない）。

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
- 配信は **Google AdSense**。`NEXT_PUBLIC_ADSENSE_CLIENT`（`ca-pub-…`）＋その枠の slot ID
  （`NEXT_PUBLIC_ADSENSE_SLOT_SEARCH` / `_ROAD`）が揃うと `<ins class="adsbygoogle">` を差し込む。
  未設定なら控えめなプレースホルダのまま（dev / 審査前でも壊れない）。site root に `/ads.txt` を配信。
- **非パーソナライズ配信のみ**（行動追跡なし・文脈広告）。各ユニットが push 前に
  `adsbygoogle.requestNonPersonalizedAds = 1` を立てる。`src/lib/ads.ts` の内部カテゴリは
  AdSense へ渡さない（`data-ad-*` は DOM 内ヒント。外部送信なし）。
- 経験カード（白＋緑の実線枠の `<article>`）とは明確に別（生成り背景＋破線枠＋「広告」表示、
  `<aside aria-label="広告">`）。経験情報に見せない。
- **検索順位には一切影響しない。** 広告はレンダリング時に結果へ差し込むだけ（検索ロジック無変更）。
- 広告データは DB に持たない（外部配信）。EEA/UK は CMP 未導入のため配信が絞られる可能性（将来課題）。

### 5.9 AI 補助（断定しない）

- `POST /api/v1/ai/experience-search`（困りごと文 → 検索語の展開。`{ keywords, terms, rephrased, disclaimer }`。
  `/experiences?ai=1` の裏側でもある＝§5.2.1）、
  `POST /api/v1/ai/summarize-experiences`（経験の整理）。いずれも補助レイヤーで、
  `ANTHROPIC_API_KEY` 未設定ならスタブ応答。AI は経験を生成しない。医療的助言・診断はしない。

### 5.10 仮データ（AI 生成サンプル・管理者専用）

本番で検索・経験カード・道の見える化を確認できるよう、管理者が AI でサンプルを用意する機能（`/admin/seed-data`）。

- **位置づけ:** 実ユーザーの体験の捏造ではない。「テスト・サンプル用の仮データ」。一般ユーザーには生成・管理画面を出さない。
- **流れ:** キーワード（テーマ）入力 → AI で 5〜20 件（既定 10）生成 → 画面で確認・編集 → **非公開で保存** → 一覧から **1 件ずつ公開**。
  一括公開・一括削除は無い。1 件 = Road 1 件 + Attempt 1 件。
- **困りごとの生成:** 入力キーワードは種類によって扱いを変える（2026-09-11）。
  - **活動・行動・仕事**（例: 手芸・料理を作る・デスクワーク）: キーワードは「テーマ（活動・場面）」で
    あって困難の原因ではない。そのまま `difficulty` にコピーせず、**そのテーマの中で**「何ができなくて
    困っているのか」＝具体的な行動・作業が「難しい／できない」形の困りごとを件数分別々に生成する
    （抽象語だけ・「サンプル1」等の連番・架空人物の体験談は禁止）。テーマから離れた別活動へ広げない
    （例：「デスクワーク PC」で包丁や階段の困りごとは不可）。**キーワードを文へそのまま差し込むだけの
    生成は禁止**（例：「「手芸」で、細かい手先の作業を…」「手芸することが難しい」）。difficulty に
    キーワードそのものを含める必要はなく、テーマとのつながりは `situation`
    （「〈テーマ〉」に取り組むときの場面）側で保てばよい。
  - **物・道具・場所・設備**（例: 爪切り・箸・リモコン・ハサミ・ドアノブ・階段・浴槽・鍵・ボタン）:
    キーワードそのものが困りごとの対象なので、キーワードを主語にしてよい（むしろ含めた方が自然）。
    「使いにくい／持ちにくい／操作しにくい／握って回すのが難しい」など、道具・設備に合った動詞を選ぶ
    （「使いにくい」を全部の道具に機械的に使い回さない）。キーワードだけからは分からない身体症状
    （震え・麻痺等）を根拠なく付け加えない。
  - **キーワードとの直接的な関連性を最優先する（2026-09-11）**: 生成する困りごとは「そのキーワードから
    一般的に直接連想できる操作・場面」に限定し、そこから何段階も推理を重ねた末の状況（例:
    キーワード「ボタン」から「途中で作業を中断すると再開できない」のような認知・記憶の話を創作する）
    は生成しない。キーワード単体で用途が複数考えられる場合（例:「ボタン」は服／家電／PC など）は、
    特定の用途を勝手に断定せず、キーワードから確実に言える範囲の汎用的な表現を優先する。具体性を
    出すための架空の状況・経緯の付け足しも禁止。この関連性の担保は主に AI 生成時のプロンプト
    （`SEED_SYSTEM_PROMPT`）側の役割であり、コード側の `isConcreteDifficulty` は形式面
    （連番・機械的差し込み・キーワードのコピーそのもの等）の最終防御にとどまる——「キーワードが
    文章に含まれている」ことだけを理由に不合格にはしない（例:「爪切りが使いにくい」は合格のまま）。
  - **「これは物か」を特定の単語リストでは判定しない（2026-09-11）**: この判断は AI（実際に生成する
    ときの LLM）の意味理解に任せ、`爪切り`／`ホッチキス` のような単語をコードへ事前登録する実装は
    持たない。`ANTHROPIC_API_KEY` 未設定時の決定的スタブ（AIを呼べない・意味理解ができない）は、
    既存の 5 分野（deskwork/cooking/outing/cleaning/laundry。テーマ逸脱防止のために元からある分野
    判定）にも当てはまらないキーワードは、原則すべて同じ汎用プール（`NEUTRAL_ASPECTS`）から
    困りごとを作る（道具でも活動でも未知の語でも同じ扱い＝特定の道具名をコードで優遇しない）。
  - **分類が曖昧なキーワード**（例:「料理」が行為・料理そのものの両方に読める場合）: 文字だけで
    無理に分類を固定せず、判断できない場合はもっとも自然で汎用的な困りごとを生成する
    （スタブでは既存の `NEUTRAL_ASPECTS` フォールバックがこれに相当）。
  - AI 出力は分野が別へ寄ったら破棄し、プロンプトで各候補の自己チェックをさせる。`isConcreteDifficulty`
    で検証し（キーワードそのまま・活動系キーワードを主語にした差し込み・連番のいずれかに当てはまる
    候補は破棄。「「キーワード」で、〜」の見出し的な差し込みは物・道具でも禁止）、保存時も zod で
    連番だけの困りごとを弾く。Road に `title` 列は無く、見出しは `difficulty`。
- **複数テーマ:** キーワードをスペース（半角/全角）で区切ると複数テーマとして扱い、1 回の生成で
  全テーマを横断し件数を各テーマにおおよそ均等配分する。件数（5〜20）は変わらず、各 Road は独立。
- **毎回違う結果:** 同じテーマで生成するたびに、過去に作った仮データ（`seed_keyword` で照合）と
  実質的に重複しない別の切り口を返す。過去データは AI にプロンプトで渡し、言い換え重複は
  `nearDuplicate` で検出して捨てる。今回の 10 件どうしも実質的に重複させない。生成件数・非公開保存・
  1 件ずつの公開/非公開/削除は変えない。
- **識別:** `roads.is_seed_data = true` / `data_origin = "ai_seed"`。すべての仮データ操作 API は対象が仮データ Road か検証し、
  そうでなければ 404（実ユーザーデータをこの経路で触れない）。
- **公開:** 管理者が確認済みのため AI 審査は通さず、直接 `is_published=true` / `moderation_status=approved`。
  以降は既存の公開ゲート（`PUBLIC_ATTEMPT_WHERE`）に従って検索等に出る。
- **AI:** 既存の `@/lib/ai/client`（`ANTHROPIC_API_KEY`）を使う。未設定時は決定的なスタブ。
  診断・治療の断定、「必ず改善する」等の保証表現、危険行為の推奨は生成させない。5 分類以外の結果値は `ongoing` に矯正。
  スタブ生成の本文にも「サンプル」等の語は入れない（公開時に通常の経験と同じ見た目になるように）。
- **一般ユーザー表示:** 公開された仮データは**通常の経験とまったく同じ見た目**で出す（2026-09-11）。
  検索結果・経験カード・経験詳細・道の見える化に「サンプル」「仮データ」「AI 生成」等の表示は出さない。
  公開レスポンス（`ExperienceDTO` 等）にも仮データを示すフィールドを含めない。
  仮データの判別は `roads.is_seed_data` / `data_origin` と管理画面（`/admin/seed-data`）でのみ行う。

---

## 6. データモデル

| テーブル | 主なカラム | 関係・削除 |
| --- | --- | --- |
| `users` | `google_sub`(unique), `display_name`, `avatar_url` | → roads / attempt_likes / attempt_reads / notifications（すべて cascade） |
| `roads` | `user_id`, `previously_able?`, `difficulty?`, `goal?`, `started_at?`, `situation?`, `memo?`, `status?`, `progress?`, `next_action?`, `is_seed_data`(既定 false), `data_origin`(既定 `"user"`／仮データは `"ai_seed"`), `seed_keyword?`(仮データの生成テーマ／再生成の重複回避用) | `user` cascade。attempts / road_tags は cascade。道自体はモデレーション状態を持たない |
| `attempts` | `road_id`, `method`, `result`(enum 5), `tried_at?`, `memo?`, `achievement_percent?`, `feeling?`, `state_after?`, `next_action?`, `previous_attempt_id?`, `is_published`(既定 false／フォームは新規 ON), `moderation_status`(既定 pending), `moderation_held`(既定 false／運営の「保留」。公開ゲートには無関係) ＋ AI 判定・手動判断カラム | `road` cascade。likes / reads / notifications は cascade。`previous_attempt` は SetNull |
| `tags` | `name`(unique) | 共有マスタ。ユーザー削除では消えない |
| `road_tags` | `road_id` + `tag_id`（複合 PK） | 両側 cascade |
| `admin_users` | `email`(unique), `password_hash`(scrypt), `display_name?`, `is_active`, `last_login_at?` | 利用者とは無関係 |
| `admin_audit_logs` | `admin_id`, `action`, `attempt_id?`, `road_id?`, `detail?`, `created_at` | `admin` cascade。ログは消せない |
| `attempt_likes` | `attempt_id` + `user_id`（UNIQUE）, `created_at` | 両側 cascade |
| `attempt_reads` | `user_id` + `attempt_id`（UNIQUE）, `read_at` | 両側 cascade |
| `notifications` | `user_id`, `type`(`attempt_liked`), `attempt_id?`, `is_read`, `created_at` | user / attempt cascade |

- `ModerationStatus` enum: `pending` / `approved` / `rejected`。
- **`attempt_photos` は廃止済み。** 画像関連カラム・オブジェクトストレージは存在しない。
- **仮データ（AI 生成サンプル）:** `roads.is_seed_data = true` / `data_origin = "ai_seed"` の Road（＋その唯一の Attempt）。
  管理者が検索体験の確認用に作る。実ユーザーデータとはこのフラグだけで判別する。詳細は §5.10。

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
| 管理（運営者） | `POST /api/admin/login`, `POST /api/admin/logout`, `POST /api/admin/moderation/{attemptId}`, `PATCH /api/admin/posts/{attemptId}`, `POST /api/admin/posts/{attemptId}/recheck` |
| 仮データ（運営者） | `POST /api/admin/seed-data/generate`, `GET/POST /api/admin/seed-data`, `GET/PATCH/DELETE /api/admin/seed-data/{roadId}`, `POST /api/admin/seed-data/{roadId}/publish`, `POST /api/admin/seed-data/{roadId}/unpublish` |
| 開発専用 | `POST/DELETE /api/test/login`（`E2E_TEST_LOGIN=true` のときのみ） |

**共通:** エラーは `{ "error": { "code", "message", "details"? } }`。
`code`: `bad_request`(400) / `unauthorized`(401) / `forbidden`(403) / `not_found`(404) /
`conflict`(409) / `payload_too_large`(413) / `unsupported_media_type`(415) / `rate_limited`(429) / `internal`(500)。

**公開 GET のガード:** IP 単位のレート／バースト制限、`page` 高速連続巡回・同一クエリ連打の検知 →
`429`（`Retry-After` 付き、悪質時は一時ブロック）。既知の AI クローラー UA は `403`。
`X-Robots-Tag` は `middleware.ts` がパス別に付与する: トップ `/` は `index, follow`／
`/login`・`/me*` は `noindex, nofollow`／`/admin*` は `noindex, nofollow, noarchive`（＋ `Cache-Control: no-store`）／
その他の公開ページは `noindex, follow`。いずれも `noai, noimageai` を含む。

---

## 8. 非機能・プライバシー・不正対策

| 項目 | 方針 |
| --- | --- |
| アクセシビリティ | WCAG 2.1 A/AA。色だけで情報を伝えない、ラベルと `aria-*` の関連付け、キーボード操作、文字サイズトグル（標準／大／特大）、`prefers-reduced-motion` 尊重。主要画面は axe-core で重大違反 0 を確認 |
| レート制限 | メモリ内（単一プロセス前提）。プリセット: 書き込み 60/分、AI 15/分。簡易登録は 6/分・IP 単位 |
| スクレイピング対策 | `src/middleware.ts`（IP ブロックリスト・AI クローラー UA 遮断）＋ `src/lib/bot-guard.ts`（巡回・バースト検知）＋ ページング上限＋ `robots.txt`（一般クローラーは `/api/` と `/admin` のみ Disallow、既知 AI クローラーは全体不可） |
| 検索エンジンへの露出 | 索引に載せるのは**トップページ `/` だけ**。他の公開ページは `noindex`（`robots.txt` では塞がずクローラーに `noindex` を読ませる）。`/login`・`/me*`・`/admin*` は `noindex,nofollow`。`sitemap.xml` はトップのみ。方針の詳細は `implementation-decisions.md`（2026-09-10 検索エンジン露出方針） |
| 個人情報 | ユーザー属性は最小限。公開経験に氏名・アバターを含めない。画像投稿なし。AI 審査・広告カテゴリ変換に個人識別情報を渡さない。アクセスログの識別子は匿名化 |
| モデレーション独立性 | 管理者セッションは利用者と別 Cookie・別テーブル。ガードは middleware ではなく Server Component layout ＋ API ハンドラ |
| 管理機能の露出低減 | 公開ページから `/admin` へリンクしない。`sitemap.xml` はトップのみ（`/admin` は載せない）。ログイン画面に「管理画面／管理者／運営者」の語を出さない（`<title>` も「ログイン」）。`/admin/*` は layout metadata ＋ middleware で `noindex,nofollow,noarchive` ＋ `Cache-Control: no-store`。ログインは IP 単位 10/分でロック、失敗メッセージは「メールアドレスまたはパスワードが違います」で存在を漏らさない（ダミーハッシュ検証でタイミング差も抑制）。※URL 秘匿は防御にしない — 認証・認可が本体 |
| 監査 | 管理操作は `admin_audit_logs` に記録。消せない |

---

## 9. 技術スタック

| 領域 | 採用 |
| --- | --- |
| フロント／バック | Next.js 15（App Router, TypeScript）フルスタック・1 リポジトリ |
| DB | PostgreSQL 16 + Prisma 6（`@@map`/`@map` でスネークケース物理名） |
| 認証（利用者） | Auth.js（NextAuth v5）+ Google OAuth、JWT セッション Cookie。DB アダプタは使わず `users` を自前 upsert |
| 認証（管理者） | `node:crypto` の scrypt パスワード＋HMAC-SHA256 署名トークン（鍵は `AUTH_SECRET`） |
| AI | Anthropic Claude（`@anthropic-ai/sdk`）。キー未設定時はスタブ |
| スタイル | Tailwind v4（`@theme` のデザイントークン `src/styles/tokens.css`） |
| 画像・写真 | ユーザー投稿なし。`next/image` はサイト内静的アセットのみ |
| テスト | Vitest（unit / integration、実 DB）、Playwright + axe-core（E2E / a11y）。現況: Vitest 198 / Playwright 106 |
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
| `ADS_ENABLED` | ✕ | `true` で検索一覧・道詳細に広告を描画（既定 false） |
| `NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_ADSENSE_SLOT_SEARCH` / `NEXT_PUBLIC_ADSENSE_SLOT_ROAD` | ✕ | Google AdSense（非パーソナライズ）。空ならプレースホルダのまま |
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
- 全文検索インデックス・ベクトル類似検索（pg_trgm / pgvector / Embedding）。検索は部分一致 `ILIKE` のまま。
  AIアシスト検索（§5.2.1）は「AI が検索語を広げて `ILIKE` OR を増やす」Phase 1 に限る。ベクトル検索は Phase 2 として保留
- 個人情報・ユーザー識別情報を広告ターゲティングへ渡す設計
