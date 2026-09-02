/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // MinIO / S3 互換ストレージからの画像表示を許可する。
    // 本番では実際のバケットホストに合わせて調整する。
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
      { protocol: "https", hostname: "**" },
    ],
  },
  eslint: {
    // CI では別途 `next lint` を実行する。ビルドを lint で止めない。
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
