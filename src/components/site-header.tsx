import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import { FontSizeControl } from "@/components/font-size-control";
import { SignOutButton } from "@/components/auth-buttons";

export async function SiteHeader() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-6">
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
          className="flex items-center gap-0.5 text-sm font-medium"
        >
          <Link
            href="/experiences"
            className="rounded-[var(--radius-pill)] px-3 py-2 no-underline hover:bg-[var(--color-surface-sunken)]"
          >
            経験を探す
          </Link>
          {signedIn && (
            <Link
              href="/me"
              className="rounded-[var(--radius-pill)] px-3 py-2 font-semibold no-underline hover:bg-[var(--color-surface-sunken)]"
            >
              自分の道
            </Link>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <FontSizeControl />
          {signedIn ? (
            <SignOutButton />
          ) : (
            <Link
              href="/login"
              className="tap-target rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-ink)] no-underline hover:bg-[var(--color-primary-hover)]"
            >
              ログイン
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
