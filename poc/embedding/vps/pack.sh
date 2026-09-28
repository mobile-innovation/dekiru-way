#!/usr/bin/env bash
# Stage 3: VPS 計測キットを手元（Mac）で作る。VPS 上で npm install をしないため
# （VPS は npm ci で OOM 事故の前例あり。docs/deployment.md 参照）。
#
#   bash poc/embedding/vps/pack.sh
#   → poc/embedding/vps-dist/dekiru-embedding-perf.tgz
#
# 中身: perf.mjs / package.json / node_modules（linux x64 用）/ models（e5-small の q8 と tokenizer だけ）
# 本番アプリ（/var/www/dekirumichi）とは無関係な単独ディレクトリとして展開して使う。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
POC="$(cd "$HERE/.." && pwd)"
MODEL_SRC="$POC/.model-cache/Xenova/multilingual-e5-small"
DIST="$POC/vps-dist"
STAGE="$DIST/dekiru-embedding-perf"

if [ ! -f "$MODEL_SRC/onnx/model_quantized.onnx" ]; then
  echo "モデルが未取得です。先に: cd poc/embedding && EMBED_MODEL=e5-small-q8 npm run bench" >&2
  exit 1
fi

rm -rf "$DIST"
mkdir -p "$STAGE/models/Xenova/multilingual-e5-small/onnx"
cp "$HERE/perf.mjs" "$STAGE/"
cp "$MODEL_SRC/config.json" "$MODEL_SRC/tokenizer.json" "$MODEL_SRC/tokenizer_config.json" \
  "$STAGE/models/Xenova/multilingual-e5-small/"
cp "$MODEL_SRC/onnx/model_quantized.onnx" "$STAGE/models/Xenova/multilingual-e5-small/onnx/"

cat > "$STAGE/package.json" <<'JSON'
{
  "name": "dekiru-embedding-perf",
  "private": true,
  "type": "module",
  "dependencies": { "@huggingface/transformers": "4.3.0" }
}
JSON

# linux x64 (glibc) 用の依存を入れる。onnxruntime-node の postinstall は GPU 用の追加取得だけなので省略。
(cd "$STAGE" && npm install --os=linux --cpu=x64 --libc=glibc --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)

# 他プラットフォーム向けの onnxruntime バイナリは不要なので削る（linux/x64 だけ残す）
ORT_BIN="$STAGE/node_modules/onnxruntime-node/bin/napi-v6"
find "$ORT_BIN" -mindepth 1 -maxdepth 1 ! -name linux -exec rm -rf {} +
find "$ORT_BIN/linux" -mindepth 1 -maxdepth 1 ! -name x64 -exec rm -rf {} +

(cd "$DIST" && tar czf dekiru-embedding-perf.tgz dekiru-embedding-perf)
du -sh "$STAGE" "$DIST/dekiru-embedding-perf.tgz"
echo "OK: $DIST/dekiru-embedding-perf.tgz"
