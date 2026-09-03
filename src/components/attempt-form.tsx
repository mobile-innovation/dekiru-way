"use client";

import type { ComponentProps, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { TextField, TextAreaField, Field } from "@/components/form";
import { VoiceInputButton } from "@/components/voice-input-button";
import {
  IconCheckCircle,
  IconFlask,
  IconGlobe,
  IconHeart,
  IconLightbulb,
  IconNotebookPen,
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
 * ⑥ 試したことを記録 / 編集 (指示書 6-⑥)。
 * 5 分類は必須。failed も success と同じ経路で保存する (指示書 2/23)。
 */

interface Props {
  roadId: string;
  initialTags?: string[];
  attempt?: AttemptDTO; // あれば編集モード
  /** 同じ道の他の記録（「前に試した方法」の選択肢に使う） */
  siblingAttempts?: { id: string; method: string; triedAt: string | null }[];
}

export function AttemptForm({ roadId, initialTags = [], attempt, siblingAttempts = [] }: Props) {
  const router = useRouter();
  const editing = Boolean(attempt);

  const [method, setMethod] = useState(attempt?.method ?? "");
  const [result, setResult] = useState<string>(attempt?.result ?? "");
  const [triedAt, setTriedAt] = useState(attempt?.triedAt ?? "");
  const [memo, setMemo] = useState(attempt?.memo ?? "");
  const [isPublished, setIsPublished] = useState(attempt?.isPublished ?? false);
  const [tags, setTags] = useState(initialTags.join(", "));
  // v6: できた％（本人入力・任意）／気持ち／その後／次に試すこと／前に試した方法
  const [recordPercent, setRecordPercent] = useState(
    typeof attempt?.achievementPercent === "number",
  );
  const [percent, setPercent] = useState(
    typeof attempt?.achievementPercent === "number" ? attempt.achievementPercent : 50,
  );
  const [feeling, setFeeling] = useState(attempt?.feeling ?? "");
  const [stateAfter, setStateAfter] = useState(attempt?.stateAfter ?? "");
  const [nextAction, setNextAction] = useState(attempt?.nextAction ?? "");
  const [previousAttemptId, setPreviousAttemptId] = useState(attempt?.previousAttemptId ?? "");
  const prevChoices = siblingAttempts.filter((s) => s.id !== attempt?.id);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function uploadPhotos(attemptId: string) {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.post(`/api/v1/attempts/${attemptId}/photos`, fd);
      } catch (e) {
        // 写真だけ失敗しても記録本体は残す
        setError(
          `記録は保存しましたが、写真の一部を保存できませんでした：${
            e instanceof ClientApiError ? e.message : "不明なエラー"
          }`,
        );
      }
    }
  }

  async function syncTags() {
    const list = tags
      .split(/[,、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    await api.patch(`/api/v1/roads/${roadId}`, { tags: list }).catch(() => {
      /* タグ同期失敗は致命的でない */
    });
  }

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
      const payload = {
        method: method.trim(),
        result,
        triedAt: triedAt || null,
        memo: memo || null,
        isPublished,
        achievementPercent: recordPercent ? percent : null,
        feeling: feeling.trim() || null,
        stateAfter: stateAfter.trim() || null,
        nextAction: nextAction.trim() || null,
        previousAttemptId: previousAttemptId || null,
      };

      let attemptId: string;
      if (editing && attempt) {
        const updated = await api.patch<AttemptDTO>(`/api/v1/attempts/${attempt.id}`, payload);
        attemptId = updated.id;
      } else {
        const createdAttempt = await api.post<AttemptDTO>(
          `/api/v1/roads/${roadId}/attempts`,
          payload,
        );
        attemptId = createdAttempt.id;
      }

      await syncTags();
      await uploadPhotos(attemptId);

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
          label="何を試しましたか？"
          required
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          error={fieldErrors.method}
          placeholder="例：ボタンエイド（ボタンを通す道具）を使ってみた"
          maxLength={FIELD_MAX.text}
        />
        <VoiceInputButton onResult={(t) => setMethod((v) => (v ? `${v} ${t}` : t))} />
      </Section>

      {/* ② 結果（＋できた度） */}
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
                    <span aria-hidden="true" className="text-lg">
                      {m.icon}
                    </span>
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

        {/* v6: できた度（本人の感覚。点数評価ではない） */}
        <Field
          label="どのくらいできるようになりましたか？"
          hint="やりたいことが、この方法でどのくらいできるようになったと感じたか。数字はあなたの感覚で大丈夫です。"
        >
          {({ id }) => (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={recordPercent}
                  onChange={(e) => setRecordPercent(e.target.checked)}
                  className="h-5 w-5"
                />
                できた度を記録する
              </label>
              {recordPercent && (
                <div className="flex items-center gap-3">
                  <input
                    id={id}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={percent}
                    onChange={(e) => setPercent(Number(e.target.value))}
                    aria-valuetext={`${percent}パーセント`}
                    className="w-full"
                  />
                  <span className="w-14 shrink-0 text-right font-bold tabular-nums">{percent}%</span>
                </div>
              )}
            </div>
          )}
        </Field>
      </Section>

      {/* ③ 気づき・変化 */}
      <Section icon={IconHeart} title="気づき・変化">
        <TextAreaField
          label="そのとき、どんな気持ちでしたか？"
          value={feeling}
          onChange={(e) => setFeeling(e.target.value)}
          placeholder="例：少しだけど自分でできてうれしかった／期待していたので正直がっかりした"
          maxLength={FIELD_MAX.text}
        />
        <TextAreaField
          label="その後、どうなりましたか？"
          value={stateAfter}
          onChange={(e) => setStateAfter(e.target.value)}
          placeholder="例：以前より一人でできるようになった／まだ一人では難しい"
          maxLength={FIELD_MAX.text}
        />
      </Section>

      {/* ④ 次の一歩 */}
      <Section icon={IconLightbulb} title="次の一歩">
        <TextField
          label="このあと、次に試すことは？"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="例：音声タイマーを試す"
          maxLength={FIELD_MAX.text}
        />
      </Section>

      {/* ⑤ 記録情報 */}
      <Section icon={IconNotebookPen} title="記録情報">
        <TextField
          label="試した時期"
          type="date"
          value={triedAt}
          onChange={(e) => setTriedAt(e.target.value)}
          error={fieldErrors.triedAt}
        />

        <TextAreaField
          label="メモ・気づき"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="やってみて感じたこと、次に活かせそうなこと"
          maxLength={FIELD_MAX.longText}
        />

        {prevChoices.length > 0 && (
          <Field
            label="前に試した方法（つながりがある場合）"
            hint="この方法の前に、実際に試していた方法があれば選んでください。順番が分かる場合だけで大丈夫です。"
          >
            {({ id }) => (
              <select
                id={id}
                value={previousAttemptId}
                onChange={(e) => setPreviousAttemptId(e.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base"
              >
                <option value="">指定しない</option>
                {prevChoices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.method.slice(0, 40)}
                    {s.triedAt ? `（${s.triedAt}）` : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        <TextField
          label="タグ（カンマ区切り。この道につきます）"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="例：着替え, 手先, 朝の支度"
        />

        <Field
          label="写真"
          hint="やってみた様子や使った道具など。JPEG/PNG/WebP/GIF、1枚5MBまで。"
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              aria-describedby={describedBy}
              className="block w-full text-sm"
            />
          )}
        </Field>
      </Section>

      {/* ⑥ 公開設定 */}
      <Section icon={IconGlobe} title="公開設定">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="mt-1 h-5 w-5"
          />
          <span>
            <span className="block font-bold">この記録を「経験」として公開する</span>
            <span className="block text-xs text-[var(--color-ink-muted)]">
              公開すると、同じことで困っている人が検索で見つけられます。名前は表示されません。
              あとから公開をやめることもできます。
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
          {busy ? "保存中…" : editing ? "変更を保存" : "記録する"}
        </button>
      </div>
    </form>
  );
}
