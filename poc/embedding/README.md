# Embedding PoC (Stage 2)

ローカル Embedding（Transformers.js + onnxruntime-node, CPU）の検証用。**本番コードからは参照しない。**

- 依存はこのディレクトリの `package.json` だけに入れている（本体の `package.json` / `package-lock.json` は不変。VPS の `npm ci` に影響しない）
- ルートの `tsconfig.json` は `poc` を exclude（`next build` の型チェック対象外）
- モデルは初回だけ Hugging Face から取得し `.model-cache/` に保存（git 管理外）。従量課金 API は使わない

```bash
cd poc/embedding
npm install
EMBED_MODEL=e5-small-q8 npm run bench   # results/<preset>-<cold|warm>.json
EMBED_MODEL=bge-m3-q8   npm run bench
EMBED_MODEL=e5-small-q8 npm test        # node:test（モデルを実際にロード）
EMBED_MODEL=e5-small-q8 ../../node_modules/.bin/tsx mem-probe.ts  # メモリだけ
```

| ファイル | 内容 |
| --- | --- |
| `models.ts` | モデル preset（ID・dtype・pooling・query/passage 接頭辞）。`EMBED_MODEL` で切替 |
| `embedder.ts` | Embedding 生成・接頭辞付与（Stage 1 のテキスト生成は変えない）・cosine |
| `dataset.ts` | 固定データ（道 18・試したこと 30・クエリ 12・表記ゆれペア） |
| `bench.ts` | 速度・メモリ・検索品質・長文・表記ゆれの計測 |
| `mem-probe.ts` | pipeline 1 つだけのメモリ計測 |
| `results/` | 計測結果 JSON（2026-09-25、Apple M4 Pro / Node 25.6.1 / Transformers.js 4.3.0） |

## 主な結果（2026-09-25）

| | e5-small (q8) | bge-m3 (q8) |
| --- | --- | --- |
| 次元 / 最大トークン | 384 / 512 | 1024 / 8192 |
| ONNX ファイル | 118 MB | 570 MB |
| ロード（初回・DL 込み / キャッシュ後） | 5.1 s / 0.6 s | 14.7 s / 0.9 s |
| 1 件 / 10 件バッチ / 18 件バッチ | 2 ms / 34 ms / 61 ms | 6 ms / 190 ms / 334 ms |
| RSS（pipeline 1 つ, macOS / Linux コンテナ） | 約 0.7 GB / 約 0.53 GB | 約 1.8 GB / 約 1.13 GB |
| 正解の道が 1 位（12 クエリ） | 11 | 11（残り 1 件も関連する道が 1 位） |
| 無関係な文どうしの類似度 | 0.88 | 0.68 |
| 2000 文字の道テキスト | 1137 token → 512 で黙って切り捨て | 1135 token、切り捨てなし |

## Stage 3 / 3.1（公開データでの検証・匿名化）

リポジトリのルートで実行する。評価は**評価専用 DB（localhost の `*_eval`）だけ**に接続する
（`evaluate.ts` / `eval-db.ts` は DATABASE_URL がそれ以外なら即停止）。本番 DB には接続しない。

```bash
export EVAL_DB="postgresql://dekiru:dekiru@localhost:5433/dekiru_eval?schema=public"
# 1. 公開データを匿名化して書き出す（接続先は .env の DB。読み取りのみ）→ data/public-local.json
node_modules/.bin/tsx --env-file=.env poc/embedding/stage3/export-public.ts local
# 2. 評価用 DB に既存 migrations を当て（migrate deploy。reset は使わない）、スナップショットを投入
DATABASE_URL=$EVAL_DB node_modules/.bin/tsx poc/embedding/stage3/eval-db.ts setup
DATABASE_URL=$EVAL_DB node_modules/.bin/tsx poc/embedding/stage3/eval-db.ts load local
# 3. 評価（Embedding / ILIKE / fuzzy）とレポート
DATABASE_URL=$EVAL_DB node_modules/.bin/tsx poc/embedding/stage3/evaluate.ts local
node_modules/.bin/tsx poc/embedding/stage3/report.ts local
```

テスト（`poc/embedding` で）: `npm run test:stage3:unit`（DB なし）/ `npm run test:stage3:export`（ローカル開発 DB に一時データを作って消す）/ `npm run test:stage3:evaldb`（評価用 DB）

| ファイル | 内容 |
| --- | --- |
| `stage3/anonymize.ts` | 匿名化（ランダム順 → `road-001` / `attempt-001`）・評価用 UUID（`evalUuid`）・接続先ガード |
| `stage3/export-public.ts` | `PUBLIC_ATTEMPT_WHERE` 基準で必要カラムだけ読み、匿名化して書き出す（実 ID・日付・userId・text 等は出さない。対応表は作らない） |
| `stage3/eval-db.ts` | 評価用 DB の migrate と投入（ダミーユーザー 1 人・道・試したこと・タグ） |
| `stage3/queries.ts` | 評価クエリ 45 個（分類付き、正解は持たない） |
| `stage3/strategies.ts` | 512 トークン対策 A / B / C |
| `stage3/evaluate.ts` | Embedding 文章を Stage 1 の関数で再生成し、トークン数・A/B/C・類似度分布・Embedding / ILIKE / fuzzy 比較・人間評価用 CSV |
| `stage3/report.ts` | summary.json → report.md |
| `vps/` | VPS 計測キット（`pack.sh` で tar を作り、`vps/README.md` の手順で VPS で実行） |

`data/` と `results/stage3-*/` は利用者の投稿内容を含むため git 管理外。
