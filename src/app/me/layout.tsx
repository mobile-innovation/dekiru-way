import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loginNextFor, PATHNAME_HEADER } from "@/lib/login-next";

/**
 * /me/* は本人専用。未ログインは /login へ (ミドルウェアが渡す元のパスを next に入れ、ログイン後に戻す)。
 * (Edge ミドルウェアではなくここで判定する = Prisma を使う jwt callback を Node ランタイムで動かすため)
 */

// 本人ページは検索エンジンに登録させず、リンクも追跡させない。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    const h = await headers();
    redirect(loginNextFor(h.get(PATHNAME_HEADER)));
  }
  return <>{children}</>;
}
