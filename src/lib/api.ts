import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { env } from "@/lib/env";

/**
 * API 共通のレスポンス / エラーハンドリング。
 * エラーエンベロープ: { error: { code, message, details? } }
 */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "rate_limited"
  | "internal";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal: 500,
};

export class ApiError extends Error {
  code: ApiErrorCode;
  details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status: STATUS_BY_CODE[code] },
  );
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** このアプリのオリジンとして許可するものの一覧。 */
function selfOrigins(req: Request): string[] {
  const out: string[] = [];
  try {
    out.push(new URL(env.site.url).origin);
  } catch {
    /* SITE_URL 未設定・不正なら無視 */
  }
  // リバースプロキシ / 複数ドメイン / プレビュー環境でも動くよう、
  // リクエスト自身のホストから組み立てたオリジンも許可する。
  try {
    out.push(new URL(req.url).origin);
  } catch {
    /* noop */
  }
  const host = req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
    out.push(`${proto}://${host}`);
  }
  return out;
}

/**
 * 状態を変える API 呼び出し (POST/PUT/PATCH/DELETE) を「同一オリジンからのみ」に制限する。
 *
 * ブラウザ発の CSRF (別サイトに置かれた fetch / form からの書き込み) はこれで塞がる:
 * ブラウザはクロスオリジンの書き込みで必ず `Sec-Fetch-Site` か `Origin` を送るため。
 * どちらのヘッダも持たないリクエスト (テスト・サーバ間・curl) は従来どおり通す —
 * それらはブラウザの Cookie を自動では持たないので CSRF の経路にはならない。
 * (SameSite=Lax セッション Cookie への二重防御。)
 */
export function assertSameOrigin(req: Request): void {
  if (!UNSAFE_METHODS.has(req.method.toUpperCase())) return;

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) {
    if (fetchSite === "same-origin" || fetchSite === "same-site") return;
    throw new ApiError("forbidden", "別サイトからのこの操作は受け付けられません");
  }

  const origin = req.headers.get("origin");
  if (origin) {
    if (selfOrigins(req).includes(origin)) return;
    throw new ApiError("forbidden", "許可されていない送信元からのリクエストです");
  }

  // Sec-Fetch-Site も Origin も無い = ブラウザ以外からの直接呼び出し。ここは通す。
}

/**
 * ルートハンドラを包み、投げられた例外を統一エラー応答へ変換する。
 * 認証情報・個人情報はログに出さない (指示書 15)。
 * 書き込みメソッドは同一オリジンからのものだけ受け付ける (assertSameOrigin)。
 */
type RouteCtx = { params: Promise<Record<string, string>> };

export function handle(fn: (req: Request, ctx: RouteCtx) => Promise<Response>) {
  return async (req: Request, ctx: RouteCtx) => {
    try {
      assertSameOrigin(req);
      return await fn(req, ctx ?? { params: Promise.resolve({}) });
    } catch (err) {
      if (err instanceof ApiError) {
        return errorResponse(err.code, err.message, err.details);
      }
      if (err instanceof ZodError) {
        return errorResponse("bad_request", "入力内容を確認してください", flattenZod(err));
      }
      // 予期しないエラーはメッセージを外に出さない
      console.error("[api] unhandled error:", err instanceof Error ? err.message : "unknown");
      return errorResponse("internal", "サーバー側で問題が発生しました");
    }
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** パスパラメータが UUID でなければ not_found を投げる (不正 ID による 500 を防ぐ)。 */
export function assertUuid(value: string, label = "ID"): void {
  if (!UUID_RE.test(value)) {
    throw new ApiError("not_found", `${label}が見つかりません`);
  }
}

export function flattenZod(err: ZodError): { field: string; message: string }[] {
  return err.issues.map((i) => ({
    field: i.path.join(".") || "(root)",
    message: i.message,
  }));
}

/** JSON ボディを zod で検証して返す。失敗時は ApiError(bad_request)。 */
export async function parseJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("bad_request", "JSON ボディを解釈できませんでした");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("bad_request", "入力内容を確認してください", flattenZod(parsed.error));
  }
  return parsed.data;
}

/** クエリパラメータを zod で検証。 */
export function parseQuery<S extends ZodTypeAny>(url: string, schema: S): z.output<S> {
  const sp = new URL(url).searchParams;
  const obj: Record<string, string> = {};
  for (const [k, v] of sp.entries()) obj[k] = v;
  const parsed = schema.safeParse(obj);
  if (!parsed.success) {
    throw new ApiError("bad_request", "検索条件を確認してください", flattenZod(parsed.error));
  }
  return parsed.data;
}
