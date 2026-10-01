"use client";

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
import { RoadFormError, RoadFormSection, RoadFormSubmit } from "@/components/road-form-parts";
import { VoiceInputButton } from "@/components/voice-input-button";
import { api, ClientApiError } from "@/lib/client/api";
import { ATTEMPT_RESULTS, RESULT_META, FIELD_MAX } from "@/lib/constants";
import type { AttemptDTO } from "@/lib/serializers";

/**
 * ⑥ 試したことを記録 / 編集（記録を編集画面 変更指示書 v1）。
 * 5 分類は必須。failed も success と同じ経路で保存する (指示書 2/23)。
 *
 * 入力項目を「試したこと」「結果」「メモ・気づき（任意）」「公開設定」に絞り、
 * 記録するハードルを下げる（v1 §2-7）。音声入力・次の一歩・試した時期・タグ入力は
 * この画面からは外したが、DB/API 側の method/result/triedAt/memo/isPublished/nextAction
 * ／タグ機能は変更しない。UI から集めていない項目は保存ペイロードに含めず、
 * 既存値を意図せず NULL・空文字で上書きしない（指示書「実装時の注意」5）。
 *
 * 見た目は「道を編集」「道を育てる」と同じ部品（road-form-parts.tsx）で統一（2026-10-01）:
 * 淡いグリーン地のカード・エラー表示・全幅の主ボタン（アイコン付き）。キャンセルは置かない
 * （道を編集・道を育てると同じく、画面上部の「← … へ戻る」で戻る）。
 * 入力項目・結果の 5 択・公開設定・保存処理・バリデーションは変更なし。
 * 音声入力: 9/23 に外したが、2026-10-01 に道の画面と同じ「音声で入力」ボタンを自由記述の 2 欄
 * （試したこと・メモ・気づき）に戻した。話した内容は既存の文の後ろに空白区切りで足す。
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

  // 音声入力は道の画面と同じく、話した内容を既存の文の後ろに足す
  const append = (set: React.Dispatch<React.SetStateAction<string>>) => (t: string) =>
    set((p) => (p ? `${p} ${t}` : t));

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
          for (const d of e2.details as { field: string; message: string }[])
            fe[d.field] = d.message;
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
      <RoadFormError error={error} submitLabel={editing ? "保存する" : "記録する"} />

      {/* ① 何を試したか */}
      <RoadFormSection icon={IconFlask} title="試したこと">
        <TextAreaField
          label="どんな方法を試しましたか？"
          hint="実際にやってみた方法を書いてください。"
          required
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          error={fieldErrors.method}
          placeholder={"例：クッションを変えてみた\n例：別の道具を使ってみた"}
          maxLength={FIELD_MAX.text}
          actions={<VoiceInputButton onResult={append(setMethod)} />}
        />
      </RoadFormSection>

      {/* ② 結果 */}
      <RoadFormSection icon={IconCheckCircle} title="結果">
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
                    // 選択中は主ボタンと同じ濃い緑の地に白い枠・白い文字（2026-10-01）。
                    // 未選択は従来どおり白地＋通常の枠線、アイコンは結果ごとの色。
                    className={`flex items-start gap-2 rounded-[var(--radius-md)] border p-3 text-left ${
                      selected
                        ? "border-[var(--color-surface)] bg-[var(--color-primary)] text-[var(--color-primary-ink)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)]"
                    }`}
                  >
                    <RIcon
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0"
                      style={{
                        color: selected
                          ? "var(--color-primary-ink)"
                          : `var(--color-result-${m.tokenKey})`,
                      }}
                    />
                    <span>
                      <span className="block font-bold">{m.label}</span>
                      <span
                        className={`block text-xs ${
                          selected
                            ? "text-[var(--color-primary-ink)]"
                            : "text-[var(--color-ink-muted)]"
                        }`}
                      >
                        {m.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      </RoadFormSection>

      {/* ③ メモ・気づき */}
      <RoadFormSection icon={IconNotebookPen} title="メモ・気づき">
        <TextAreaField
          label="メモ・気づき（任意）"
          hint="やってみて感じたこと、気づいたこと、変化などを自由に書いてください。"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="例：やってみて分かったこと、次に活かせそうなこと"
          maxLength={FIELD_MAX.longText}
          actions={<VoiceInputButton onResult={append(setMemo)} />}
        />
      </RoadFormSection>

      {/* ④ 公開設定 */}
      <RoadFormSection icon={IconGlobe} title="公開設定">
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
      </RoadFormSection>

      <RoadFormSubmit
        busy={busy}
        label={editing ? "保存する" : "記録する"}
        icon={IconNotebookPen}
      />
    </form>
  );
}
