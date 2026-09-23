"use client";

import type { ComponentProps, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextAreaField, Field } from "@/components/form";
import {
  IconCheckCircle,
  IconFlask,
  IconGlobe,
  IconNotebookPen,
  resultIcon,
} from "@/components/icons";
import { api, ClientApiError } from "@/lib/client/api";
import { ATTEMPT_RESULTS, RESULT_META, FIELD_MAX } from "@/lib/constants";
import type { AttemptDTO } from "@/lib/serializers";

/** 意味のまとまりごとのカード（「自分の道」詳細画面と同じ緑枠カード）。 */
function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: (p: ComponentProps<"svg">) => ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * ⑥ 試したことを記録 / 編集（記録を編集画面 変更指示書 v1）。
 * 5 分類は必須。failed も success と同じ経路で保存する (指示書 2/23)。
 *
 * 入力項目を「試したこと」「結果」「メモ・気づき（任意）」「公開設定」に絞り、
 * 記録するハードルを下げる（v1 §2-7）。音声入力・次の一歩・試した時期・タグ入力は
 * この画面からは外したが、DB/API 側の method/result/triedAt/memo/isPublished/nextAction
 * ／タグ機能は変更しない。UI から集めていない項目は保存ペイロードに含めず、
 * 既存値を意図せず NULL・空文字で上書きしない（指示書「実装時の注意」5）。
 */

interface Props {
  roadId: string;
  attempt?: AttemptDTO; // あれば編集モード
}

export function AttemptForm({ roadId, attempt }: Props) {
  const router = useRouter();
  const editing = Boolean(attempt);

  const [method, setMethod] = useState(attempt?.method ?? "");
  const [result, setResult] = useState<string>(attempt?.result ?? "");
  const [memo, setMemo] = useState(attempt?.memo ?? "");
  // 新規記録は既定で「公開」OFF（オプトイン。編集時は既存の値をそのまま尊重する。
  // 「試したことを記録」公開設定の初期値修正指示）。
  const [isPublished, setIsPublished] = useState(attempt?.isPublished ?? false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!method.trim()) {
      setFieldErrors({ method: "試したことを書いてください" });
      return;
    }
    if (!result) {
      setFieldErrors({ result: "結果を選んでください" });
      return;
    }

    setBusy(true);
    try {
      // triedAt / nextAction / タグはこの画面から集めていない。キー自体を送らず、
      // 編集時は既存値をそのまま残す（新規時は未設定のまま作成される）。
      const payload = {
        method: method.trim(),
        result,
        memo: memo || null,
        isPublished,
      };

      if (editing && attempt) {
        await api.patch<AttemptDTO>(`/api/v1/attempts/${attempt.id}`, payload);
      } else {
        await api.post<AttemptDTO>(`/api/v1/roads/${roadId}/attempts`, payload);
      }

      router.push(`/me/roads/${roadId}`);
      router.refresh();
    } catch (e2) {
      if (e2 instanceof ClientApiError) {
        setError(e2.message);
        if (Array.isArray(e2.details)) {
          const fe: Record<string, string> = {};
          for (const d of e2.details as { field: string; message: string }[]) fe[d.field] = d.message;
          setFieldErrors(fe);
        }
      } else {
        setError("保存できませんでした。時間をおいて試してください。");
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <p
          role="alert"
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-3 text-sm font-medium text-[var(--color-danger)]"
        >
          {error}
        </p>
      )}

      {/* ① 何を試したか */}
      <Section icon={IconFlask} title="試したこと">
        <TextAreaField
          label="どんな方法を試しましたか？"
          hint="実際にやってみた方法を書いてください。"
          required
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          error={fieldErrors.method}
          placeholder={"例：クッションを変えてみた\n例：別の道具を使ってみた"}
          maxLength={FIELD_MAX.text}
        />
      </Section>

      {/* ② 結果 */}
      <Section icon={IconCheckCircle} title="結果">
        <Field label="結果" required error={fieldErrors.result}>
          {({ describedBy, invalid }) => (
            <div
              role="radiogroup"
              aria-label="結果"
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className="grid gap-2 sm:grid-cols-2"
            >
              {ATTEMPT_RESULTS.map((r) => {
                const m = RESULT_META[r];
                const RIcon = resultIcon(r);
                const selected = result === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setResult(r)}
                    style={
                      selected
                        ? {
                            borderColor: `var(--color-result-${m.tokenKey})`,
                            backgroundColor: `var(--color-result-${m.tokenKey}-soft)`,
                          }
                        : undefined
                    }
                    className={`flex items-start gap-2 rounded-[var(--radius-md)] border p-3 text-left ${
                      selected ? "" : "border-[var(--color-border)] bg-[var(--color-surface)]"
                    }`}
                  >
                    <RIcon
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0"
                      style={{ color: `var(--color-result-${m.tokenKey})` }}
                    />
                    <span>
                      <span className="block font-bold">{m.label}</span>
                      <span className="block text-xs text-[var(--color-ink-muted)]">
                        {m.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      </Section>

      {/* ③ メモ・気づき */}
      <Section icon={IconNotebookPen} title="メモ・気づき">
        <TextAreaField
          label="メモ・気づき（任意）"
          hint="やってみて感じたこと、気づいたこと、変化などを自由に書いてください。"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="例：やってみて分かったこと、次に活かせそうなこと"
          maxLength={FIELD_MAX.longText}
        />
      </Section>

      {/* ④ 公開設定 */}
      <Section icon={IconGlobe} title="公開設定">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-bold">この経験を公開する</span>
            <span className="block text-xs text-[var(--color-ink-muted)]">
              あなたの経験が、誰かの次の一歩になるかもしれません。成功した方法だけでなく、
              うまくいかなかった方法も、同じことで困っている人にとって大切な情報になります。
              名前は表示されません。あとから公開をやめることもできます。
            </span>
          </span>
        </label>
      </Section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(`/me/roads/${roadId}`)}
          className="tap-target rounded-[var(--radius-pill)] border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={busy}
          className="tap-target rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--color-primary-ink)] disabled:opacity-60"
        >
          {busy ? "保存中…" : editing ? "保存する" : "記録する"}
        </button>
      </div>
    </form>
  );
}
