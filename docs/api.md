# できる道 REST API (v1)

- ベース URL: `/api/v1`
- 形式: JSON。日付は ISO 8601（DATE 型は `YYYY-MM-DD`）。キーは camelCase。
- エラー: `{ "error": { "code": string, "message": string, "details"?: any } }`
  - `code`: `bad_request` (400) / `unauthorized` (401) / `forbidden` (403) / `not_found` (404) /
    `conflict` (409) / `payload_too_large` (413) / `unsupported_media_type` (415) /
    `rate_limited` (429) / `internal` (500)
- 認証: JWT セッション Cookie（Auth.js）。所有者チェックはすべてサーバー側。
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

OAuth 本体は Auth.js: `GET/POST /api/auth/*`（`/api/auth/signin/google` など）。

---

## Road（本人のみ）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/roads` | 自分の道一覧 `{ items: Road[] }`（新しい更新順） |
| POST | `/roads` | 道を作成。201。 |
| GET | `/roads/{roadId}` | 道の詳細（attempts / photos / tags 込み）。他人は 403、無ければ 404。 |
| PATCH | `/roads/{roadId}` | 部分更新。空ボディは 400。`title` と `difficulty` は一度値が入ると変更不可（別の値を送ると `409`。同値・省略は許可）。記述項目を変えると道の内容が再 AI 審査される。 |
| DELETE | `/roads/{roadId}` | 削除（attempts / photos は cascade、ストレージ実体も削除）。204。 |

### Road 作成 / 更新ボディ
```jsonc
{
  "title": "string|null",          // 一覧の見出し
  "previouslyAble": "string|null", // 以前できていた
  "difficulty": "string|null",     // できなくなった
  "goal": "string|null",           // やりたいこと
  "startedAt": "YYYY-MM-DD|null",
  "situation": "string|null",
  "memo": "string|null",
  "status": "string|null",
  "progress": "string|null",
  "nextAction": "string|null",
  "visibility": "private|public",  // 既定 private
  "tags": ["string", ...]          // 指定時のみ同期。Tag は自動 upsert
}
```
更新はすべて optional。`tags` を省略するとタグは変更されない。
`title` / `difficulty` は「まだ空なら初回だけ設定可、値が入ったら以後は変更不可」（道の同一性を保つため）。

#### 道の内容 AI モデレーション

道を作成/編集すると、その記述（`title` / `difficulty` / `goal` / `situation` / `previouslyAble` /
`progress` / `nextAction` / `memo` / `status`）が AI 審査される（`AI_MODERATION_ENABLED=false` なら即承認）。
レスポンスの Road には `moderationStatus`（`pending|approved|rejected`）と `aiReason` が含まれる。
`ng` / `unknown`（キー未設定含む）なら `pending` になり、**その道で「経験として公開」された記録も
公開検索 (`/experiences*`, `/tags*`) には出ない**（投稿と道の両方が `approved` である必要がある）。

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
  "publishState": "private|reviewing|published|rejected", // 本人向けの表示状態
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

## Photo（本人のみ）

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/attempts/{attemptId}/photos` | 一覧 |
| POST | `/attempts/{attemptId}/photos` | `multipart/form-data`（`file` 必須、`caption?`、`sortOrder?`）。201。 |
| DELETE | `/attempts/{attemptId}/photos/{photoId}` | 削除（ストレージ実体も）。204。 |

制約: `image/jpeg|png|webp|gif`、マジックバイト検証、5MB / 枚、8 枚 / 記録。

---

## Experience（公開・ログイン不要）

「経験」= `isPublished = true` の Attempt。

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/experiences` | 検索。クエリ: `q`, `result`, `tag`, `page`(1–100), `limit`(1–50, 既定 20), `sort`(`recent`\|`helpful`\|`tried`)。`(page-1)*limit ≥ 500` は `400`。<br>`{ items: Experience[], page, limit, total, hasMore }` |
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
  "photos": [{ "id", "storageUrl", "caption", "sortOrder", "createdAt" }],
  "createdAt": "ISO",
  "road": {
    "previouslyAble", "difficulty", "goal", "situation",
    "progress", "nextAction", "startedAt", "tags": ["string"]
  },
  "siblings"?: [{ "id", "method", "result", "triedAt", "isCurrent" }]  // 詳細取得時のみ
}
```
検索対象カラム（指示書 13）: `roads.difficulty` / `roads.situation` / `roads.goal` /
`roads.previouslyAble` / `attempts.method` / `attempts.memo` / `tags.name`。

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
| POST | `/api/admin/moderation/{attemptId}` | `{ action: "approve"｜"reject", note? }`。保留投稿の許可 / 却下。 |
| PATCH | `/api/admin/posts/{attemptId}` | `{ moderationStatus, note? }`。公開の取り下げ / 再公開など手動遷移。 |
| POST | `/api/admin/posts/{attemptId}/recheck` | 投稿の AI 審査だけ再実行（`moderationStatus` は変えない）。 |
| POST | `/api/admin/roads/{roadId}/moderate` | `{ action: "approve"｜"reject", note? }`。保留中の道の許可 / 却下。 |
| PATCH | `/api/admin/roads/{roadId}` | `{ moderationStatus, note? }`。道の公開状態の手動遷移。 |
| POST | `/api/admin/roads/{roadId}/recheck` | 道の AI 審査だけ再実行。 |

---

## その他

| パス | 説明 |
| --- | --- |
| `GET /robots.txt` | 一般クローラーは `/api/` `/me/` `/login` `/admin/` `/try` 不可、既知 AI クローラーは全体不可 |

## 開発専用

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/test/login` | `E2E_TEST_LOGIN=true` のときのみ。`{ sub?, name? }` でモックログイン。 |
| DELETE | `/api/test/login` | モックログアウト。bot-guard / access-log の状態もリセット。 |

`E2E_TEST_LOGIN=true` のときに限り、リクエストヘッダ `x-dekiru-client: <id>` で
レート制限のクライアント識別子を上書きできる（テスト隔離用）。
