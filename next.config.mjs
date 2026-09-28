/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 画像はサービス内の静的アセット (public/) のみ。ユーザーによる画像投稿・外部画像取得は行わない。
  eslint: {
    // CI では別途 `next lint` を実行する。ビルドを lint で止めない。
    ignoreDuringBuilds: true,
  },
  // 意味検索のローカル Embedding（Transformers.js）はネイティブモジュール（onnxruntime-node / sharp）を
  // 含むので、バンドルせず Node の require に任せる。
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "sharp"],
};

export default nextConfig;
