"use client";

import type { ComponentProps, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextField, TextAreaField } from "@/components/form";
import { VoiceInputButton } from "@/components/voice-input-button";
import { IconCircleAlert, IconLightbulb, IconMapPin, IconRoute } from "@/components/icons";
import { FIELD_MAX } from "@/lib/constants";
import { api, ClientApiError } from "@/lib/client/api";
import type { RoadDTO } from "@/lib/serializers";

/**
 * 意味のまとまりごとのカード。色・余白・間隔は作成画面（road-form.tsx の fieldset）と同じ
 * トークン・クラスにそろえる（2026-10-01 編集画面の色・デザイン統一）: 緑枠 `--color-primary`、
 * 淡いグリーン下地 `--color-primary-tint` に白い入力欄が浮く、`--radius-lg`、`--shadow-card`。
 */
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
    <section className="min-w-0 space-y-5 rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-primary-tint)] p-5 shadow-[var(--shadow-card)] sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-bold">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * 道を編集（道を編集画面の編集可否修正指示）。
 *
 * 「できなくなったこと」は以前「一度設定すると変更できない」制限があったが廃止した。
 * 「やりたいこと・目標」と同じ、通常の必須項目として扱う（空にして保存しようとすると
 * 画面内バリデーションで止め、API へは送らない）。
 *
 * 項目名は作成画面（road-form.tsx）とそろえる（道の更新・編集画面 修正指示 2026-10-01）。
 * 変えたのは画面上のラベルだけで、保存先（difficulty / goal / previouslyAble …）と既存データはそのまま。
 * 「これから、何ができるようになりたいですか？」の必須/任意はローカル AI 検証の結果で決める予定。
 * 決まるまでは作成画面と同じく必須のまま（作成と編集で必ず一致させる）。
 */
export function RoadEditForm({ road }: { road: RoadDTO }) {
  const router = useRouter();
  const [v, setV] = useState({
    previouslyAble: road.previouslyAble ?? "",
    difficulty: road.difficulty ?? "",
    goal: road.goal ?? "",
    startedAt: road.startedAt ?? "",
    situation: road.situation ?? "",
    memo: road.memo ?? "",
    status: road.status ?? "",
    progress: road.progress ?? "",
    nextAction: road.nextAction ?? "",
    tags: road.tags.join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const bind = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((p) => ({ ...p, [k]: e.target.value })),
  });

  // 音声入力は作成画面と同じく、話した内容を既存の文の後ろに足す
  const voice = (k: keyof typeof v) => (
    <VoiceInputButton onResult={(t) => setV((p) => ({ ...p, [k]: p[k] ? `${p[k]} ${t}` : t }))} />
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    // 「困っていること」「できるようになりたいこと」は必須。空にして保存しようとしたら
    // API へ送らず、その場でエラーにする（登録画面と同じ必須ルール・同じ文言）。
    const fe: Record<string, string> = {};
    if (!v.difficulty.trim()) fe.difficulty = "「困っていること」を書いてください";
    if (!v.goal.trim()) fe.goal = "「できるようになりたいこと」を書いてください";
    if (Object.keys(fe).length > 0) {
      setFieldErrors(fe);
      setError("必須項目が空です。内容を確認してください。");
      return;
    }

    setBusy(true);
    try {
      await api.patch(`/api/v1/roads/${road.id}`, {
        // previouslyAble は任意項目なので、空にして保存すればそのままクリアされる。
        previouslyAble: v.previouslyAble || null,
        difficulty: v.difficulty,
        goal: v.goal,
        startedAt: v.startedAt || null,
        situation: v.situation || null,
        memo: v.memo || null,
        status: v.status || null,
        progress: v.progress || null,
        nextAction: v.nextAction || null,
        tags: v.tags
          .split(/[,、\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      });
      router.push(`/me/roads/${road.id}`);
      router.refresh();
    } catch (e2) {
      if (e2 instanceof ClientApiError) {
        setError(e2.message);
        if (Array.isArray(e2.details)) {
          const newFe: Record<string, string> = {};
          for (const d of e2.details as { field: string; message: string }[])
            newFe[d.field] = d.message;
          setFieldErrors(newFe);
        }
      } else {
        setError("保存できませんでした。");
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* エラー表示は作成画面と同じ見た目（アイコン＋入力が残っている旨） */}
      {error && (
        <div
          className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-3 text-sm text-[var(--color-danger)]"
          role="alert"
        >
          <p className="flex items-start gap-1.5 font-medium">
            <IconCircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
          <p className="mt-1 text-[var(--color-ink-muted)]">
            入力した内容は残っています。直してから、もう一度「変更を保存」を押せます。
          </p>
        </div>
      )}

      {/* ① この道について。困っていること（difficulty）= 道の見出し・必須項目なので先頭に置く。
          並びは作成画面と同じ 困っていること → なりたい姿 → 以前（任意）。 */}
      <Section icon={IconRoute} title="この道について">
        <TextAreaField
          label="今、どんなことで困っていますか？"
          required
          {...bind("difficulty")}
          error={fieldErrors.difficulty}
          maxLength={FIELD_MAX.text}
          actions={voice("difficulty")}
        />
        <TextAreaField
          label="これから、何ができるようになりたいですか？"
          required
          {...bind("goal")}
          error={fieldErrors.goal}
          maxLength={FIELD_MAX.text}
          actions={voice("goal")}
        />
        <TextAreaField
          label="以前は、どうしていましたか？（任意）"
          hint="以前できていたことや、以前のやり方を書いてください。書ける範囲で大丈夫です。"
          {...bind("previouslyAble")}
          error={fieldErrors.previouslyAble}
          maxLength={FIELD_MAX.text}
          actions={voice("previouslyAble")}
        />
      </Section>

      {/* ② 今の状態 */}
      <Section icon={IconMapPin} title="今の状態">
        <TextField
          label="いつ頃から困るようになりましたか？"
          type="date"
          {...bind("startedAt")}
          error={fieldErrors.startedAt}
        />
        <TextAreaField
          label="どんな場面で困っていますか？"
          {...bind("situation")}
          maxLength={FIELD_MAX.text}
          actions={voice("situation")}
        />
        <TextField
          label="状態（例：継続中／一区切り）"
          {...bind("status")}
          maxLength={FIELD_MAX.statusLabel}
        />
        <TextAreaField
          label="いまの進捗"
          {...bind("progress")}
          maxLength={FIELD_MAX.text}
          actions={voice("progress")}
        />
      </Section>

      {/* ③ 次の一歩・記録 */}
      <Section icon={IconLightbulb} title="次の一歩・記録">
        <TextAreaField
          label="次に試すこと"
          {...bind("nextAction")}
          maxLength={FIELD_MAX.text}
          actions={voice("nextAction")}
        />
        <TextAreaField
          label="メモ"
          {...bind("memo")}
          maxLength={FIELD_MAX.longText}
          actions={voice("memo")}
        />
        <TextField label="タグ（カンマ区切り）" {...bind("tags")} />
      </Section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(`/me/roads/${road.id}`)}
          className="tap-target rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-3 text-sm font-semibold"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          // 作成画面の「この道を作る」と同じ主ボタンのクラス
          className="tap-target rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-[var(--color-primary-ink)] disabled:opacity-60"
        >
          {busy ? "保存中…" : "変更を保存"}
        </button>
      </div>
    </form>
  );
}
