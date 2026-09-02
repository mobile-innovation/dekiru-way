import { headers } from "next/headers";
import { inspectPublicRead, type GuardVerdict } from "@/lib/bot-guard";
import { anonymizeClient, recordAccess } from "@/lib/access-log";

/**
 * 公開ページ (SSR) 用のガード。追加指示書 v1。
 * `/experiences` などを page=1,2,3... と高速巡回されるケースを、
 * API と同じ bot-guard の状態で検知する (Node ランタイムなので状態は信頼できる)。
 *
 * ページは HTTP ステータスを細かく制御しにくいので、ブロック時は
 * 呼び出し側でデータを出さずに注意メッセージを表示する。
 */
export async function guardPublicPage(
  routePath: string,
  query: Record<string, string | string[] | undefined> = {},
): Promise<GuardVerdict> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const clientId =
    (process.env.E2E_TEST_LOGIN === "true" && h.get("x-dekiru-client")
      ? `test:${h.get("x-dekiru-client")}`
      : null) ??
    (fwd ? fwd.split(",")[0].trim() : (h.get("x-real-ip") ?? "unknown"));
  const ua = h.get("user-agent") ?? "";

  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (typeof v === "string") sp.set(k, v);
    else if (Array.isArray(v) && v[0]) sp.set(k, v[0]);
  }
  const search = sp.toString();

  const verdict = inspectPublicRead({
    clientId,
    ua,
    path: routePath,
    query: search ? `?${search}` : "",
    kind: "page",
  });

  recordAccess({
    ts: new Date().toISOString(),
    endpoint: routePath,
    method: "GET",
    status: verdict.ok ? 200 : verdict.status,
    bytes: 0,
    client: anonymizeClient(clientId),
    ua: ua.slice(0, 200),
    rate: verdict.state,
  });

  return verdict;
}
