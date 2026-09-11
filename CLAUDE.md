# CLAUDE.md

このファイルは Claude Code が毎セッション読み込む。プロジェクトの決まりごとと、
コードからは分からない「残作業」を書く。詳細仕様は `docs/spec.md` /
`docs/implementation-decisions.md`、API は `docs/api.md`、運用は `docs/admin-manual.md`。

## 残作業 / 未了

### 検索AI Phase 2（pgvector + Embedding）— 未着手

Phase 1（AI が検索語を展開 → `ILIKE` OR を増やす → ページ内で関連度ソート → フォールバック）は
`feat/mvp-foundation` に実装済み（`src/lib/ai/search.ts` / `src/lib/search-rank.ts` / `?ai=1`）。
詳細は `docs/spec.md` §5.2.1 / `docs/implementation-decisions.md` 2026-09-11。

Phase 2（ベクトル類似検索）に必要なのは主にインフラと判断で、着手前に決める:

1. docker イメージを `postgres:16-alpine` → `pgvector/pgvector:pg16` に差し替え、本番 DB コンテナも入れ替え
2. マイグレーションで `CREATE EXTENSION vector` ＋ Embedding 専用テーブル（公開経験のみ）
3. Embedding プロバイダの選定（Anthropic に Embeddings API は無い）。API キーは環境変数、モデル名もハードコードしない
4. 公開／非公開／編集／削除に追随する Embedding 同期＋既存データのバックフィルスクリプト
5. kNN 検索とキーワード検索のスコア融合（Phase 1 の `rankBySearchRelevance` を土台に）

### Google AdSense — コードは実装済み、実配信は未了

`feat/mvp-foundation` で AdSense 接続のコードは完成している（`src/app/ads.txt/`、
`src/components/adsense-unit.tsx`、`ad-slot.tsx`、`layout.tsx` のローダ、
`src/lib/env.ts` の `env.ads.*`）。ID が空のあいだはプレースホルダ表示で、実広告は出ない。

実配信までに必要なのはコード変更ではなく運用手順:

1. Google AdSense でサイト審査 → パブリッシャ ID `ca-pub-…` を取得
2. 広告ユニットを 2 つ作成（検索一覧枠 `search_after_2` / 道詳細枠 `road_detail_mid`）→ slot ID を取得
3. 本番 env に `NEXT_PUBLIC_ADSENSE_CLIENT` / `NEXT_PUBLIC_ADSENSE_SLOT_SEARCH` / `NEXT_PUBLIC_ADSENSE_SLOT_ROAD` を設定
4. `ADS_ENABLED=true`
5. 審査はサイトの公開到達性が必須（VPN 内限定では通らない）

制約: 非パーソナライズ配信のみ（行動追跡なし・文脈広告）。EEA/UK は CMP 未導入のため
配信が絞られる可能性（将来課題）。表示は検索一覧・道詳細の 2 枠だけ。

### 仮データ（AI 生成サンプル）管理 — コード実装済み

管理者が `/admin/seed-data` で検索確認用のサンプルを AI 生成 → 確認 → 非公開で保存 →
1 件ずつ公開できる機能。`roads.is_seed_data` / `data_origin` で実データと区別。詳細は
`docs/spec.md` §5.10 / `docs/implementation-decisions.md` §7-decies / `docs/admin-manual.md` §6.5。

本番反映で必要なのはコードではなく運用手順:

1. マイグレーション 2 本 `20260910063926_add_road_seed_data` / `20260910082354_add_road_seed_keyword` を適用（`docs/deployment.md` の手順 4 が自動で拾う。`roads` への ADD COLUMN のみで安全）
2. 実 AI 生成をしたいなら本番 env に `ANTHROPIC_API_KEY` を設定（未設定でも決定的スタブで動く。テーマから逸脱せず、生成のたびに違う切り口を返す）
3. 生成物は必ず非公開で保存され、公開は管理画面から 1 件ずつ。一括公開・一括削除は無い
4. 同じテーマで何度でも生成でき、2 回目以降は保存済みと重複しない切り口が出る（`roads.seed_keyword` で照合）

### 本番ホスティング

さくら VPS（Ubuntu、mycarenote スタックと相乗り）に**既にデプロイ済み**。
Docker ではなく systemd `dekirumichi.service` が `next start -p 4000` を直接起動し、
nginx が `dekirumichi.net` を `localhost:4000` へプロキシ。DB だけコンテナ（`dekiru-db`、`localhost:5433`）。
デプロイ配置は `/var/www/dekirumichi/dekiru-way`、ブランチは `feat/mvp-foundation` を直接使用。

**開発 → Git → VPS の更新手順は [`docs/deployment.md`](docs/deployment.md)。** 要点:
VPS のコマンドは 1 行ずつ / `npm ci` は package-lock 変更時のみ（全消しで OOM 事故あり）/
Prisma は `node_modules/.bin/prisma`（`npx prisma` は RC を掴む）/ `next build` はスワップ必須・
`NODE_OPTIONS=--max-old-space-size=768` / ビルド成功後にのみ `systemctl restart`。
`E2E_TEST_LOGIN` は本番で絶対に設定しない。
