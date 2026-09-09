import { env } from "@/lib/env";

/**
 * `/ads.txt` — AdSense がサイト所有者の確認に使う。
 * パブリッシャ ID (`ca-pub-…`) 未設定なら 404（広告を接続していない）。
 * 参考: https://support.google.com/adsense/answer/12171612
 */
export const dynamic = "force-static";

export function GET() {
  const client = env.ads.adsenseClient;
  if (!client) {
    return new Response("Not found", { status: 404 });
  }
  // ads.txt では "ca-" を外した pub-ID を使う。
  const pubId = client.replace(/^ca-/, "");
  const body = `google.com, ${pubId}, DIRECT, f08c47fec0942fa0\n`;
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
