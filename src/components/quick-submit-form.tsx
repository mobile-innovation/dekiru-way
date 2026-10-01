"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { Field, TextAreaField } from "@/components/form";
import { IconCheckCircle, resultIcon } from "@/components/icons";
import { ATTEMPT_RESULTS, RESULT_META, FIELD_MAX } from "@/lib/constants";
import { api, ClientApiError } from "@/lib/client/api";

/**
 * SNS からの簡易登録フォーム (/try)。
 * - 1 画面・最小入力。困っていたこと / 試したこと / 試した結果 の 3 つだけ。
 * - 二重送信を防ぐ (送信中はボタンを無効化し「登録中…」表示)。
 * - エラーは項目ごとに具体的な文言で出す。
 * - 成功したら、その場でお礼メッセージに差し替える。
 * - 2026-10-01 最終UI調整: 2 つの入力欄は 400 文字を想定して 4 行（約 120px）、登録前の注意文は 13px。
 */

type FieldKey = "difficulty" | "method" | "result";

export function QuickSubmitForm({ initialProblem = "" }: { initialProblem?: string }) {
  const [difficulty, setDifficulty] = useState(initialProblem);
  const [method, setMethod] = useState("");
  const [result, setResult] = useState<string>("");
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card as="section" className="space-y-4 text-center">
        <IconCheckCircle
          aria-hidden="true"
          className="mx-auto h-10 w-10 text-[var(--color-primary)]"
        />
        <p className="font-bold">
          ありがとうございます。あなたの「試したこと」が、誰かの次の一歩につながります。
        </p>
        <p className="text-sm text-[var(--color-ink-muted)]">
          登録した内容は、運営が確認したうえで公開されます。
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className="text-sm font-semibold underline">
            できる道のトップへ
          </Link>
          <Link href="/experiences" className="text-sm font-semibold underline">
            ほかの人が試した方法を見る
          </Link>
        </div>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFormError(null);

    const next: Partial<Record<FieldKey, string>> = {};
    if (!difficulty.trim()) next.difficulty = "困っていたことを入力してください。";
    if (!method.trim()) next.method = "試したことを入力してください。";
    if (!result) next.result = "試した結果を選んでください。";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      await api.post("/api/v1/quick-experiences", {
        difficulty: difficulty.trim(),
        method: method.trim(),
        result,
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ClientApiError) {
        // サーバ側の項目エラーを拾えたら該当項目に出す
        const details = Array.isArray(err.details)
          ? (err.details as { field: string; message: string }[])
          : [];
        const mapped: Partial<Record<FieldKey, string>> = {};
        for (const d of details) {
          if (d.field === "difficulty" || d.field === "method" || d.field === "result") {
            mapped[d.field] = d.message;
          }
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
        } else {
          setFormError(err.message);
        }
      } else {
        setFormError("登録できませんでした。時間をおいて、もう一度お試しください。");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <TextAreaField
        label="困っていたこと"
        required
        rows={4}
        maxLength={FIELD_MAX.quickText}
        placeholder="例：シャツのボタンがとめにくい"
        value={difficulty}
        error={errors.difficulty}
        onChange={(e) => setDifficulty(e.target.value)}
      />

      <TextAreaField
        label="試したこと"
        required
        rows={4}
        maxLength={FIELD_MAX.quickText}
        hint="ひとことでも大丈夫です。うまくいかなかった方法でもかまいません。"
        placeholder="何を試しましたか？"
        value={method}
        error={errors.method}
        onChange={(e) => setMethod(e.target.value)}
      />

      <Field label="試した結果" required error={errors.result}>
        {({ describedBy, invalid }) => (
          <div
            role="radiogroup"
            aria-label="試した結果"
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
                  className={`flex items-center gap-2 rounded-[var(--radius-md)] border p-3 text-left ${
                    selected ? "" : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  <RIcon
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0"
                    style={{ color: `var(--color-result-${m.tokenKey})` }}
                  />
                  <span className="font-semibold">{m.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </Field>

      {formError && (
        <p role="alert" className="text-sm font-medium text-[var(--color-danger)]">
          {formError}
        </p>
      )}

      <div className="space-y-2">
        <Button type="submit" disabled={busy} className="w-full sm:w-auto">
          {busy ? "登録中…" : "試したことを登録する"}
        </Button>
        <p className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
          登録した内容は、運営が確認してから「できる道」で公開されます。
        </p>
      </div>
    </form>
  );
}
