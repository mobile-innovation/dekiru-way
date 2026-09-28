# CLAUDE.md

このファイルは Claude Code が毎セッション読み込む。プロジェクトの決まりごとと、
コードからは分からない「残作業」を書く。詳細仕様は `docs/spec.md` /
`docs/implementation-decisions.md`、API は `docs/api.md`、運用は `docs/admin-manual.md`。

## 開発時の注意：`.next` の競合

ユーザーがこのディレクトリで `npm run dev` を動かしている間に、検証目的で
`npm run build` や `npx playwright test`（内部で `next build && next start` する）を
同じ作業ディレクトリで実行すると、共有の `.next` を上書きして dev サーバー側が
`Cannot find module './vendor-chunks/...'` のような 500 エラーで壊れることを確認済み
（2026-09-11、既読引き継ぎ機能の調査中に実際に再現。`docs/implementation-decisions.md` 該当日）。
症状は「見えるはずの変更が反映されない」など多岐にわたり、アプリのバグと区別しにくい。

- ユーザーの `npm run dev` が動いていそうなときは、`npm run build` / e2e によるビルド検証を避ける
  （まず `ps`/`lsof :3000` 等で確認する）。
- どうしても検証が必要なら、終わったら `.next` を削除してから返す
  （ユーザーの次の `npm run dev` がクリーンな状態から再コンパイルできるように）。
- ユーザーから「反映されない」「動かない」系の報告があり、コード上は正しく見えるときは、
  この `.next` 競合の可能性を先に疑う（`rm -rf .next` して再現するか確認）。

## UI / UX 方針

### トップページの入口（確定）

トップページの中心となる質問は

**何ができなくて困っていますか？**

で固定する。これは変更しない（Cloud Code UI・入力フォーム改善指示書 v2 §3-1）。

2026-09-23 に一時「『前はできてたのに』と思うこと、ありませんか？」への変更と、
「こんな変化、ありませんか？」チップ／「これも、できなくなったことかも」カードの追加を
実装したが、同日中に上記 v2 の確認によりすべてロールバック済み
（`docs/implementation-decisions.md` 2026-09-23「Cloud Code UI・入力フォーム改善指示書 v2」参照）。
「以前との変化から気づいてもらう」という切り口を再度検討する場合は、この過去の実装・ロールバック
経緯を踏まえたうえで、あらためてユーザーに確認すること。

### トップページの基本方針

- 説明を増やしすぎない
- 実際の経験・試行錯誤を見せることを重視する
- 成功例だけを正解として扱わない
- 「うまくいかなかった」経験も重要な情報として扱う
- 既存の8枚の説明画像は基本的に維持する
- UI変更とDB/API変更を分けて考える
- 入力項目を減らしても、既存DB/APIのデータ構造を不用意に削除しない

## 残作業 / 未了

### 意味検索（ローカル Embedding）— コード実装済み・既定 OFF、本番有効化は未了

`/experiences?sem=1`（`SEMANTIC_SEARCH_ENABLED=true` のときだけ）。Transformers.js + e5-small q8 を
サーバーの CPU で動かし、pgvector は使わずメモリ上の索引（`src/lib/search-semantic.ts` /
`src/lib/embedding.ts`）。詳細は `docs/spec.md` §5.2.3、検証の経緯・数値は `poc/embedding/README.md`。

本番で有効にするまでに必要なのは運用手順:

1. VPS で `npm ci`（`@huggingface/transformers` を追加したため package-lock が変わる。過去に OOM 事故が
   あった手順なのでスワップ確認・低トラフィック時間帯）
2. モデルファイル（約 118MB。`<EMBEDDING_MODEL_PATH>/Xenova/multilingual-e5-small/` に
   config.json / tokenizer.json / tokenizer_config.json / onnx/model_quantized.onnx）を VPS に配置
3. `.env` に `EMBEDDING_*` を設定（`.env.example`）。`EMBEDDING_ALLOW_REMOTE=false`
4. VPS 上でのメモリ実測は未実施（手元の 2 コア・2GB コンテナで +約 0.43GB）。ON にするときに `free -m` を見て、
   問題があれば `SEMANTIC_SEARCH_ENABLED=false` に戻す。計測キットは `poc/embedding/vps/`
5. 仮データの定型文（「『〇〇』に取り組むときの場面」）がボタン系の検索で上位を占める問題は未対応
   （ILIKE 検索でも起きている。仮データは意味検索にも含める方針）

### 検索AI Phase 1

Phase 1（AI が検索語を展開 → `ILIKE` OR を増やす → ページ内で関連度ソート → フォールバック）は
`feat/mvp-foundation` に実装済み（`src/lib/ai/search.ts` / `src/lib/search-rank.ts` / `?ai=1`）。
詳細は `docs/spec.md` §5.2.1 / `docs/implementation-decisions.md` 2026-09-11。

**表記ゆれ検索（pg_trgm）も実装済み**（2026-09-25。DB 内で完結する軽量な保険）。
通常のキーワード検索が 0 件のときだけ `similarity()` で候補を探す最後の手段。詳細は `docs/spec.md` §5.2.2。

公開データが増えてメモリ上の意味検索（上記）が重くなったら pgvector へ移す。そのとき必要になるのは
docker イメージの `pgvector/pgvector:pg16` への差し替えと本番 DB コンテナ入れ替え、`CREATE EXTENSION vector`
＋ Embedding 専用テーブル、公開／非公開／編集／削除に追随する同期と既存データのバックフィル。

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

### 審査待ち登録の管理者通知メール — コード実装済み、実配信は未了

新規登録が「審査待ち」（既存の `attempts.moderation_status = pending`。新しいステータスは
追加していない）になったタイミングで、管理者へ Resend 経由でメール通知する。実装は
`src/lib/mail.ts`（Resend への HTTP 送信）／`src/lib/admin-notify.ts`
（`notifyAdminOfNewPending`、`attempts.pending_notified_at` による二重送信対策）。呼び出し元は
`src/lib/moderation.ts`（通常投稿が AI ng/unknown で pending になったとき）と
`src/lib/quick-submit.ts`（SNS 簡易登録 `/try` は常に pending）。詳細は
`docs/implementation-decisions.md` 2026-09-12。

本番反映で必要なのはコードではなく運用手順:

1. マイグレーション `20260912003800_add_attempt_pending_notified_at` を適用（`attempts` への ADD COLUMN のみで安全）
2. Resend でアカウント作成 → 送信ドメイン（`dekirumichi.net`）の SPF/DKIM を DNS に追加してドメイン認証 → API キー発行
3. 本番 env に `MAIL_PROVIDER_API_KEY` / `ADMIN_NOTIFICATION_EMAIL`（管理者の受信アドレス）/ `MAIL_FROM_ADDRESS`（認証済みドメインの送信元）を設定
4. 3 つとも設定するまでは送信せずログに `status:"skipped"` を残すだけ（登録処理自体は失敗しない）
5. 実際に登録して本番でメールが届くことを確認

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
