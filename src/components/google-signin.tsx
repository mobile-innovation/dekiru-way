"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export function GoogleSigninButton({ disabled }: { disabled?: boolean }) {
  const params = useSearchParams();
  const next = params.get("next") || "/me";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => signIn("google", { callbackUrl: next })}
      className="tap-target inline-flex w-full items-center justify-center gap-3 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-3 text-base font-semibold disabled:opacity-60"
    >
      <span aria-hidden="true">🔓</span>
      Google でログイン
    </button>
  );
}
