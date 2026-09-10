"use client";

import { useRef, useState } from "react";
import { ClearFieldButton } from "@/components/ui";

/**
 * 「公開されている経験」一覧のキーワード検索。GET フォームのまま、入力欄の右に「×」を出して
 * ワードを消せるようにするためだけのクライアント化。
 */
export function AdminPostSearch({ defaultValue, status }: { defaultValue: string; status: string }) {
  const [q, setQ] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form action="/admin/posts" method="get" className="flex gap-2">
      {status && <input type="hidden" name="status" value={status} />}
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="本文・困りごと・目標で検索"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 pr-10 text-sm [&::-webkit-search-cancel-button]:appearance-none"
        />
        {q && (
          <ClearFieldButton
            label="検索ワードを消す"
            onClick={() => {
              setQ("");
              inputRef.current?.focus();
            }}
          />
        )}
      </div>
      <button
        type="submit"
        className="rounded-[var(--radius-pill)] border border-[var(--color-neutral)] px-3 py-1.5 text-sm font-semibold"
      >
        検索
      </button>
    </form>
  );
}
