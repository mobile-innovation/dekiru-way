import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * /me/* は本人専用。未ログインは /login へ。
 * (Edge ミドルウェアではなくここで判定する = Prisma を使う jwt callback を Node ランタイムで動かすため)
 */

// 本人ページは検索エンジンに登録させず、リンクも追跡させない。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
export default async function MeLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?next=/me");
  }
  return <>{children}</>;
}
