"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TextField, TextAreaField } from "@/components/form";
import { VoiceInputButton } from "@/components/voice-input-button";
import { IconCircleAlert } from "@/components/icons";
import { FIELD_MAX } from "@/lib/constants";
import { api, ClientApiError } from "@/lib/client/api";
import type { RoadDTO } from "@/lib/serializers";

/**
 * ⑤ 自分の道を作る（登録画面・登録項目 更新指示書）。
 *
 * 一連の作成フローを 1 つの画面で完結させる:
 *   入力 → 画面内バリデーション → POST /api/v1/roads → 作成された road.id で自分の道へ遷移
 *
 * ここで作るのは Road だけ。Attempt（方法・結果・メモ・気づき・次に試すこと）は
 * このあと「試したことを記録」から追加する。ここでは一切作らない。
 *
 * - 送信中は二重送信を防ぐ（submitting ガード＋ボタン無効化）。
 * - 失敗しても入力内容は消さない。エラー種別ごとに利用者向けの文言を出す。
 * - タイトルは入力させない。API/DB とも存在しないので送らない（一覧見出しは difficulty で代替）。
 * - 必須は「できなくなったこと」「できるようになりたいこと」の 2 つだけ。「以前できていたこと」は
 *   任意（Road登録・編集画面 必須項目修正指示。全員が明確に答えられるとは限らないため）。
 */

type Values = {
  previouslyAble: string;
  difficulty: string;
  goal: string;
  startedAt: string;
  situation: string;
  memo: string;
};

const EMPTY: Values = {
  previouslyAble: "",
  difficulty: "",
  goal: "",
  startedAt: "",
  situation: "",
  memo: "",
};

const REQUIRED_ORDER: { key: "difficulty" | "goal"; label: string }[] = [
  { key: "difficulty", label: "できなくなったこと" },
  { key: "goal", label: "できるようになりたいこと" },
];

/** ClientApiError を、利用者が次に何をすればいいか分かる文言へ。 */
function messageForError(e: unknown): string {
  if (!(e instanceof ClientApiError)) {
    return "通信できませんでした。通信状態を確認して、もう一度お試しください。";
  }
  switch (e.code) {
    case "unauthorized":
      return "ログインの有効期限が切れているかもしれません。もう一度ログインしてから、道を作成してください。";
    case "forbidden":
      return "この操作は行えません。";
    case "not_found":
      return "作成先が見つかりませんでした。ページを開き直して、もう一度お試しください。";
    case "rate_limited":
      return "短い時間に何度も送信されました。少し待ってから、もう一度お試しください。";
    case "bad_request":
      return e.message || "入力内容を確認してください。";
    default:
      return "道を作成できませんでした。時間をおいて、もう一度お試しください。";
  }
}

export function RoadForm() {
  const router = useRouter();
  const [v, setV] = useState<Values>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const previouslyAbleId = useId();
  const difficultyId = useId();
  const goalId = useId();
  const FIELD_ID: Record<string, string> = {
    previouslyAble: previouslyAbleId,
    difficulty: difficultyId,
    goal: goalId,
  };

  const focusField = (id: string) => {
    if (typeof document !== "undefined") {
      document.getElementById(id)?.focus();
    }
  };

  const bind =
    (k: keyof Values) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [k]: e.target.value }));

  const appendVoice = (k: "previouslyAble" | "difficulty" | "goal") => (t: string) =>
    setV((prev) => ({ ...prev, [k]: prev[k] ? `${prev[k]} ${t}` : t }));

  function focusAlert() {
    requestAnimationFrame(() => alertRef.current?.focus());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const trimmed = {
      previouslyAble: v.previouslyAble.trim(),
      difficulty: v.difficulty.trim(),
      goal: v.goal.trim(),
    };

    // 「以前できていたこと」「できなくなったこと」「できるようになりたいこと」は 3 つとも必須。
    // 最初に空いている項目にエラーを出してそこへフォーカスする。
    const missing = REQUIRED_ORDER.find(({ key }) => !trimmed[key]);
    if (missing) {
      setFieldErrors({ [missing.key]: `「${missing.label}」を書いてください` });
      setError(`「${missing.label}」を書いてください。`);
      focusField(FIELD_ID[missing.key] ?? missing.key);
      return;
    }

    setSubmitting(true);
    setError(null);
    setNeedsLogin(false);
    setFieldErrors({});
    try {
      const road = await api.post<RoadDTO>("/api/v1/roads", {
        previouslyAble: trimmed.previouslyAble || undefined,
        difficulty: trimmed.difficulty,
        goal: trimmed.goal,
        startedAt: v.startedAt || undefined,
        situation: v.situation.trim() || undefined,
        memo: v.memo.trim() || undefined,
      });
      // 作成した Road を明示して遷移（一覧から推測しない）
      router.push(`/me/roads/${road.id}`);
      router.refresh();
      // 遷移するので submitting は解除しない（画面を離れる）
    } catch (err) {
      setSubmitting(false);
      setError(messageForError(err));
      setNeedsLogin(err instanceof ClientApiError && err.code === "unauthorized");
      if (err instanceof ClientApiError && Array.isArray(err.details)) {
        const fe: Record<string, string> = {};
        for (const d of err.details as { field: string; message: string }[]) {
          if (d.field in EMPTY) fe[d.field] = d.message;
        }
        setFieldErrors(fe);
      }
      focusAlert();
    }
  }

  return (
    <form className="space-y-6" onSubmit={onSubmit} noValidate>
      {error && (
        <div
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]"
          role="alert"
        >
          <p
            ref={alertRef}
            tabIndex={-1}
            className="flex items-start gap-1.5 font-medium outline-none"
          >
            <IconCircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            入力した内容は残っています。直してから、もう一度「この道を作る」を押せます。
          </p>
          {needsLogin && (
            <p className="mt-1">
              <a href="/login?next=/me/roads/new" className="font-semibold underline">
                ログインし直す
              </a>
            </p>
          )}
        </div>
      )}

      {/* 入力フォームのまとまり＝「作る場所」。枠線は他のカード（方法カード / 自分の道 / セクション）と
          同じ `--color-primary` の緑。下地は淡いグリーンのまま＝緑の面に白い入力欄が浮く。 */}
      {/* min-w-0: <fieldset> はブラウザ既定で min-width: min-content を持ち、
          中の要素（特に date input）の最小幅次第でスマホ幅より広がり右にはみ出ることがある。 */}
      <fieldset className="min-w-0 space-y-5 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-primary-tint)] p-5 shadow-[var(--shadow-card)] sm:p-6">
        <legend className="px-1 text-base font-bold">これから試していく「道」を作ります</legend>

        <div className="space-y-2">
          <TextAreaField
            label="以前は、どうしていましたか？"
            hint="いつもできていたことや、以前のやり方を書いてください。"
            value={v.previouslyAble}
            onChange={bind("previouslyAble")}
            error={fieldErrors.previouslyAble}
            placeholder="例：一人でシャツのボタンを留めていた"
            id={previouslyAbleId}
            maxLength={FIELD_MAX.text}
          />
          <VoiceInputButton onResult={appendVoice("previouslyAble")} />
        </div>

        <div className="space-y-2">
          <TextAreaField
            label="何ができなくなりましたか？"
            required
            hint="いつもの言葉で書いてください。病名や年齢は要りません。"
            value={v.difficulty}
            onChange={bind("difficulty")}
            error={fieldErrors.difficulty}
            placeholder="例：シャツのボタンが自分でとめられない"
            id={difficultyId}
            maxLength={FIELD_MAX.text}
          />
          <VoiceInputButton onResult={appendVoice("difficulty")} />
        </div>

        <div className="space-y-2">
          <TextAreaField
            label="これから、何ができるようになりたいですか？"
            required
            hint="「完全にできる」ではなくても大丈夫です。"
            value={v.goal}
            onChange={bind("goal")}
            error={fieldErrors.goal}
            placeholder="例：朝、自分で着替えを済ませたい"
            id={goalId}
            maxLength={FIELD_MAX.text}
          />
          <VoiceInputButton onResult={appendVoice("goal")} />
        </div>

        <TextField
          label="いつ頃から難しくなりましたか？（任意）"
          type="date"
          value={v.startedAt}
          onChange={bind("startedAt")}
          error={fieldErrors.startedAt}
        />

        <TextAreaField
          label="どんな場面で困っていますか？"
          value={v.situation}
          onChange={bind("situation")}
          placeholder="例：朝の着替え、外出時、お風呂の時間など"
          maxLength={FIELD_MAX.text}
        />

        <TextAreaField
          label="メモ・気づき"
          hint="試してみたいこと、気になったこと、周りの人とのやり取りなど、自由に書いてください。"
          value={v.memo}
          onChange={bind("memo")}
          maxLength={FIELD_MAX.longText}
        />
      </fieldset>

      <button
        type="submit"
        disabled={submitting}
        aria-busy={submitting}
        className="tap-target w-full rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-[var(--color-primary-ink)] disabled:opacity-60"
      >
        {submitting ? "作成しています…" : "この道を作る"}
      </button>

      <p className="text-center text-xs text-[var(--color-ink-muted)]">
        ここでは「道」を作るだけです。試した方法や結果は、このあと記録できます。
      </p>
    </form>
  );
}
