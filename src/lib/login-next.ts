/**
 * ログイン後の戻り先 (`/login?next=...`) を安全に決める。
 * オープンリダイレクトを防ぐため、外部 URL や `//host` 形式は受け付けない。
 */

/** ミドルウェアが /me* のリクエストに付ける、元のパス (クエリ込み) のヘッダー名。 */
export const PATHNAME_HEADER = "x-dekiru-pathname";

const ME_FALLBACK = "/login?next=/me";

/** /me 配下の未ログインアクセスを送るログイン URL。`/me` 以外は戻り先にしない。 */
export function loginNextFor(path: string | null | undefined): string {
  if (!path || !isSafeLocalPath(path)) return ME_FALLBACK;
  if (path !== "/me" && !path.startsWith("/me/") && !path.startsWith("/me?")) return ME_FALLBACK;
  return `/login?next=${encodeURIComponent(path)}`;
}

/** ログイン画面の `next` を callbackUrl に使ってよいか確かめ、だめなら `/me`。 */
export function safeNextPath(next: string | null | undefined): string {
  return next && isSafeLocalPath(next) ? next : "/me";
}

/** `/` で始まり、`//`・`/\` (プロトコル相対として解釈されうる) で始まらないサイト内パス。 */
function isSafeLocalPath(p: string): boolean {
  return p.startsWith("/") && !p.startsWith("//") && !p.startsWith("/\\");
}
