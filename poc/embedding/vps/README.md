# VPS 性能計測（Stage 3）

本番 VPS 上で e5-small q8 の Embedding 性能を測る手順。**アプリ本体・DB・nginx・systemd には触らない。**
計測は `~/dekiru-embedding-perf` という独立ディレクトリで行い、終わったら削除する。

- VPS 上で `npm install` はしない（手元で linux x64 用に固めた tar を持っていく）
- モデルは tar に同梱。VPS から Hugging Face へは取りに行かない
- 利用者データは使わない（合成した文章だけで測る）
- 所要 1〜3 分程度。**アクセスの少ない時間帯に実行する**
- ピーク時のメモリ（RSS）は手元の Linux コンテナで約 0.85 GB。`free -m` の available が 1000 MB 未満なら中止する

## 1. 手元（Mac）

```bash
cd /Volumes/macmini_USB2TB/source/dekiru-way
bash poc/embedding/vps/pack.sh
scp poc/embedding/vps-dist/dekiru-embedding-perf.tgz ubuntu@<VPS>:~/
```

## 2. VPS（1 行ずつ実行。失敗したら止める）

```bash
cd ~
tar xzf dekiru-embedding-perf.tgz
cd dekiru-embedding-perf
node -v
free -m
uptime

# (a) 推論スレッド 1 本（推奨・最初にこれ）。Next.js(:4000) の応答時間も別プロセスから測る
THREADS=1 PROBE_URL=http://localhost:4000/ nice -n 10 node perf.mjs

# (b) もう一度同じもの（2 回目 = OS のファイルキャッシュが温まった状態のロード時間）
THREADS=1 PROBE_URL=http://localhost:4000/ nice -n 10 node perf.mjs

# (c) 推論スレッド 2 本
THREADS=2 PROBE_URL=http://localhost:4000/ nice -n 10 node perf.mjs

free -m
ls perf-*.json
```

`THREADS` を付けない（onnxruntime の既定＝全コア）実行は、サイトの応答を遅くする可能性があるので**行わない**
（2 コアに制限したコンテナで、既定だとダミーサーバの応答が 0.6 秒に悪化した。THREADS=1 では悪化なし）。

途中で `free -m` の available が極端に減る・サイトが重くなる場合は `Ctrl-C` で止める（プロセスが終われば元に戻る）。

## 3. 結果の回収と片づけ

```bash
# 手元（Mac）で
scp 'ubuntu@<VPS>:~/dekiru-embedding-perf/perf-*.json' poc/embedding/results/
```

```bash
# VPS で
rm -rf ~/dekiru-embedding-perf ~/dekiru-embedding-perf.tgz
```

## 出力の見方（perf-*.json）

| キー | 意味 |
| --- | --- |
| `timingMs.loadFirst` / `loadSecondSameProcess` | モデルのロード時間（プロセス内 1 回目 / 2 回目） |
| `timingMs.batch1/10/30/100.msMedian` | 道の文章 N 件をまとめて Embedding する時間 |
| `timingMs.query1.msMedian` | 検索語 1 件の Embedding 時間（検索のたびに発生する分） |
| `timingMs.concurrent4xQuery1` / `8x` | 検索語 1 件を 4 / 8 本同時に投げたときの全体時間 |
| `cpuRatioMedian` | 経過時間あたりの CPU 時間（≒ 使ったコア数） |
| `timingMs.eventLoopDelay` | Embedding 中に**このプロセスの**イベントループが止まった時間。Next.js と同じプロセスに載せた場合、この間は他のリクエストを処理できない |
| `memory.afterLoad.rss` / `peakRss` | モデル 1 つをロードした後 / 計測中の最大 RSS（MB） |
| `next.idle` / `next.duringBatch100` | Next.js（別プロセス）の応答時間。平常時 / 100 件バッチ実行中 |
