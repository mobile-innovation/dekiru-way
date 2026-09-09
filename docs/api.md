# できる道 REST API (v1)

- ベース URL: `/api/v1`
- 形式: JSON。日付は ISO 8601（DATE 型は `YYYY-MM-DD`）。キーは camelCase。
- エラー: `{ "error": { "code": string, "message": string, "details"?: any } }`
  - `code`: `bad_request` (400) / `unauthorized` (401) / `forbidden` (403) / `not_found` (404) /
    `conflict` (409) / `payload_too_large` (413) / `unsupported_media_type` (415) /
    `rate_limited` (429) / `internal` (500)
- 認証: JWT セッション Cookie（Auth.js）。所有者チェックはすべてサーバー側。
- **書き込み（`POST` / `PUT` / `PATCH` / `DELETE`）は同一オリジンからのみ**（CSRF 対策・二重防御）。
  `Sec-Fetch-Site` が `cross-site`／`none`、または `Origin` が自オリジンと不一致なら `403`（`forbidden`）。
  どちらのヘッダも無いリクエスト（サーバ間・CLI・テスト）は従来どおり通す。`GET` は対象外。
- 公開 GET（`/experiences*`, `/tags*`）は認証不要だが**無制限ではない**（追加指示書 v1）:
  - IP 単位のレート/バースト制限、`page` の高速連続巡回・同一クエリ連打の検知 → `429`（`Retry-After` 付き、悪質時は一時ブロック）
  - `limit ≤ 50`、`page ≤ 100`、かつ `(page-1)*limit < 500`（超過は `400`）。全件取得 API は無い
  - 既知の AI クローラー UA は `403`（`GET` でもページでも）。全レスポンスに `X-Robots-Tag: noai, noimageai`
  - レスポンスに内部 ID（`user_id` / `google_sub` / `road_id`）は含めない
  - `robots.txt` で `/api/` と AI クローラーを Disallow。詳細は `docs/implementation-decisions.md` §7-bis

---

## 認証

| メソッド | パス | 認証 | 説明 |
| --- | --- | --- | --- |
| POST | `/auth/google` | 不要 | `{ url: "/api/auth/signin/google", googleConfigured }` を返す。実遷移はフロントの `signIn("google")`。 |
| POST | `/auth/logout` | 任意 | セッション Cookie を破棄。204。 |
| GET | `/me` | 必要 | `{ id, displayName, avatarUrl, createdAt }`。未ログインは 401。 |
| DELETE | `/me` | 必要 | 「できる道」アカウントと本人のサービス内データを削除。204。下記参照。 |

OAuth 本体は Auth.js: `GET/POST /api/auth/*`（`/api/auth/signin/google` など）。

### DELETE /api/v1/me（アカウント削除）

- 削除対象は**認証セッションから取得した本人の `user.id` のみ**。リクエストボディ等で id は受け取らない。
- `users` を消すと FK の `ON DELETE CASCADE` により `roads` → `attempts` → `road_tags` /
  `attempt_likes` / `attempt_reads` / `notifications` まで一括削除（本人が公開していた経験も
  検索・閲覧から消える）。単一 DELETE 文なので原子的（さらに `$transaction` で包む）。
- `tags`（共有マスタ）は残す。Google アカウントそのものには一切触れない。
- 削除後に `signOut()` でセッション Cookie を破棄。
- 匿名簡易登録の受け皿ユーザーは削除不可（`403`）。
- アカウント設定画面（`/me/account`）の件数表示はカウンターカラムを持たず、
  `roads` / `attempts`（本人所有 Road 経由）を毎回 `count` して出す。

---

## Road（本人のみ）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/roads` | 自分の道一覧 `{ items: Road[] }`（新しい更新順） |
| POST | `/roads` | 道を作成。201。 |
| GET | `/roads/{roadId}` | 道の詳細（attempts / tags 込み）。他人は 403、無ければ 404。 |
| PATCH | `/roads/{roadId}` | 部分更新。空ボディは 400。`difficulty` は一度値が入ると変更不可（別の値を送ると `409`。同値・省略は許可）。 |
| DELETE | `/roads/{roadId}` | 削除（attempts は cascade）。204。 |

### Road 作成 / 更新ボディ
```jsonc
{
  "previouslyAble": "string|null", // 以前できていた
  "difficulty": "string|null",     // できなくなった（一覧の見出しにも使う）
  "goal": "string|null",           // やりたいこと
  "startedAt": "YYYY-MM-DD|null",
  "situation": "string|null",
  "memo": "string|null",
  "status": "string|null",
  "progress": "string|null",
  "nextAction": "string|null",
  "tags": ["string", ...]          // 指定時のみ同期。Tag は自動 upsert
}
```
更新はすべて optional。`tags` を省略するとタグは変更されない。
`difficulty` は「まだ空なら初回だけ設定可、値が入ったら以後は変更不可」（道の同一性を保つため）。

#### 道の公開について

道 (Road) 自体はモデレーション状態を持たない。道が公開検索 (`/experiences*`, `/tags*`) に
出るかは、**その道で「経験として公開」した Attempt が AI 審査を通って `approved` になるか**
だけで決まる。経験公開時の AI 審査本文には、その道の記述（`difficulty` / `goal` /
`situation` / `previouslyAble`）・タグも含まれる。

---

## Attempt（本人のみ）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/roads/{roadId}/attempts` | 一覧（時系列: triedAt→createdAt 昇順） |
| POST | `/roads/{roadId}/attempts` | 追加。201。 |
| GET | `/attempts/{attemptId}` | 単体（編集用ビュー） |
| PATCH | `/attempts/{attemptId}` | 部分更新（公開/非公開の切替もここ） |
| DELETE | `/attempts/{attemptId}` | 削除。204。 |

### Attempt 作成 / 更新ボディ
```jsonc
{
  "method": "string",   // 必須（作成時）
  "result": "success|partial|no_change|failed|ongoing", // 必須（作成時）
  "triedAt": "YYYY-MM-DD|null",
  "memo": "string|null",
  "isPublished": false, // 既定 false

  // v6（すべて任意・NULL 可）
  "achievementPercent": 60,      // 0〜100 の整数。本人入力の「できた％」。AI 計算しない。result とは独立
  "feeling": "string|null",      // そのときの気持ち（成功時に限らない）
  "stateAfter": "string|null",   // その方法を試した後の状態（result より具体的）
  "nextAction": "string|null",   // この方法のあと次に試すことにしたこと（Road.nextAction とは別）
  "previousAttemptId": "uuid|null" // 実際にこの方法の前に試した Attempt（同じ Road のみ・自己参照/循環不可）
}
```
`failed` も他の結果と同じ経路で保存される。
`achievementPercent` が範囲外 / `previousAttemptId` が別 Road・自己・循環 のときは `400`。
公開 Attempt では v6 の項目も経験（`/experiences`）の公開情報として返る。非公開 Attempt では一切返さない。

#### 公開時の AI モデレーション

`isPublished` を `true` にして作成/更新すると、その場で AI 審査が走る（`AI_MODERATION_ENABLED=false` なら即承認）。
レスポンスの Attempt には次が含まれる:

```jsonc
{
  "moderationStatus": "pending|approved|rejected",
  "moderationHeld": false,                               // 運営が「保留」にしたか（管理画面だけの区別）
  "publishState": "private|reviewing|published|rejected", // 本人向けの表示状態（保留中も reviewing）
  "aiVerdict": "ok|ng|unknown|null",
  "aiReason": "string|null"
}
```

- `ok` → `approved`（そのまま公開）
- `ng` / `unknown`（`ANTHROPIC_API_KEY` 未設定時も含む）→ `pending`（公開検索に出ない。運営レビュー待ち）
- 公開中の Attempt の本文（`method`/`memo`/`feeling`/`stateAfter`/`nextAction`）を変更した場合も再審査され、
  `ng`/`unknown` なら `pending` に戻る。
- 公開検索（`/experiences*`・`/tags*`）に出るのは `isPublished=true` かつ `moderationStatus=approved` のものだけ。

---

## 画像・写真について

**「できる道」は画像・写真の投稿／添付を扱わない**（プライバシー保護のため、サービス側で画像そのものを
受け付けない）。写真アップロード API・`attempt_photos` テーブル・オブジェクトストレージは廃止済み。
Attempt / Experience のレスポンスに画像フィールドは含まれない。

---

## Experience（公開・ログイン不要）

「経験」= `isPublished = true` の Attempt。

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/experiences` | 検索。クエリ: `q`, `result`, `tag`, `read`(`read`｜`unread`・ログイン中のみ効く), `page`(1–100), `limit`(1–50, 既定 20), `sort`(`recent`\|`helpful`\|`tried`)。`(page-1)*limit ≥ 500` は `400`。<br>`{ items: Experience[], page, limit, total, hasMore }` |
| GET | `/experiences/{id}` | `id` = Attempt id（UUID）。`Experience & { siblings: {id,method,result,triedAt,isCurrent}[] }`。非公開・不存在・不正 ID は 404。 |
| GET | `/experiences/paths` | 道の見える化。クエリ: `q`, `tag`, `limit`(1–20, 既定 6)。<br>`{ items: { key, difficulty, goal, previouslyAble, tags, steps: {experienceId,method,result,triedAt}[] }[] }`（`key` は内部 road_id ではなく先頭経験の id） |

### Experience オブジェクト
```jsonc
{
  "id": "attempt-uuid",
  "method": "string",
  "result": "success|partial|no_change|failed|ongoing",
  "triedAt": "YYYY-MM-DD|null",
  "memo": "string|null",
  "createdAt": "ISO",
  "road": {
    "previouslyAble", "difficulty", "goal", "situation",
    "progress", "nextAction", "startedAt", "tags": ["string"]
  },
  "siblings"?: [{ "id", "method", "result", "triedAt", "isCurrent" }],  // 詳細取得時のみ
  "like": { "isMine": bool, "canLike": bool, "likedByMe": bool },  // 閲覧者から見たいいね状態。数は返さない
  "isRead": bool  // 閲覧者がこの経験を既に開いたか。未ログインは false。既読数は返さない
}
```
`like` / `isRead` は Cookie のセッションから閲覧者を解決して埋める（未ログインは `like` 全て `false`、
`isRead` は `false`）。`isMine`= 投稿者本人 / `canLike`= ログイン済みかつ本人でない / `likedByMe`= いいね済み。
**いいね数・既読数（件数）は API のどのレスポンスにも含めない。**
`GET /experiences`（一覧）の各 item にも同じ `like` / `isRead` が入る。

検索対象カラム（指示書 13）: `roads.difficulty` / `roads.situation` / `roads.goal` /
`roads.previouslyAble` / `attempts.method` / `attempts.memo` / `tags.name`。
検索順位はいいねの影響を受けない（`sort=helpful` は結果種別による並びで、いいねとは無関係）。

---

## 簡易登録（SNS 向け・ログイン不要）

SNS からの流入者が、1 件の「試したこと」だけを最小入力で登録するための口。
画面は `/try`（`?problem=` で「困っていたこと」を先に埋められる）。

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/v1/quick-experiences` | `{ difficulty, method, result }`。ログイン不要。`201 { ok: true }`。 |

- `difficulty`（困っていたこと）/ `method`（試したこと）: 必須。前後 trim・制御文字除去・
  行内の連続空白は 1 つに畳む。各 400 文字以内。
- `result`（試した結果）: `success｜partial｜no_change｜failed｜ongoing` のいずれか。
- 氏名・連絡先などの個人情報は受け取らない（フィールド自体が無い）。
- 未ログインのため、通常の書き込み（60/分）より厳しい **6/分・IP 単位** のレート制限。
- 保存のされ方: 受け皿となる 1 つのシステム利用者（Google ログイン不可・公開面に出ない）が
  所有する `Road`（`difficulty` のみ・`approved`）＋ `Attempt`（`method`/`result`・
  `isPublished=true` だが **`moderationStatus=pending` 固定**）。AI 判定は参考情報として
  記録するだけで、pending は覆さない。
- 公開されるには管理者の承認が要る。`/admin/moderation` のキューに通常の経験と同じ形で並び、
  運営メモに「SNSからの簡易登録（未ログイン）」が付く。

---

## いいね / 通知（ログイン必須）

公開された経験（他人の Attempt）に「参考になった」を送る。人気度・ランキング・検索順位には
一切使わず、投稿者へ「役に立った」ことを伝えるためだけの機能。**いいね数はどこにも返さない。**

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/v1/attempts/{attemptId}/like` | いいねする。`200 { liked: true }`。冪等（二重でも 200、行は増えない） |
| DELETE | `/api/v1/attempts/{attemptId}/like` | 自分のいいねを取り消す。`204`。付いていなくても `204`（冪等）。**通知は消さない** |
| POST | `/api/v1/notifications/read` | 自分の未読通知をすべて既読化。`204`。トップの通知ボックスの「閉じる」から呼ぶ |

検証（すべてサーバ側 `src/lib/likes.ts`）:

- 未ログイン → `401`
- 自分の経験 → `403`「自分の経験にはいいねできません」（フロントで隠すだけでなく API でも拒否）
- 非公開 / 存在しない Attempt → `404`
- 二重登録は DB の `UNIQUE(attempt_id, user_id)` で防止（アプリ側は冪等に握りつぶす）
- 取り消しは `deleteMany({ attemptId, userId })` で自分の行だけ。他人のいいねは触れない

通知: 新規いいね時に投稿者へ 1 件（`notifications.type = "attempt_liked"`）。同じ経験に未読が
残っていれば増やさない。誰がいいねしたか・件数は保存しない・出さない。取り消しでは消さない。

---

## 既読（ログイン必須）

検索して見つけた経験を「自分がもう見たか」を判別するための、完全に個人用の状態。
既読数・閲覧数は出さず、検索順位にも使わない。「いいね」とは別テーブル（`attempt_reads`）。

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/v1/attempts/{attemptId}/read` | この経験を既読にする。`200 { read: true }`。冪等 |

- 経験詳細（`/experiences/{id}`）を**開いた時点**でクライアントが 1 回呼ぶ。検索結果に出ただけでは呼ばない
- 未ログイン → `401`（Cookie 等の簡易既読管理はしない）／非公開・不存在 → `404`
- 自分の経験は既読登録しない（`{ read: false }` を返し行を作らない）
- `user_id` はセッションから取得。リクエストボディの `user_id` は無視
- 二重は DB `UNIQUE(user_id, attempt_id)` で防止（アプリ側は冪等）
- 既読は補助機能。失敗しても経験の表示は妨げない（クライアントは握りつぶす）

---

## Paths（本人）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/roads/{roadId}/paths` | 本人の道の「方法 → 結果」列。`{ roadId, difficulty, goal, previouslyAble, progress, nextAction, tags, steps: {attemptId,method,result,triedAt,isPublished}[] }` |

---

## Tags（公開）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/tags` | 公開経験がひも付くタグを件数降順で `{ items: {id,name,roadCount}[] }` |
| GET | `/tags/{tagId}/experiences` | タグの公開経験一覧（`/experiences` と同じクエリ）。`{ tag, items, page, limit, total, hasMore }` |

---

## AI（補助レイヤー・断定しない）

| メソッド | パス | 認証 | ボディ | 返り |
| --- | --- | --- | --- | --- |
| POST | `/ai/experience-search` | 不要 | `{ situation: string }` | `{ keywords: string[], rephrased: string, disclaimer: string }` |
| POST | `/ai/summarize-experiences` | 不要 | `{ experienceIds: uuid[] }`（公開 Attempt のみ対象） | `{ triedMethods: string[], patterns: string[], disclaimer, count }` |

`ANTHROPIC_API_KEY` 未設定時はスタブ応答。

---

## 管理（`/api/admin/*`・運営者のみ）

アプリの Google ログインとは別系統。メール + パスワードで `admin_session` cookie を発行する。
すべて `unauthorized`(401) を返しうる。詳細は README「管理画面」と `docs/implementation-decisions.md` §7-novies。

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/admin/login` | `{ email, password }` → cookie 発行。IP 単位のレート制限あり。 |
| POST | `/api/admin/logout` | cookie 破棄。204。 |
| POST | `/api/admin/moderation/{attemptId}` | `{ action: "approve"｜"reject"｜"hold"｜"unhold", note? }`。確認待ち経験の許可 / 却下、または「保留」の設定 / 解除（`hold`/`unhold` は `moderationStatus` を変えない）。 |
| PATCH | `/api/admin/posts/{attemptId}` | `{ moderationStatus, note? }`。公開の取り下げ / 再公開など手動遷移。 |
| POST | `/api/admin/posts/{attemptId}/recheck` | 投稿の AI 審査だけ再実行（`moderationStatus` は変えない）。 |

---

## その他

| パス | 説明 |
| --- | --- |
| `GET /robots.txt` | 一般クローラーは `/api/` `/me/` `/login` `/admin/` 不可、既知 AI クローラーは全体不可（`/try` は SNS 共有の着地点なので許可） |

## 開発専用

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/test/login` | `E2E_TEST_LOGIN=true` のときのみ。`{ sub?, name? }` でモックログイン。 |
| DELETE | `/api/test/login` | モックログアウト。bot-guard / access-log の状態もリセット。 |

`E2E_TEST_LOGIN=true` のときに限り、リクエストヘッダ `x-dekiru-client: <id>` で
レート制限のクライアント識別子を上書きできる（テスト隔離用）。
