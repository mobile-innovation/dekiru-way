import { ApiError } from "@/lib/api";

/**
 * 軽量なメモリ内レート制限 (固定ウィンドウ)。
 * 単一プロセス前提の MVP 用。将来は Upstash 等の共有ストアに差し替え可能。
 * 書き込み系・アップロード・AI エンドポイントに適用する (指示書 15)。
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// 定期的に古いバケットを掃除する
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  /** 識別キー (例: `road:create:<userId>` や `ip:<addr>`) */
  key: string;
  /** ウィンドウ内の最大リクエスト数 */
  limit: number;
  /** ウィンドウ幅 (ミリ秒) */
  windowMs: number;
}

/** 制限を超えていれば ApiError(rate_limited) を投げる。 */
export function enforceRateLimit({ key, limit, windowMs }: RateLimitOptions): void {
  const now = Date.now();
  sweep(now);
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    const retrySec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    throw new ApiError("rate_limited", `リクエストが多すぎます。${retrySec} 秒ほど待ってから試してください`);
  }
}

/** リクエストから概算のクライアント識別子を得る。 */
export function clientKey(req: Request): string {
  return clientKeyFromHeaders(req.headers);
}

/**
 * `clientKey` の Server Component 版。Route Handler は `Request` を持つが、
 * SSR ページ（`next/headers` の `headers()`）は素の `Headers` しか持たないため分けている。
 * 抽出ロジックは同一（同じクライアントは同じキーになる）。
 */
export function clientKeyFromHeaders(h: Pick<Headers, "get">): string {
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** よく使う制限プリセット */
export const RATE_PRESETS = {
  write: { limit: 60, windowMs: 60_000 },
  ai: { limit: 15, windowMs: 60_000 },
} as const;
