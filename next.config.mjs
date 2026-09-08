/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 画像はサービス内の静的アセット (public/) のみ。ユーザーによる画像投稿・外部画像取得は行わない。
  eslint: {
    // CI では別途 `next lint` を実行する。ビルドを lint で止めない。
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
