import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { FontSizeControl } from "@/components/font-size-control";
import { HeaderNavLink } from "@/components/header-nav-link";
import { HeaderHeightSync } from "@/components/header-height-sync";
import { UserMenu } from "@/components/user-menu";
import { SyncLocalReadsOnLogin } from "@/components/sync-local-reads";

export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <header data-site-header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* スマホ（sm 未満）は 2 段に固定してコンパクトにする（2026-10-07）:
          1 段目 = ロゴ・文字サイズ（1 ボタンにまとめる）・ログイン/アカウント、2 段目 = ナビ。
          PC・タブレットは max-sm: 以外のクラスだけが効くので従来どおり。 */}
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 max-sm:gap-x-2 max-sm:gap-y-0.5 max-sm:py-1.5 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-[var(--color-ink)] no-underline"
        >
          <Image
            src="/brand-icon.png"
            alt=""
            width={32}
            height={32}
            priority
            className="h-8 w-8 shrink-0"
          />
          できる道
        </Link>

        <nav
          aria-label="メインナビゲーション"
          className="flex items-center gap-0.5 text-sm font-medium max-sm:order-last max-sm:-mx-2 max-sm:w-[calc(100%+1rem)] max-sm:justify-between"
        >
          <HeaderNavLink href="/experiences">経験を探す</HeaderNavLink>
          <HeaderNavLink href="/try">経験を教える</HeaderNavLink>
          {signedIn && <HeaderNavLink href="/me">自分の道</HeaderNavLink>}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <FontSizeControl />
          {signedIn ? (
            <>
              {/* 未ログイン中にブラウザへ溜めた既読を、アカウント側へ統合する (既読引き継ぎ指示書)。表示は無い。 */}
              <SyncLocalReadsOnLogin />
              <UserMenu />
            </>
          ) : (
            <Link
              href="/login"
              className="tap-target inline-flex items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-ink)] no-underline hover:bg-[var(--color-primary-hover)]"
            >
              ログイン
            </Link>
          )}
        </div>
      </div>
      {/* 固定ヘッダーの実際の高さを --header-height に反映する（アンカー移動の位置補正用。表示は無い）。 */}
      <HeaderHeightSync />
    </header>
  );
}
