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
| PATCH | `/roads/{roadId}` | 部分更新。空ボディは 400。 |
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
| POST | `/ai/suggest-next-step` | 必要 | `{ roadId: uuid }`（本人の道） | `{ ideas: string[], disclaimer: string }` |

`ANTHROPIC_API_KEY` 未設定時はスタブ応答。

---

## その他

| パス | 説明 |
| --- | --- |
| `GET /robots.txt` | 一般クローラーは `/api/` `/me/` `/login` 不可、既知 AI クローラーは全体不可 |

## 開発専用

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/api/test/login` | `E2E_TEST_LOGIN=true` のときのみ。`{ sub?, name? }` でモックログイン。 |
| DELETE | `/api/test/login` | モックログアウト。bot-guard / access-log の状態もリセット。 |

`E2E_TEST_LOGIN=true` のときに限り、リクエストヘッダ `x-dekiru-client: <id>` で
レート制限のクライアント識別子を上書きできる（テスト隔離用）。
