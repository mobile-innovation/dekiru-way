"use client";

import { ATTEMPT_RESULTS, RESULT_META } from "@/lib/constants";

/**
 * 仮データ 1 件 (Road 相当 + Attempt 相当) の編集フォーム。
 * 生成結果の確認画面 (実装指示書 8) と、1 件編集画面 (指示書 4) で共用する。
 */

export interface SeedDraftValue {
  difficulty: string | null;
  previouslyAble: string | null;
  goal: string | null;
  situation: string | null;
  startedAt: string | null;
  memo: string | null;
  status: string | null;
  progress: string | null;
  nextAction: string | null;
  method: string;
  result: string;
  triedAt: string | null;
  attemptMemo: string | null;
}

export const EMPTY_SEED_DRAFT: SeedDraftValue = {
  difficulty: "",
  previouslyAble: "",
  goal: "",
  situation: "",
  startedAt: "",
  memo: "",
  status: "",
  progress: "",
  nextAction: "",
  method: "",
  result: "ongoing",
  triedAt: "",
  attemptMemo: "",
};

const LABEL = "block text-xs font-bold text-[var(--color-ink-muted)]";
const INPUT =
  "mt-0.5 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-1.5 text-sm";

export function SeedDraftFields({
  value,
  onChange,
}: {
  value: SeedDraftValue;
  onChange: (patch: Partial<SeedDraftValue>) => void;
}) {
  const set =
    (key: keyof SeedDraftValue) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value } as Partial<SeedDraftValue>);

  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL}>困ったこと</label>
        <textarea
          rows={2}
          value={value.difficulty ?? ""}
          onChange={set("difficulty")}
          className={INPUT}
          placeholder="何ができなくて困っているか"
        />
      </div>

      <div>
        <label className={LABEL}>試したこと（必須）</label>
        <textarea
          rows={2}
          value={value.method}
          onChange={set("method")}
          className={INPUT}
          placeholder="試した一つの方法"
        />
      </div>

      <div>
        <label className={LABEL}>結果</label>
        <select value={value.result} onChange={set("result")} className={INPUT}>
          {ATTEMPT_RESULTS.map((r) => (
            <option key={r} value={r}>
              {RESULT_META[r].label}
            </option>
          ))}
        </select>
      </div>

      <details className="rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] px-3 py-2">
        <summary className="cursor-pointer text-xs font-bold text-[var(--color-ink-muted)]">
          くわしく（任意）
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={LABEL}>以前できていたこと</label>
            <textarea rows={2} value={value.previouslyAble ?? ""} onChange={set("previouslyAble")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>やりたいこと</label>
            <textarea rows={2} value={value.goal ?? ""} onChange={set("goal")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>困る場面</label>
            <textarea rows={2} value={value.situation ?? ""} onChange={set("situation")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>難しくなった時期</label>
            <input type="date" value={value.startedAt ?? ""} onChange={set("startedAt")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>困りごとメモ</label>
            <textarea rows={2} value={value.memo ?? ""} onChange={set("memo")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>状態ラベル</label>
            <input type="text" value={value.status ?? ""} onChange={set("status")} className={INPUT} placeholder="継続中 / 一区切り など" />
          </div>
          <div>
            <label className={LABEL}>いまの進み具合</label>
            <textarea rows={2} value={value.progress ?? ""} onChange={set("progress")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>次に試すこと</label>
            <textarea rows={2} value={value.nextAction ?? ""} onChange={set("nextAction")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>試した時期</label>
            <input type="date" value={value.triedAt ?? ""} onChange={set("triedAt")} className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>気づき（試したことのメモ）</label>
            <textarea rows={2} value={value.attemptMemo ?? ""} onChange={set("attemptMemo")} className={INPUT} />
          </div>
        </div>
      </details>
    </div>
  );
}

/** フォーム値を API 送信用に整える。空文字は送らず（未指定扱い）、日付はそのまま。 */
export function seedDraftToPayload(v: SeedDraftValue): Record<string, unknown> {
  const clean = (s: string | null) => {
    const t = (s ?? "").trim();
    return t.length > 0 ? t : null;
  };
  return {
    difficulty: clean(v.difficulty),
    previouslyAble: clean(v.previouslyAble),
    goal: clean(v.goal),
    situation: clean(v.situation),
    startedAt: clean(v.startedAt),
    memo: clean(v.memo),
    status: clean(v.status),
    progress: clean(v.progress),
    nextAction: clean(v.nextAction),
    method: (v.method ?? "").trim(),
    result: v.result,
    triedAt: clean(v.triedAt),
    attemptMemo: clean(v.attemptMemo),
  };
}
