"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ClientApiError } from "@/lib/client/api";
import { ADMIN_BTN } from "@/components/admin/admin-ui";
import {
  SeedRoadFields,
  SeedAttemptFields,
  seedRoadToPayload,
  seedAttemptToPayload,
  EMPTY_SEED_ATTEMPT,
  type SeedRoadValue,
  type SeedAttemptValue,
} from "@/components/admin/seed-draft-fields";

/**
 * Markdown取り込み画面 (管理画面更新指示書「複数の試したことを持つ道」)。
 *   貼り付け → 解析する (parse-markdown, AI は呼ばない) → 確認・編集 → 非公開で保存
 * 解析でエラーが出た場合は確認・編集画面へは進めない (指示書 §9 / §15)。
 */

interface RoadDraft {
  key: number;
  title: string;
  road: SeedRoadValue;
  attempts: (SeedAttemptValue & { key: number })[];
}

let keySeq = 0;
function nextKey() {
  keySeq += 1;
  return keySeq;
}

interface ParsedAttemptApi {
  method: string;
  result: string;
  attemptMemo: string | null;
}
interface ParsedRoadApi {
  title: string;
  difficulty: string | null;
  previouslyAble: string | null;
  goal: string | null;
  situation: string | null;
  status: string | null;
  nextAction: string | null;
  attempts: ParsedAttemptApi[];
}

function toRoadDraft(p: ParsedRoadApi): RoadDraft {
  return {
    key: nextKey(),
    title: p.title,
    road: {
      difficulty: p.difficulty ?? "",
      previouslyAble: p.previouslyAble ?? "",
      goal: p.goal ?? "",
      situation: p.situation ?? "",
      startedAt: "",
      memo: "",
      status: p.status ?? "",
      progress: "",
      nextAction: p.nextAction ?? "",
    },
    attempts: p.attempts.map((a) => ({
      key: nextKey(),
      method: a.method,
      result: a.result,
      triedAt: "",
      attemptMemo: a.attemptMemo ?? "",
    })),
  };
}

export function SeedMarkdownImporter() {
  const router = useRouter();
  const [markdown, setMarkdown] = useState("");
  const [parseErrors, setParseErrors] = useState<string[] | null>(null);
  const [roads, setRoads] = useState<RoadDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();
  const [saving, startSave] = useTransition();

  function parse() {
    setError(null);
    setParseErrors(null);
    if (markdown.trim().length === 0) {
      setError("Markdownを貼り付けてください。");
      return;
    }
    startParse(async () => {
      try {
        const res = await api.post<{ roads: ParsedRoadApi[]; errors: string[] }>(
          "/api/admin/seed-data/parse-markdown",
          { markdown },
        );
        if (res.errors.length > 0) {
          setParseErrors(res.errors);
          setRoads(null);
          return;
        }
        setParseErrors(null);
        setRoads(res.roads.map(toRoadDraft));
      } catch (e) {
        setError(e instanceof ClientApiError ? e.message : "解析できませんでした");
      }
    });
  }

  function patchRoad(roadKey: number, patch: Partial<SeedRoadValue>) {
    setRoads((cur) => cur && cur.map((r) => (r.key === roadKey ? { ...r, road: { ...r.road, ...patch } } : r)));
  }

  function patchAttempt(roadKey: number, attemptKey: number, patch: Partial<SeedAttemptValue>) {
    setRoads(
      (cur) =>
        cur &&
        cur.map((r) =>
          r.key !== roadKey
            ? r
            : {
                ...r,
                attempts: r.attempts.map((a) => (a.key === attemptKey ? { ...a, ...patch } : a)),
              },
        ),
    );
  }

  function removeRoad(roadKey: number) {
    setRoads((cur) => cur && cur.filter((r) => r.key !== roadKey));
  }

  function removeAttempt(roadKey: number, attemptKey: number) {
    setRoads(
      (cur) =>
        cur &&
        cur.map((r) =>
          r.key !== roadKey ? r : { ...r, attempts: r.attempts.filter((a) => a.key !== attemptKey) },
        ),
    );
  }

  function addAttempt(roadKey: number) {
    setRoads(
      (cur) =>
        cur &&
        cur.map((r) =>
          r.key !== roadKey ? r : { ...r, attempts: [...r.attempts, { ...EMPTY_SEED_ATTEMPT, key: nextKey() }] },
        ),
    );
  }

  function save() {
    if (!roads || roads.length === 0) return;
    setError(null);
    if (roads.some((r) => r.attempts.length === 0)) {
      setError("試したことが1件も無い道があります。追加するか、その道を外してください。");
      return;
    }
    if (roads.some((r) => (r.road.difficulty ?? "").trim().length === 0)) {
      setError("「困ったこと」が空の道があります。入力するか、その道を外してください。");
      return;
    }
    if (roads.some((r) => r.attempts.some((a) => a.method.trim().length === 0))) {
      setError("「方法」が空の試したことがあります。入力するか、外してください。");
      return;
    }
    startSave(async () => {
      try {
        await api.post("/api/admin/seed-data", {
          roads: roads.map((r) => ({
            ...seedRoadToPayload(r.road),
            attempts: r.attempts.map(seedAttemptToPayload),
          })),
        });
        router.push("/admin/seed-data");
        router.refresh();
      } catch (e) {
        setError(e instanceof ClientApiError ? e.message : "保存できませんでした");
      }
    });
  }

  const busy = parsing || saving;

  return (
    <div className="space-y-6">
      <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-4 shadow-[var(--shadow-card)]">
        <label htmlFor="seed-markdown" className="block text-sm font-bold">
          Markdownを貼り付け
        </label>
        <p className="text-xs text-[var(--color-ink-muted)]">
          ChatGPT等で作成したMarkdownをそのまま貼り付けます。「困っていたこと」のような道の項目や
          「試したこと」で始まる見出しを直接の子に持つ見出しを、自動的に「道」として区切ります
          （見出しの深さは自由です。「# できる道 仮データ」のような文書タイトルの下に道を置いても
          解析できます）。試したことの項目（方法・結果 等）は、見出しを増やす代わりに
          「- 方法：〜」のような箇条書きで書いても構いません。「試したこと1」のような個別の見出しを
          作らず、「試したこと」見出し1つの下に「- 方法：〜」を複数回書いて複数件を表しても
          解析できます（「方法」で始まる行が新しい試したことの区切りになります）。
          <strong>1回に取り込める道は1件までです。</strong>複数の道がある場合はMarkdownを分けて、
          1件ずつ取り込んでください。
        </p>
        <textarea
          id="seed-markdown"
          rows={14}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          disabled={busy}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs"
          placeholder={
            "# 道1\n\n## 困っていたこと\n...\n\n## 試したこと\n\n### 試したこと1\n- 方法：...\n- 結果：success\n\n（1回の取り込みで道は1件まで。見出しの深さは自由です）"
          }
        />
        <button type="button" onClick={parse} disabled={busy} className={ADMIN_BTN.success}>
          {parsing ? "解析中…" : "Markdownを解析する"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--color-danger)]">
          {error}
        </p>
      )}

      {parseErrors && parseErrors.length > 0 && (
        <div
          role="alert"
          className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-status-danger)] bg-[var(--color-status-danger-soft)] p-4 text-sm"
        >
          <p className="font-bold text-[var(--color-status-danger)]">
            Markdownを解析できませんでした。
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {parseErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <p className="text-[var(--color-ink-muted)]">内容を確認して、もう一度貼り付けてください。</p>
        </div>
      )}

      {roads && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold">
              解析結果（道 {roads.length} 件・試したこと {roads.reduce((n, r) => n + r.attempts.length, 0)} 件）
            </h2>
            <button type="button" onClick={save} disabled={busy || roads.length === 0} className={ADMIN_BTN.success}>
              {saving ? "保存中…" : "非公開で保存"}
            </button>
          </div>

          {roads.length === 0 && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              道がありません。もう一度Markdownを貼り付けて解析してください。
            </p>
          )}

          <ol className="space-y-6">
            {roads.map((r, ri) => (
              <li
                key={r.key}
                className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">
                    {ri + 1}. {r.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRoad(r.key)}
                    disabled={busy}
                    className="text-xs text-[var(--color-danger)] underline disabled:opacity-50"
                  >
                    この道を外す
                  </button>
                </div>

                <SeedRoadFields value={r.road} onChange={(patch) => patchRoad(r.key, patch)} />

                <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
                  <p className="text-xs font-bold text-[var(--color-ink-muted)]">
                    試したこと（{r.attempts.length}）
                  </p>
                  <ol className="space-y-3">
                    {r.attempts.map((a, ai) => (
                      <li
                        key={a.key}
                        className="space-y-2 rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">試したこと {ai + 1}</span>
                          <button
                            type="button"
                            onClick={() => removeAttempt(r.key, a.key)}
                            disabled={busy}
                            className="text-xs text-[var(--color-danger)] underline disabled:opacity-50"
                          >
                            外す
                          </button>
                        </div>
                        <SeedAttemptFields value={a} onChange={(patch) => patchAttempt(r.key, a.key, patch)} />
                      </li>
                    ))}
                  </ol>
                  <button
                    type="button"
                    onClick={() => addAttempt(r.key)}
                    disabled={busy}
                    className={ADMIN_BTN.neutral}
                  >
                    ＋ 試したことを追加
                  </button>
                </div>
              </li>
            ))}
          </ol>

          {roads.length > 0 && (
            <button type="button" onClick={save} disabled={busy} className={ADMIN_BTN.success}>
              {saving ? "保存中…" : "非公開で保存"}
            </button>
          )}
        </section>
      )}

      <p>
        <a href="/admin/seed-data" className={ADMIN_BTN.neutral}>
          仮データ一覧へ戻る
        </a>
      </p>
    </div>
  );
}
