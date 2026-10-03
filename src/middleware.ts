import { NextResponse, type NextRequest } from "next/server";
import { screenEdgeRequest, resolveClientId } from "@/lib/bot-guard";
import { PATHNAME_HEADER } from "@/lib/login-next";

/**
 * 全リクエスト共通の入口ガード (追加指示書 v1 ＋ 検索露出制御指示書)。
 *   - 環境変数の IP ブロックリスト
 *   - 収集目的が明確な既知 AI クローラー UA の拒否
 *   - X-Robots-Tag: 露出方針に沿って付与
 *       トップ (/)               → index, follow
 *       経験詳細 (/experiences/:id) → index, follow (2026-09-20 改定。一覧・タグ等は対象外)
 *       本人 (/me*) / ログイン       → noindex, nofollow
 *       管理 (/admin*)           → noindex, nofollow, noarchive ＋ Cache-Control: no-store
 *       その他の公開ページ         → noindex, follow
 *     いずれにも noai, noimageai を付ける (既存の AI オプトアウト)。
 *
 * ここはステートレス。頻度・巡回パターンの検知は各公開 API / SSR 側が担当する。
 * ミドルウェアは Edge で動きインスタンス間で状態を共有できないため、
 * レート制限の主担当にはしない (指示書 10/18: 複数の層を組み合わせる)。
 */

/** `/experiences/:id` (経験詳細) にだけマッチ。`/experiences`・`/experiences/paths` 等の一覧系は除外。 */
const EXPERIENCE_DETAIL_PATH = /^\/experiences\/(?!paths(?:\/|$))[^/]+\/?$/;

/** パスごとの X-Robots-Tag。検索結果からの除外は robots.txt でなく noindex で行う (指示書 §10)。 */
function robotsTagFor(pathname: string): string {
  const AI = "noai, noimageai";
  if (pathname.startsWith("/admin")) return `noindex, nofollow, noarchive, ${AI}`;
  if (pathname === "/" || EXPERIENCE_DETAIL_PATH.test(pathname)) return `index, follow, ${AI}`;
  if (pathname === "/login" || pathname === "/me" || pathname.startsWith("/me/")) {
    return `noindex, nofollow, ${AI}`;
  }
  return `noindex, follow, ${AI}`;
}

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

  const { pathname } = req.nextUrl;
  // /me* は元のパスをリクエストヘッダーで layout に渡し、ログイン後にそこへ戻れるようにする。
  let res: NextResponse;
  if (pathname === "/me" || pathname.startsWith("/me/")) {
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set(PATHNAME_HEADER, pathname + req.nextUrl.search);
    res = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    res = NextResponse.next();
  }
  res.headers.set("X-Robots-Tag", robotsTagFor(pathname));

  // 管理系はキャッシュ・BFCache に残さない (認証・認可が本体の防御。露出低減の多層のうちの 1 つ)。
  if (pathname.startsWith("/admin")) {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|ads.txt|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
