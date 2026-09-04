"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceInputButton } from "@/components/voice-input-button";
import { Button } from "@/components/ui";
import { IconSearch, IconSlidersHorizontal } from "@/components/icons";
import {
  ATTEMPT_RESULTS,
  RESULT_META,
  EXPERIENCE_SORTS,
  EXPERIENCE_KINDS,
  EXPERIENCE_KIND_DEFAULT,
  EXPERIENCE_KIND_LABEL,
} from "@/lib/constants";

/**
 * 「経験を探す」の検索ワード＋絞り込みをまとめた 1 つのフォーム。
 * 検索ワードと絞り込みが別フォームだと「この条件で探す」でワードが消えるため、1 つにまとめる。
 * 送信で URL を組み立てて遷移（page / mp は付けない＝1 ページ目に戻す）。
 *
 * デザインはトップ画面の検索カードと統一（指示書「経験を探す UI 統一 v1」）:
 *   あなたの困りごと → 浮いた入力欄 → 音声入力 → ── 絞り込み ── → 4 セレクト → 実行/クリア。
 */

const SORT_LABEL: Record<string, string> = {
  recent: "新しい順",
  helpful: "うまくいった順",
  tried: "試した時期順",
};

const SELECT_CLASS =
  "mt-1 w-full rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-base transition-colors focus-visible:border-[var(--color-primary)]";

export function ExperienceSearchForm({
  defaultQ = "",
  defaultResult = "",
  defaultTag = "",
  defaultKind = EXPERIENCE_KIND_DEFAULT,
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

  // 「表示する種類」は検索ワードの有無に関わらず切り替えられる。
  // ワード無しでも「方法だけ」で公開された試したことの一覧を見られる。
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    const q = qText.trim();
    if (q) params.set("q", q);
    if (result) params.set("result", result);
    if (tag) params.set("tag", tag);
    if (kind && kind !== EXPERIENCE_KIND_DEFAULT) params.set("kind", kind);
    if (sort && sort !== "recent") params.set("sort", sort);
    const qs = params.toString();
    router.push(qs ? `/experiences?${qs}` : "/experiences");
  }

  function clear() {
    setQText("");
    setResult("");
    setTag("");
    setKind(EXPERIENCE_KIND_DEFAULT);
    setSort("recent");
    router.push("/experiences");
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-5 shadow-[var(--shadow-card)] sm:p-6"
      role="search"
      aria-label="経験を探す"
    >
      {/* ① 困りごとを入力（浮いた入力欄。トップ画面と同じ見た目） */}
      <div>
        <label
          htmlFor={inputId}
          className="block text-sm font-bold text-[var(--color-ink)]"
        >
          あなたの困りごと
        </label>
        <p id={hintId} className="mt-1 text-sm text-[var(--color-ink-muted)]">
          できごとや場面を、いつもの言葉で書いてください。病名は必要ありません。
        </p>
        <div className="relative mt-2">
          <IconSearch
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-primary)]"
          />
          <input
            id={inputId}
            name="q"
            type="search"
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            aria-describedby={hintId}
            placeholder="例：ボタンがとめにくい"
            className="w-full rounded-[12px] border border-[color-mix(in_srgb,var(--color-primary)_30%,white)] bg-[var(--color-surface)] py-3 pl-11 pr-4 text-base shadow-[0_2px_8px_rgba(46,42,38,0.05)] transition-[border-color,box-shadow] focus-visible:rounded-[12px] focus-visible:border-[var(--color-primary)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-primary)_28%,white),0_2px_8px_rgba(46,42,38,0.05)]"
          />
        </div>
        <div className="mt-2">
          <VoiceInputButton onResult={(t) => setQText((v) => (v ? `${v} ${t}` : t))} />
        </div>
      </div>

      {/* ② 必要なら絞り込む（検索入力と視覚的に分ける） */}
      <div className="border-t border-[var(--color-border)] pt-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-ink)]">
          <IconSlidersHorizontal
            aria-hidden="true"
            className="h-4 w-4 text-[var(--color-ink-muted)]"
          />
          絞り込み
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-bold">
            表示する種類
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={SELECT_CLASS}
            >
              {EXPERIENCE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {EXPERIENCE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
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
                  {RESULT_META[r].label}
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
      </div>

      {/* ③ 探す（主操作）／クリア（副操作） */}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          <IconSearch aria-hidden="true" className="h-4 w-4" />
          この条件で探す
        </Button>
        <Button type="button" variant="secondary" onClick={clear}>
          条件をクリア
        </Button>
      </div>
    </form>
  );
}
