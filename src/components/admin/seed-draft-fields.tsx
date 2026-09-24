"use client";

import { ATTEMPT_RESULTS, RESULT_META } from "@/lib/constants";

/**
 * 仮データの編集フォーム部品。
 * 生成結果の確認画面 (実装指示書 8) と、1 件編集画面 (指示書 4) で共用する。
 *
 * 「複数の試したことを持つ道」対応 (管理画面更新指示書) で、Road 相当のフィールドと
 * Attempt 相当のフィールドを分離した:
 *   - `SeedRoadFields`: 道 (困ったこと・目標など) だけ。1 道につき 1 回描画する。
 *   - `SeedAttemptFields`: 試したこと (方法・結果など) だけ。1 道に複数回描画できる。
 *   - `SeedDraftFields`: 既存の AI 生成フロー用の互換ラッパー（Road 1 つ + Attempt 1 つを
 *     まとめて 1 画面に出す、従来どおりの見た目）。
 */

export interface SeedRoadValue {
  difficulty: string | null;
  previouslyAble: string | null;
  goal: string | null;
  situation: string | null;
  startedAt: string | null;
  memo: string | null;
  status: string | null;
  progress: string | null;
  nextAction: string | null;
}

export interface SeedAttemptValue {
  method: string;
  result: string;
  triedAt: string | null;
  attemptMemo: string | null;
}

export type SeedDraftValue = SeedRoadValue & SeedAttemptValue;

export const EMPTY_SEED_ROAD: SeedRoadValue = {
  difficulty: "",
  previouslyAble: "",
  goal: "",
  situation: "",
  startedAt: "",
  memo: "",
  status: "",
  progress: "",
  nextAction: "",
};

export const EMPTY_SEED_ATTEMPT: SeedAttemptValue = {
  method: "",
  result: "ongoing",
  triedAt: "",
  attemptMemo: "",
};

export const EMPTY_SEED_DRAFT: SeedDraftValue = { ...EMPTY_SEED_ROAD, ...EMPTY_SEED_ATTEMPT };

const LABEL = "block text-xs font-bold text-[var(--color-ink-muted)]";
const INPUT =
  "mt-0.5 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] px-2.5 py-1.5 text-sm";

/** 道 (Road) 相当のフィールドだけ。「困ったこと」は必須、それ以外は任意（<details> にまとめる）。 */
export function SeedRoadFields({
  value,
  onChange,
}: {
  value: SeedRoadValue;
  onChange: (patch: Partial<SeedRoadValue>) => void;
}) {
  const set =
    (key: keyof SeedRoadValue) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ [key]: e.target.value } as Partial<SeedRoadValue>);

  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL}>困ったこと（必須）</label>
        <textarea
          rows={2}
          value={value.difficulty ?? ""}
          onChange={set("difficulty")}
          className={INPUT}
          placeholder="何ができなくて困っているか"
        />
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
        </div>
      </details>
    </div>
  );
}

/** 試したこと (Attempt) 相当のフィールドだけ。1 つの道に複数回描画できる。 */
export function SeedAttemptFields({
  value,
  onChange,
}: {
  value: SeedAttemptValue;
  onChange: (patch: Partial<SeedAttemptValue>) => void;
}) {
  const set =
    (key: keyof SeedAttemptValue) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      onChange({ [key]: e.target.value } as Partial<SeedAttemptValue>);

  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL}>方法（必須）</label>
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
            <label className={LABEL}>試した時期</label>
            <input type="date" value={value.triedAt ?? ""} onChange={set("triedAt")} className={INPUT} />
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL}>気づき（結果の詳細・試した理由など）</label>
            <textarea rows={3} value={value.attemptMemo ?? ""} onChange={set("attemptMemo")} className={INPUT} />
          </div>
        </div>
      </details>
    </div>
  );
}

/** 従来の 1 画面ぶん (Road 1 + Attempt 1) をまとめて出す互換コンポーネント。AI 生成フローで使う。 */
export function SeedDraftFields({
  value,
  onChange,
}: {
  value: SeedDraftValue;
  onChange: (patch: Partial<SeedDraftValue>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL}>困ったこと</label>
        <textarea
          rows={2}
          value={value.difficulty ?? ""}
          onChange={(e) => onChange({ difficulty: e.target.value })}
          className={INPUT}
          placeholder="何ができなくて困っているか"
        />
      </div>

      <div>
        <label className={LABEL}>試したこと（必須）</label>
        <textarea
          rows={2}
          value={value.method}
          onChange={(e) => onChange({ method: e.target.value })}
          className={INPUT}
          placeholder="試した一つの方法"
        />
      </div>

      <div>
        <label className={LABEL}>結果</label>
        <select
          value={value.result}
          onChange={(e) => onChange({ result: e.target.value })}
          className={INPUT}
        >
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
            <textarea
              rows={2}
              value={value.previouslyAble ?? ""}
              onChange={(e) => onChange({ previouslyAble: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>やりたいこと</label>
            <textarea
              rows={2}
              value={value.goal ?? ""}
              onChange={(e) => onChange({ goal: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>困る場面</label>
            <textarea
              rows={2}
              value={value.situation ?? ""}
              onChange={(e) => onChange({ situation: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>難しくなった時期</label>
            <input
              type="date"
              value={value.startedAt ?? ""}
              onChange={(e) => onChange({ startedAt: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>困りごとメモ</label>
            <textarea
              rows={2}
              value={value.memo ?? ""}
              onChange={(e) => onChange({ memo: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>状態ラベル</label>
            <input
              type="text"
              value={value.status ?? ""}
              onChange={(e) => onChange({ status: e.target.value })}
              className={INPUT}
              placeholder="継続中 / 一区切り など"
            />
          </div>
          <div>
            <label className={LABEL}>いまの進み具合</label>
            <textarea
              rows={2}
              value={value.progress ?? ""}
              onChange={(e) => onChange({ progress: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>次に試すこと</label>
            <textarea
              rows={2}
              value={value.nextAction ?? ""}
              onChange={(e) => onChange({ nextAction: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>試した時期</label>
            <input
              type="date"
              value={value.triedAt ?? ""}
              onChange={(e) => onChange({ triedAt: e.target.value })}
              className={INPUT}
            />
          </div>
          <div>
            <label className={LABEL}>気づき（試したことのメモ）</label>
            <textarea
              rows={2}
              value={value.attemptMemo ?? ""}
              onChange={(e) => onChange({ attemptMemo: e.target.value })}
              className={INPUT}
            />
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

/** Road フィールドを API 送信用に整える（`attempts` は呼び出し側で組み立てる）。 */
export function seedRoadToPayload(v: SeedRoadValue): Record<string, unknown> {
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
  };
}

/** Attempt フィールドを API 送信用に整える。 */
export function seedAttemptToPayload(v: SeedAttemptValue): Record<string, unknown> {
  const clean = (s: string | null) => {
    const t = (s ?? "").trim();
    return t.length > 0 ? t : null;
  };
  return {
    method: (v.method ?? "").trim(),
    result: v.result,
    triedAt: clean(v.triedAt),
    attemptMemo: clean(v.attemptMemo),
  };
}
