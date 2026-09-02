/**
 * 公開 API のアクセスログ (追加指示書 v1 §16)。
 *   - timestamp / endpoint / method / status / response size / 匿名化した識別子 /
 *     User-Agent / rate-limit 状態
 *   - 認証情報・個人情報は保存しない
 *
 * MVP は「構造化ログを標準出力」＋「直近 N 件のメモリリングバッファ」。
 * 将来、永続ストアや管理画面はこの関数の内側を差し替えるだけで拡張できる (指示書 17)。
 */

export interface AccessLogEntry {
  ts: string;
  endpoint: string;
  method: string;
  status: number;
  bytes: number;
  /** 匿名化済みクライアント識別子 (生 IP は保存しない) */
  client: string;
  ua: string;
  rate: string;
}

const RING_MAX = 500;
const ring: AccessLogEntry[] = [];

/** 生の識別子を相関用に匿名化する (可逆でない簡易ハッシュ + ソルト)。 */
export function anonymizeClient(raw: string): string {
  const salt = process.env.ACCESS_LOG_SALT ?? "dekiru";
  let h = 2166136261 >>> 0; // FNV-1a
  const s = `${salt}:${raw}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `c_${h.toString(16).padStart(8, "0")}`;
}

export function recordAccess(entry: AccessLogEntry): void {
  ring.push(entry);
  if (ring.length > RING_MAX) ring.shift();
  // 構造化 1 行ログ。PII・認証情報は entry に含めない前提。
  if (process.env.VITEST) return; // テスト実行時は標準出力を汚さない (リングバッファには残る)
  try {
    console.log(JSON.stringify({ tag: "public-api-access", ...entry }));
  } catch {
    /* ログ失敗は握りつぶす */
  }
}

/** 直近のアクセスログ (将来の管理画面用) */
export function recentAccess(limit = 100): AccessLogEntry[] {
  return ring.slice(-limit);
}

export function resetAccessLog(): void {
  ring.length = 0;
}
