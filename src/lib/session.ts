import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * サーバーコンポーネント用: ログイン必須ページで使う。
 * 未ログインなら /login へリダイレクトする。
 * (レイアウトの redirect はページ本体の実行より後になり得るため、各ページでも直接ガードする)
 */
export async function requirePageUserId(next = "/me"): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return session.user.id;
}
