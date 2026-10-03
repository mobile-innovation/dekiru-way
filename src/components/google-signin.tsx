"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { safeNextPath } from "@/lib/login-next";

export function GoogleSigninButton({ disabled }: { disabled?: boolean }) {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => signIn("google", { callbackUrl: next })}
      className="tap-target inline-flex w-full items-center justify-center gap-3 rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-5 py-3 text-base font-semibold text-[var(--color-primary-ink)] transition-colors hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
    >
      Google でログイン
    </button>
  );
}
