# CLAUDE.md

このファイルは Claude Code が毎セッション読み込む。プロジェクトの決まりごとと、
コードからは分からない「残作業」を書く。詳細仕様は `docs/spec.md` /
`docs/implementation-decisions.md`、API は `docs/api.md`、運用は `docs/admin-manual.md`。

## 残作業 / 未了

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
