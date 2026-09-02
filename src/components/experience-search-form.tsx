"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInputButton } from "@/components/voice-input-button";
import {
  ATTEMPT_RESULTS,
  RESULT_META,
  EXPERIENCE_SORTS,
  EXPERIENCE_KINDS,
  EXPERIENCE_KIND_LABEL,
} from "@/lib/constants";

/**
 * 「経験を探す」の検索ワード＋絞り込みをまとめた 1 つのフォーム。
 * 検索ワードと絞り込みが別フォームだと「この条件で探す」でワードが消えるため、1 つにまとめる。
 * 送信で URL を組み立てて遷移（page / mp は付けない＝1 ページ目に戻す）。
 */

const SORT_LABEL: Record<string, string> = {
  recent: "新しい順",
  helpful: "うまくいった順",
  tried: "試した時期順",
};

const SELECT_CLASS =
  "mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base";

export function ExperienceSearchForm({
  defaultQ = "",
  defaultResult = "",
  defaultTag = "",
  defaultKind = "road",
  defaultSort = "recent",
  tags,
}: {
  defaultQ?: string;
  defaultResult?: string;
  defaultTag?: string;
  defaultKind?: string;
  defaultSort?: string;
  tags: { id: string; name: string; roadCount: number }[];
}) {
  const router = useRouter();
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const [qText, setQText] = useState(defaultQ);
  const [result, setResult] = useState(defaultResult);
  const [tag, setTag] = useState(defaultTag);
  const [kind, setKind] = useState(defaultKind);
  const [sort, setSort] = useState(defaultSort);

  // 「表示する種類」は検索ワードがあるときだけ意味がある（方法カード＝語のマッチ結果）。
  // ワードが無いあいだは「道だけ」に固定して表示（実際の結果と一致させる）。
  const searching = qText.trim().length > 0;
  const shownKind = searching ? kind : "road";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    const q = qText.trim();
    if (q) params.set("q", q);
    if (result) params.set("result", result);
    if (tag) params.set("tag", tag);
    if (q && kind && kind !== "road") params.set("kind", kind);
    if (sort && sort !== "recent") params.set("sort", sort);
    const qs = params.toString();
    router.push(qs ? `/experiences?${qs}` : "/experiences");
  }

  function clear() {
    setQText("");
    setResult("");
    setTag("");
    setKind("road");
    setSort("recent");
    router.push("/experiences");
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-4" role="search" aria-label="経験を探す">
      <div className="space-y-2">
        <label htmlFor={inputId} className="sr-only">
          何ができなくて困っていますか？
        </label>
        <p id={hintId} className="text-sm text-[var(--color-ink-muted)]">
          できごとや場面を、いつもの言葉で書いてください。病名は必要ありません。
        </p>
        <input
          id={inputId}
          name="q"
          type="search"
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          aria-describedby={hintId}
          placeholder="例：ボタンがとめにくい"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base"
        />
        <VoiceInputButton onResult={(t) => setQText((v) => (v ? `${v} ${t}` : t))} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-bold">
          表示する種類
          <select
            name="kind"
            value={shownKind}
            onChange={(e) => setKind(e.target.value)}
            disabled={!searching}
            aria-describedby={searching ? undefined : `${inputId}-kind-hint`}
            className={`${SELECT_CLASS} disabled:opacity-60`}
          >
            {EXPERIENCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {EXPERIENCE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          {!searching && (
            <span
              id={`${inputId}-kind-hint`}
              className="mt-1 block text-xs font-normal text-[var(--color-ink-muted)]"
            >
              検索ワードを入れると「方法」も選べます
            </span>
          )}
        </label>

        <label className="block text-sm font-bold">
          結果で絞る
          <select
            name="result"
            value={result}
            onChange={(e) => setResult(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">すべて</option>
            {ATTEMPT_RESULTS.map((r) => (
              <option key={r} value={r}>
                {RESULT_META[r].icon} {RESULT_META[r].label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-bold">
          タグで絞る
          <select
            name="tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">すべて</option>
            {tags.map((t) => (
              <option key={t.id} value={t.name}>
                #{t.name}（{t.roadCount}）
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-bold">
          並び順
          <select
            name="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className={SELECT_CLASS}
          >
            {EXPERIENCE_SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="tap-target rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-[var(--color-primary-ink)]"
        >
          この条件で探す
        </button>
        <button
          type="button"
          onClick={clear}
          className="tap-target inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--color-border)] px-5 py-2 text-sm font-semibold"
        >
          条件をクリア
        </button>
      </div>
    </form>
  );
}
