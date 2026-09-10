"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { ClearFieldButton } from "@/components/ui";
import {
  SeedDraftFields,
  seedDraftToPayload,
  type SeedDraftValue,
} from "@/components/admin/seed-draft-fields";

/**
 * AI 仮データ生成画面 (実装指示書 5 / 6 / 8 / 9)。
 *   キーワード + 件数 → AIで生成する → 候補を画面で確認・編集 → 「非公開で保存」
 * 生成した時点では DB に保存しない。保存すると必ず非公開で作成される。
 */

const COUNT_OPTIONS = [5, 10, 15, 20];

const BTN =
  "tap-target inline-flex items-center justify-center rounded-[var(--radius-pill)] border px-4 py-2 text-sm font-semibold disabled:opacity-50";
const BTN_PRIMARY = `${BTN} border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-ink)]`;
const BTN_PLAIN = `${BTN} border-[var(--color-neutral)] bg-[var(--color-neutral-soft)] text-[var(--color-ink-muted)]`;

type Draft = SeedDraftValue;

function toDraft(raw: Partial<SeedDraftValue>): Draft {
  return {
    difficulty: raw.difficulty ?? "",
    previouslyAble: raw.previouslyAble ?? "",
    goal: raw.goal ?? "",
    situation: raw.situation ?? "",
    startedAt: raw.startedAt ?? "",
    memo: raw.memo ?? "",
    status: raw.status ?? "",
    progress: raw.progress ?? "",
    nextAction: raw.nextAction ?? "",
    method: raw.method ?? "",
    result: raw.result ?? "ongoing",
    triedAt: raw.triedAt ?? "",
    attemptMemo: raw.attemptMemo ?? "",
  };
}

type ExcludeItem = { difficulty: string | null; method: string; result: string };

export function SeedDataGenerator() {
  const router = useRouter();
  const keywordRef = useRef<HTMLInputElement>(null);
  // 同じキーワードで「もう一度生成」するたび、これまで出した候補を除外対象に積む。
  // キーワードが変わったらリセット。
  const historyRef = useRef<{ keyword: string; items: ExcludeItem[] }>({ keyword: "", items: [] });
  const [keyword, setKeyword] = useState("");
  const [count, setCount] = useState(10);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [priorCount, setPriorCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();

  function generate() {
    setError(null);
    const kw = keyword.trim();
    if (kw.length === 0) {
      setError("キーワードを入力してください");
      return;
    }
    // キーワードが変わっていたら、これまでの除外履歴を捨てる。
    if (historyRef.current.keyword !== kw) {
      historyRef.current = { keyword: kw, items: [] };
    }
    startGenerate(async () => {
      try {
        const res = await api.post<{ drafts: Partial<SeedDraftValue>[]; priorCount?: number }>(
          "/api/admin/seed-data/generate",
          { keyword: kw, count, exclude: historyRef.current.items.slice(-150) },
        );
        // 生成できた候補は次回の再生成で「同じものを出さない」ため履歴に積む。
        historyRef.current.items.push(
          ...res.drafts.map((d) => ({
            difficulty: (d.difficulty ?? "").trim() || null,
            method: (d.method ?? "").trim(),
            result: (d.result ?? "").trim(),
          })),
        );
        setDrafts(res.drafts.map(toDraft));
        setPriorCount(res.priorCount ?? 0);
      } catch (e) {
        setError(e instanceof ClientApiError ? e.message : "生成できませんでした");
      }
    });
  }

  function patchDraft(i: number, patch: Partial<Draft>) {
    setDrafts((cur) => cur && cur.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  function removeDraft(i: number) {
    setDrafts((cur) => cur && cur.filter((_, j) => j !== i));
  }

  function save() {
    if (!drafts || drafts.length === 0) return;
    setError(null);
    if (drafts.some((d) => d.method.trim().length === 0)) {
      setError("「試したこと」が空の候補があります。入力するか、その候補を外してください。");
      return;
    }
    startSave(async () => {
      try {
        await api.post("/api/admin/seed-data", {
          keyword: keyword.trim(),
          items: drafts.map(seedDraftToPayload),
        });
        router.push("/admin/seed-data");
        router.refresh();
      } catch (e) {
        setError(e instanceof ClientApiError ? e.message : "保存できませんでした");
      }
    });
  }

  const busy = generating || saving;

  return (
    <div className="space-y-6">
      {/* 入力（Enter で「AIで生成する」が走るよう form にする） */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
        className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-4 shadow-[var(--shadow-card)]"
      >
        <div>
          <label htmlFor="seed-keyword" className="block text-sm font-bold">
            キーワード
          </label>
          <p className="text-xs text-[var(--color-ink-muted)]">
            テーマを入れます。例：料理を作る / 外出 / 靴下を履くのが難しい。
            スペースで区切ると複数テーマ（例：「料理 掃除」）を横断して生成します。
          </p>
          <div className="relative mt-1">
            <input
              id="seed-keyword"
              ref={keywordRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              disabled={busy}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 pr-10 text-sm"
            />
            {keyword && !busy && (
              <ClearFieldButton
                label="キーワードを消す"
                onClick={() => {
                  setKeyword("");
                  keywordRef.current?.focus();
                }}
              />
            )}
          </div>
        </div>

        <div>
          <label htmlFor="seed-count" className="block text-sm font-bold">
            生成件数
          </label>
          <select
            id="seed-count"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={busy}
            className="mt-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} 件
              </option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={busy} className={BTN_PRIMARY}>
          {generating ? "生成中…" : drafts ? "別の候補をもう一度生成する" : "AIで生成する"}
        </button>
        <p className="text-xs text-[var(--color-ink-muted)]">
          {drafts
            ? "キーワードはそのままで、押すたびに今出ている結果とは別の観点の候補を生成します。"
            : "生成した内容はこの画面で確認・編集できます。"}
          保存すると必ず「非公開」で登録され、公開は一覧から 1 件ずつ行います。
        </p>
      </form>

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {/* 生成結果の確認 */}
      {drafts && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">生成結果（{drafts.length} 件）</h2>
            <button type="button" onClick={save} disabled={busy || drafts.length === 0} className={BTN_PRIMARY}>
              {saving ? "保存中…" : "非公開で保存"}
            </button>
          </div>

          {priorCount > 0 && (
            <p className="text-xs text-[var(--color-ink-muted)]">
              このテーマではすでに {priorCount} 件の仮データがあります。今回はそれと重ならない切り口で生成しました。
              もう一度「AIで生成する」を押すと、さらに別の切り口が出ます。
            </p>
          )}

          {drafts.length === 0 && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              候補がありません。もう一度生成してください。
            </p>
          )}

          <ol className="space-y-4">
            {drafts.map((d, i) => (
              <li
                key={i}
                className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{i + 1}.</span>
                  <button
                    type="button"
                    onClick={() => removeDraft(i)}
                    disabled={busy}
                    className="text-xs text-[var(--color-danger)] underline disabled:opacity-50"
                  >
                    この候補を外す
                  </button>
                </div>
                <SeedDraftFields value={d} onChange={(patch) => patchDraft(i, patch)} />
              </li>
            ))}
          </ol>

          {drafts.length > 0 && (
            <button type="button" onClick={save} disabled={busy} className={BTN_PRIMARY}>
              {saving ? "保存中…" : "非公開で保存"}
            </button>
          )}
        </section>
      )}

      <p>
        <a href="/admin/seed-data" className={BTN_PLAIN}>
          仮データ一覧へ戻る
        </a>
      </p>
    </div>
  );
}
