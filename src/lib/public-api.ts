import { ZodError } from "zod";
import { ApiError, errorResponse, flattenZod } from "@/lib/api";
import { inspectPublicRead, resolveClientId } from "@/lib/bot-guard";
import { anonymizeClient, recordAccess } from "@/lib/access-log";

/**
 * 認証不要の公開 GET エンドポイント用ラッパ (追加指示書 v1)。
 *   1. Bot / 大量取得ガード (inspectPublicRead) を先に通す
 *   2. ハンドラ実行 (例外は統一エラー応答へ)
 *   3. アクセスログ記録 + X-Robots-Tag 付与
 *
 * 「認証不要 = 無制限」にしない。ガードで 403/429 を返し得る。
 */
type RouteCtx = { params: Promise<Record<string, string>> };

export function handlePublicRead(
  fn: (req: Request, ctx: RouteCtx) => Promise<Response>,
  opts: { kind?: "api" | "page" } = {},
) {
  return async (req: Request, ctx: RouteCtx) => {
    const url = new URL(req.url);
    const clientId = resolveClientId(req);
    const ua = req.headers.get("user-agent") ?? "";
    const endpoint = url.pathname;
    const client = anonymizeClient(clientId);

    const verdict = inspectPublicRead({
      clientId,
      ua,
      path: url.pathname,
      query: url.search,
      kind: opts.kind ?? "api",
    });

    if (!verdict.ok) {
      const res = errorResponse(verdict.code, verdict.message);
      if (verdict.retryAfter) res.headers.set("Retry-After", String(verdict.retryAfter));
      res.headers.set("X-Robots-Tag", "noai, noimageai");
      recordAccess({
        ts: new Date().toISOString(),
        endpoint,
        method: req.method,
        status: verdict.status,
        bytes: 0,
        client,
        ua: ua.slice(0, 200),
        rate: verdict.state,
      });
      return res;
    }

    let res: Response;
    try {
      res = await fn(req, ctx ?? { params: Promise.resolve({}) });
    } catch (err) {
      if (err instanceof ApiError) {
        res = errorResponse(err.code, err.message, err.details);
      } else if (err instanceof ZodError) {
        res = errorResponse("bad_request", "検索条件を確認してください", flattenZod(err));
      } else {
        console.error("[public-api] unhandled:", err instanceof Error ? err.message : "unknown");
        res = errorResponse("internal", "サーバー側で問題が発生しました");
      }
    }

    res.headers.set("X-Robots-Tag", "noai, noimageai");
    recordAccess({
      ts: new Date().toISOString(),
      endpoint,
      method: req.method,
      status: res.status,
      bytes: Number(res.headers.get("content-length") ?? 0),
      client,
      ua: ua.slice(0, 200),
      rate: verdict.state,
    });
    return res;
  };
}
