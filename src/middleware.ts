import { NextResponse, type NextRequest } from "next/server";
import { screenEdgeRequest, resolveClientId } from "@/lib/bot-guard";

/**
 * 全リクエスト共通の入口ガード (追加指示書 v1)。
 *   - 環境変数の IP ブロックリスト
 *   - 収集目的が明確な既知 AI クローラー UA の拒否
 *   - X-Robots-Tag: noai, noimageai を全レスポンスへ付与
 *
 * ここはステートレス。頻度・巡回パターンの検知は各公開 API / SSR 側
 * (Node ランタイム, bot-guard の inspectPublicRead) が担当する。
 * ミドルウェアは Edge で動きインスタンス間で状態を共有できないため、
 * レート制限の主担当にはしない (指示書 10/18: 複数の層を組み合わせる)。
 */
export function middleware(req: NextRequest) {
  const clientId = resolveClientId(req);
  const ua = req.headers.get("user-agent") ?? "";

  const verdict = screenEdgeRequest({ clientId, ua });
  if (!verdict.ok) {
    return new NextResponse(
      JSON.stringify({ error: { code: verdict.code, message: verdict.message } }),
      {
        status: verdict.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-robots-tag": "noai, noimageai",
          ...(verdict.retryAfter ? { "retry-after": String(verdict.retryAfter) } : {}),
        },
      },
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-Robots-Tag", "noai, noimageai");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|ads.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)"],
};
