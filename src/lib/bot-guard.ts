/**
 * 公開経験の「機械的な大量取得・自動収集」対策 (追加指示書 v1)。
 *
 * 方針:
 *   - 人間の閲覧・検索は妨げない
 *   - 全件取得 / 高速巡回 / データセット化 / 外部AI学習目的の収集を難しくする
 *   - 100% の防止は目標にしない。複数の層を組み合わせる (指示書 18)
 *
 * ここは「アプリ層」の状態を持つ検知。IP 単位のレート/バースト、ページ番号の
 * 連続巡回、同一クエリの連打を見て、段階的に 429 → 一時ブロックへ進める。
 * User-Agent だけには依存しない (指示書 10): 偽装できるため、頻度・パターンと必ず組み合わせる。
 *
 * 単一プロセス前提のメモリ実装。水平スケール時は共有ストア (Redis 等) に置き換える。
 * 具体的な閾値は負荷試験で調整する前提の暫定値。
 */

const WINDOW_MS = 60_000;
const BURST_MS = 10_000;
const STRIKE_WINDOW_MS = 5 * 60_000;
const TEMP_BLOCK_MS = 10 * 60_000;

const STRIKES_TO_BLOCK = 3;
const PAGE_CRAWL_RUN = 8; // page=1,2,3... が高速で連続した回数
const SAME_QUERY_RUN = 25; // 同一検索条件の連打回数
const SEQUENCE_GAP_MS = 3_000; // 「人間離れした速度」の目安

type Profile = { sustained: number; burst: number };
const PROFILES: Record<"api" | "page" | "suspicious" | "noua", Profile> = {
  page: { sustained: 200, burst: 40 },
  api: { sustained: 100, burst: 25 },
  suspicious: { sustained: 30, burst: 8 }, // 明らかなスクリプト系 UA
  noua: { sustained: 40, burst: 10 }, // UA なし
};

// 収集目的が明確な既知クローラー。公開時点で更新すること。
const AI_CRAWLER_UA = [
  "gptbot",
  "oai-searchbot",
  "chatgpt-user",
  "ccbot",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "google-extended",
  "googleother",
  "applebot-extended",
  "bytespider",
  "bytedance",
  "amazonbot",
  "perplexitybot",
  "perplexity-user",
  "cohere-ai",
  "cohere-training-data-crawler",
  "diffbot",
  "imagesiftbot",
  "omgili",
  "omgilibot",
  "facebookbot",
  "meta-externalagent",
  "meta-externalfetcher",
  "youbot",
  "ai2bot",
  "timpibot",
  "webzio-extended",
  "dataforseobot",
  "magpie-crawler",
  "petalbot",
  "img2dataset",
  "velenpublicwebcrawler",
];

// スクリプト系の一般的な UA。単独では拒否せず、閾値を厳しくするだけ。
const SCRIPTY_UA = [
  "python-requests",
  "python-urllib",
  "aiohttp",
  "httpx",
  "curl/",
  "wget/",
  "libwww-perl",
  "java/",
  "okhttp",
  "go-http-client",
  "node-fetch",
  "axios/",
  "got (",
  "ruby",
  "httpclient",
  "scrapy",
  "colly",
  "httrack",
  "apache-httpclient",
  "phantomjs",
  "headlesschrome",
];

export type GuardVerdict =
  | { ok: true; state: string }
  | {
      ok: false;
      status: number;
      code: "forbidden" | "rate_limited";
      message: string;
      retryAfter?: number;
      state: string;
    };

type Bucket = { count: number; resetAt: number };
interface ClientState {
  window: Bucket;
  burst: Bucket;
  strikes: number;
  strikesResetAt: number;
  lastPathNoQuery: string;
  lastPage: number;
  pageRun: number;
  lastQueryKey: string;
  sameQueryRun: number;
  lastSeen: number;
}

const clients = new Map<string, ClientState>();
const blocked = new Map<string, number>(); // clientId -> blockUntil(epoch ms)

let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, v] of clients) if (now - v.lastSeen > STRIKE_WINDOW_MS) clients.delete(k);
  for (const [k, until] of blocked) if (until < now) blocked.delete(k);
}

function envBlocklist(): string[] {
  return (process.env.BLOCKED_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matches(ua: string, list: string[]): boolean {
  const u = ua.toLowerCase();
  return list.some((needle) => u.includes(needle));
}

/** クエリ文字列をキー正規化 (パラメータ順を無視) */
function queryKey(query: string): string {
  const sp = new URLSearchParams(query);
  const entries = [...sp.entries()].sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * ステートレスな門番。Edge ミドルウェアから呼ぶ。
 * - 環境変数の IP ブロックリスト
 * - 収集目的が明確な既知クローラー UA の拒否
 * (頻度の判定はアプリ層の inspectPublicRead が担当する)
 */
export function screenEdgeRequest(input: { clientId: string; ua: string }): GuardVerdict {
  if (envBlocklist().includes(input.clientId)) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message: "このアクセス元は制限されています",
      state: "env-blocklist",
    };
  }
  if (input.ua && matches(input.ua, AI_CRAWLER_UA)) {
    return {
      ok: false,
      status: 403,
      code: "forbidden",
      message:
        "自動的なアクセス・収集は許可していません。掲載内容の機械的取得や外部AIの学習利用は利用規約で禁止しています。",
      state: "ai-crawler-ua",
    };
  }
  return { ok: true, state: "edge-ok" };
}

interface InspectInput {
  clientId: string;
  ua: string;
  path: string;
  query: string;
  kind: "api" | "page";
}

/**
 * ステートフルな検知。API ルートハンドラ / SSR ページから呼ぶ (Node ランタイム)。
 */
export function inspectPublicRead(input: InspectInput): GuardVerdict {
  const now = Date.now();
  sweep(now);

  // まず edge と同じ静的チェック (ミドルウェアを経由しない経路のため二重に)
  const edge = screenEdgeRequest({ clientId: input.clientId, ua: input.ua });
  if (!edge.ok) return edge;

  // E2E: スイート全体が共有クライアントとして扱われて自己スロットリングしないよう、
  // 既定のテストクライアントは通す（レート制限を検証するテストは "scrape" を含む
  // 別 clientId を明示的に使うので、そちらは通常どおり評価される）。
  if (
    process.env.E2E_TEST_LOGIN === "true" &&
    input.clientId === "test:e2e-default"
  ) {
    return { ok: true, state: "e2e-default" };
  }

  const until = blocked.get(input.clientId);
  if (until && until > now) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      message: "アクセスが一時的に制限されています。時間をおいて再度お試しください。",
      retryAfter: Math.ceil((until - now) / 1000),
      state: "temp-blocked",
    };
  }

  const profile = !input.ua
    ? PROFILES.noua
    : matches(input.ua, SCRIPTY_UA)
      ? PROFILES.suspicious
      : PROFILES[input.kind];

  let st = clients.get(input.clientId);
  if (!st) {
    st = {
      window: { count: 0, resetAt: now + WINDOW_MS },
      burst: { count: 0, resetAt: now + BURST_MS },
      strikes: 0,
      strikesResetAt: now + STRIKE_WINDOW_MS,
      lastPathNoQuery: "",
      lastPage: 0,
      pageRun: 0,
      lastQueryKey: "",
      sameQueryRun: 0,
      lastSeen: now,
    };
    clients.set(input.clientId, st);
  }

  if (st.window.resetAt < now) st.window = { count: 0, resetAt: now + WINDOW_MS };
  if (st.burst.resetAt < now) st.burst = { count: 0, resetAt: now + BURST_MS };
  if (st.strikesResetAt < now) {
    st.strikes = 0;
    st.strikesResetAt = now + STRIKE_WINDOW_MS;
  }
  st.window.count += 1;
  st.burst.count += 1;

  const fast = now - st.lastSeen < SEQUENCE_GAP_MS;
  st.lastSeen = now;

  // --- ページ番号の連続巡回 (page=1,2,3,... を高速で) ---
  const sp = new URLSearchParams(input.query);
  const pageNum = Number(sp.get("page") ?? "1");
  if (input.path === st.lastPathNoQuery && fast && pageNum === st.lastPage + 1) {
    st.pageRun += 1;
  } else {
    st.pageRun = pageNum > 1 ? 1 : 0;
  }
  st.lastPathNoQuery = input.path;
  st.lastPage = Number.isFinite(pageNum) ? pageNum : 0;

  // --- 同一検索条件の連打 ---
  const qk = `${input.path}?${queryKey(input.query)}`;
  if (qk === st.lastQueryKey && fast) st.sameQueryRun += 1;
  else st.sameQueryRun = 1;
  st.lastQueryKey = qk;

  const breaches: string[] = [];
  if (st.burst.count > profile.burst) breaches.push("burst");
  if (st.window.count > profile.sustained) breaches.push("sustained");
  if (st.pageRun >= PAGE_CRAWL_RUN) breaches.push("page-crawl");
  if (st.sameQueryRun >= SAME_QUERY_RUN) breaches.push("query-flood");

  const state = `w=${st.window.count}/${profile.sustained} b=${st.burst.count}/${profile.burst} pr=${st.pageRun} qr=${st.sameQueryRun} s=${st.strikes}`;

  if (breaches.length === 0) {
    return { ok: true, state };
  }

  st.strikes += 1;
  st.strikesResetAt = now + STRIKE_WINDOW_MS;

  if (st.strikes >= STRIKES_TO_BLOCK || breaches.includes("page-crawl")) {
    blocked.set(input.clientId, now + TEMP_BLOCK_MS);
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      message: "アクセスが一時的に制限されました。時間をおいて再度お試しください。",
      retryAfter: Math.ceil(TEMP_BLOCK_MS / 1000),
      state: `${state} -> temp-block (${breaches.join(",")})`,
    };
  }

  return {
    ok: false,
    status: 429,
    code: "rate_limited",
    message: "リクエストが多すぎます。少し待ってからもう一度お試しください。",
    retryAfter: Math.max(1, Math.ceil((st.window.resetAt - now) / 1000)),
    state: `${state} -> 429 (${breaches.join(",")})`,
  };
}

/**
 * クライアント識別子。x-forwarded-for の先頭ホップ → x-real-ip の順。
 * ※ プロキシ配下では「信頼できるホップ」を正しく取る設定が前提 (README 参照)。
 * テスト時のみ (E2E_TEST_LOGIN=true) x-dekiru-client ヘッダで上書きでき、
 * レート制限テストを他の E2E から隔離できる。
 */
export function resolveClientId(req: Request): string {
  if (process.env.E2E_TEST_LOGIN === "true") {
    const override = req.headers.get("x-dekiru-client");
    if (override) return `test:${override}`;
  }
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

// --- 管理・運用向け (将来の管理画面が使える口。指示書 17) ---

export function blockClient(clientId: string, ms = TEMP_BLOCK_MS): void {
  blocked.set(clientId, Date.now() + ms);
}
export function unblockClient(clientId: string): void {
  blocked.delete(clientId);
}
export function listBlocked(): { clientId: string; until: string }[] {
  const now = Date.now();
  return [...blocked.entries()]
    .filter(([, until]) => until > now)
    .map(([clientId, until]) => ({ clientId, until: new Date(until).toISOString() }));
}
export function listRecentClients(limit = 50): {
  clientId: string;
  windowCount: number;
  strikes: number;
  lastSeen: string;
}[] {
  return [...clients.entries()]
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
    .slice(0, limit)
    .map(([clientId, s]) => ({
      clientId,
      windowCount: s.window.count,
      strikes: s.strikes,
      lastSeen: new Date(s.lastSeen).toISOString(),
    }));
}

/** テスト用: 全状態をクリア */
export function resetBotGuard(): void {
  clients.clear();
  blocked.clear();
}
