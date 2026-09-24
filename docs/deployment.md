# デプロイ / 更新手順

開発側（Mac）でコードを直し、Git に push し、VPS で pull してビルド・再起動する。
その一周分の手順書。

> 環境変数の一覧は [`spec.md`](spec.md) §10 / `.env.example`。
> 実装の詳細は [`implementation-decisions.md`](implementation-decisions.md)。

---

## 1. 本番環境の実態

さくら VPS（Ubuntu、mycarenote スタックと相乗り）。**Docker ではなく systemd で
`next start` を直接起動**している。コンテナは DB だけ。

| 項目 | 値 |
| --- | --- |
| アプリ配置 | `/var/www/dekirumichi/dekiru-way` |
| 実行 | systemd `dekirumichi.service`（`enabled`）→ `npm run start -- -p 4000` → `next start -p 4000` 、実行ユーザー `ubuntu` |
| 公開 | nginx（`:443`）→ `http://localhost:4000`、ドメイン `dekirumichi.net` |
| DB | Docker コンテナ `dekiru-db`（`postgres:16-alpine`、リポジトリの `docker-compose.yml`）。`localhost:5433`、DB 名 `dekiru` |
| デプロイ中のブランチ | `feat/mvp-foundation`（開発側・VPS 側とも同じブランチを直接使用） |
| メモリ | 約 2GB。**スワップ 2GB を `/swapfile` に追加済み**（`/etc/fstab` 登録済み） |
| `.env` | VPS 上のファイル。本番の秘密値と `NEXT_PUBLIC_ADSENSE_*` を持つ。**git には入らない** |
| Prisma | `^6.1.0`（実 6.19.3）。CLI は `node_modules/.bin/prisma` |
| 相乗り | `mycarenote-api`（`127.0.0.1:3000`）/ `mycarenote-db`（`127.0.0.1:5432`）。触らない |

---

## 2. 開発側（Mac）

```bash
cd /Volumes/macmini_USB2TB/source/dekiru-way

# 1. コードを変更する

# 2. ローカル確認（推奨。ただし npm run dev を動かしたまま実行すると .next を奪い合って
#    dev サーバーが 500 で壊れる。実行前に dev サーバーを止めるか、動いていないことを確認する。
#    CLAUDE.md「開発時の注意：.next の競合」参照）
npm run build
npm test

# 3. コミット
git add -A
git commit -m "変更内容"

# 4. push（これをしないと VPS に取り込めない）
git push origin feat/mvp-foundation
```

`.env` は git 管理外。本番の値を変えたいときは **VPS 側の `.env` を直接編集**する（下記 3-補足）。

---

## 3. VPS 側（反映）

**1 行ずつ実行する。失敗したら止める。**（一括貼り付け厳禁 → 過去にビルド失敗のまま
`systemctl restart` まで走ってサイトが落ちた）

```bash
cd /var/www/dekirumichi/dekiru-way

# 1. push した内容を取得
git pull

# 2. 依存は package-lock.json が変わったときだけ
git diff --name-only HEAD@{1} HEAD | grep -q package-lock.json && npm ci || echo "npm ci スキップ"

# 3. ビルド（スワップ必須・メモリ上限。.env の NEXT_PUBLIC_* もここで焼き込まれる）
NODE_OPTIONS=--max-old-space-size=768 npm run build

# 4. マイグレーション（prisma/migrations が変わったときだけ・ローカルバイナリで）
git diff --name-only HEAD@{1} HEAD | grep -q '^prisma/migrations/' \
  && node_modules/.bin/prisma migrate deploy || echo "migrate スキップ"
#   ※ 仮データ機能のマイグレーションは roads への ADD COLUMN のみで既存行・既存挙動に影響なし:
#     20260910063926_add_road_seed_data  … is_seed_data / data_origin（既定値あり）
#     20260910082354_add_road_seed_keyword … seed_keyword（nullable）

# 4-補足. 適用状況の確認（"Database schema is up to date!" が出ればOK。
#   未適用のマイグレーションが一覧で出た場合だけ、上の migrate deploy をもう一度実行する）
node_modules/.bin/prisma migrate status

# 5. 再起動（3 が ✓ Compiled successfully で終わってから）
sudo systemctl restart dekirumichi

# 6. 確認
systemctl status dekirumichi --no-pager
curl -I http://localhost:4000
curl -I https://dekirumichi.net
```

### 3-補足：本番の `.env` を変えたとき（例：`ADS_ENABLED` や slot ID）

```bash
cd /var/www/dekirumichi/dekiru-way
vi .env
NODE_OPTIONS=--max-old-space-size=768 npm run build   # NEXT_PUBLIC_* はビルド時に焼き込むので再ビルド必須
sudo systemctl restart dekirumichi
```

### 3-補足2：管理画面（`/admin`）に BASIC 認証をかける（nginx 側・任意の追加防御）

アプリ側は既に「未認証は `/admin/login` へ」「全管理ページ `requireAdmin()`／全管理 API `requireAdminApi()` でサーバー側認証＋認可」「管理系は `noindex` ＋ `Cache-Control: no-store`」になっている。
BASIC 認証は**その手前に置く追加の露出低減**であり、認証情報はリポジトリに置かない。

```bash
# 1. パスワードファイルを作る（初回のみ。ユーザー名は任意）
sudo apt-get install -y apache2-utils   # htpasswd コマンド
sudo htpasswd -c /etc/nginx/.htpasswd-dekiru admin   # 対話でパスワード入力

# 2. nginx の dekirumichi.net の server ブロックに location を足す
sudo vi /etc/nginx/sites-available/dekirumichi   # 実ファイル名は環境で確認
```

```nginx
# server { ... dekirumichi.net ... } の中に追記
location /admin/ {
    auth_basic           "Restricted";
    auth_basic_user_file  /etc/nginx/.htpasswd-dekiru;
    proxy_pass            http://localhost:4000;
    proxy_set_header      Host $host;
    proxy_set_header      X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header      X-Forwarded-Proto $scheme;
}
# API 側もかけるなら（管理操作を叩けなくするため。任意）
location /api/admin/ {
    auth_basic           "Restricted";
    auth_basic_user_file  /etc/nginx/.htpasswd-dekiru;
    proxy_pass            http://localhost:4000;
    proxy_set_header      Host $host;
    proxy_set_header      X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header      X-Forwarded-Proto $scheme;
}
```

```bash
# 3. 反映
sudo nginx -t && sudo systemctl reload nginx
```

- `.htpasswd-dekiru` は Git 管理下に置かない（`/etc/nginx/` 配下に置く）。
- BASIC 認証を通っても、そのあと管理者ログイン（メール＋パスワード）＋権限チェックが必須（アプリ側は不変）。
- 既存の管理者に BASIC の資格情報を別途共有する。

---

## 4. 守るルール（今日ハマった点）

| ルール | 理由 |
| --- | --- |
| VPS のコマンドは **1 行ずつ**。失敗で止める | 一括貼り付けで、失敗後も `sudo systemctl restart` まで走りサイトが落ちた |
| `npm ci` は **package-lock.json 変更時のみ** | `npm ci` は `node_modules` を全消しする。稼働中に走らせて OOM で中断 → 全体が壊れた |
| Prisma は必ず **`node_modules/.bin/prisma`** | `npx prisma` は `8.0.0-rc.13`（プロジェクトは 6 固定）を取りに行く。プロンプトが出たら `n` |
| `npm run build` の前に **スワップがある**こと | スワップ無しだと `next build` が OOM で死ぬ。`NODE_OPTIONS=--max-old-space-size=768` も付ける |
| `npm run build` が **✓ で終わってから** `restart` | 失敗ビルドで restart するとサービスが上がらない |
| `npm run build` は先に `prisma generate` を実行する | 別途 generate は不要 |

---

## 5. ロールバック

```bash
cd /var/www/dekirumichi/dekiru-way
git log --oneline -5
git checkout <戻したいコミットID>
NODE_OPTIONS=--max-old-space-size=768 npm run build
sudo systemctl restart dekirumichi
```

マイグレーションを当てた更新の巻き戻しは DB が戻らないことがある。migrations を含む
更新の前にダンプを取る:

```bash
docker exec dekiru-db pg_dump -U dekiru dekiru > ~/backup-$(date +%F-%H%M).sql
```

---

## 6. 障害時の復旧（`node_modules` 破損・サイトが上がらない）

```bash
# 1. フラップを止める
sudo systemctl stop dekirumichi

# 2. スワップが無ければ追加
sudo swapon --show
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 3. 依存を作り直す
cd /var/www/dekirumichi/dekiru-way
rm -rf node_modules
npm ci
#   まだ Killed になるなら相乗りを一時停止：
#   docker stop mycarenote-api && npm ci && docker start mycarenote-api
ls node_modules/.bin/prisma        # 出ればOK

# 4. ビルド
NODE_OPTIONS=--max-old-space-size=768 npm run build

# 5. ビルドが通ってから起動
node_modules/.bin/prisma migrate deploy
node_modules/.bin/prisma migrate status   # "Database schema is up to date!" を確認
sudo systemctl start dekirumichi
systemctl status dekirumichi --no-pager
curl -I http://localhost:4000
```

---

## 7. 未整理・改善候補

- **`dekiru-db` が `0.0.0.0:5433` で全公開**（パスワード `dekiru/dekiru`）。`docker-compose.yml` を
  `"127.0.0.1:5433:5432"` にして `docker compose up -d db`、またはファイアウォールで 5433 を塞ぐ。
- 開発も本番も `feat/mvp-foundation` を直接使用。将来は「`main` にマージ → VPS は `main` を pull」に。
- 手順を `scripts/deploy.sh` にまとめると貼り付けミスが起きない（未作成）。
- ビルドが VPS のメモリを圧迫する。手元 / CI でビルドして成果物（`.next/`）を転送する方式も検討。
