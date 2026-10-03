"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { safeNextPath } from "@/lib/login-next";

/**
 * 開発 / E2E 用モックログイン。E2E_TEST_LOGIN=true のときだけ表示される。
 */
export function DevLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const [name, setName] = useState("テストユーザー");
  const [busy, setBusy] = useState(false);

  async function login() {
    setBusy(true);
    try {
      const res = await fetch("/api/test/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, sub: name }),
      });
      if (res.ok) {
        router.push(next);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4">
      <p className="text-sm font-bold">開発用モックログイン</p>
      <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
        E2E_TEST_LOGIN=true のときだけ有効。本番では使いません。
      </p>
      <div className="mt-3 flex gap-2">
        <input
          aria-label="表示名"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-base"
        />
        <button
          type="button"
          onClick={login}
          disabled={busy}
          className="tap-target rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-[var(--color-primary-ink)] disabled:opacity-60"
        >
          入る
        </button>
      </div>
    </div>
  );
}
