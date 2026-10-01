"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextAreaField } from "@/components/form";
import { IconPencil, IconRoute } from "@/components/icons";
import {
  RoadFormSubmit,
  RoadFormError,
  RoadFormSection,
  apiErrorToMessages,
  appendVoiceButton,
} from "@/components/road-form-parts";
import { FIELD_MAX } from "@/lib/constants";
import { api } from "@/lib/client/api";
import type { RoadDTO } from "@/lib/serializers";

/**
 * 道を編集 = 道そのもの（基本情報）を編集する画面。
 *
 * 2026-10-01「道を編集」と「道を育てる」を分離: 項目は作成画面（road-form.tsx）と同じ 4 つだけ。
 *   今、どんなことで困っていますか？＊ = difficulty
 *   これから、何ができるようになりたいですか？＊ = goal
 *   以前は、どうしていましたか？（任意） = previouslyAble
 *   メモ・気づき = memo
 * 日付・場面・状態・進捗・次に試すこと・タグは「道を育てる」（road-grow-form.tsx）で扱う。
 * PATCH はこの 4 項目だけを送るので、「道を育てる」側の値には触れない。
 * memo は「道を育てる」の「メモ」と同じ roads.memo（DB は分けていない。両方の画面で同じ内容が見える）。
 *
 * 「これから、何ができるようになりたいですか？」の必須/任意はローカル AI 検証の結果で決める予定。
 * 決まるまでは作成画面と同じく必須のまま（作成と編集で必ず一致させる）。
 */
export function RoadEditForm({ road }: { road: RoadDTO }) {
  const router = useRouter();
  const [v, setV] = useState({
    difficulty: road.difficulty ?? "",
    goal: road.goal ?? "",
    previouslyAble: road.previouslyAble ?? "",
    memo: road.memo ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const bind = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setV((p) => ({ ...p, [k]: e.target.value })),
  });
  const voice = (k: keyof typeof v) => appendVoiceButton(k, setV);

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
        difficulty: v.difficulty,
        goal: v.goal,
        // 任意項目は、空にして保存すればそのままクリアされる。
        previouslyAble: v.previouslyAble || null,
        memo: v.memo || null,
      });
      router.push(`/me/roads/${road.id}`);
      router.refresh();
    } catch (e2) {
      const m = apiErrorToMessages(e2);
      setError(m.error);
      setFieldErrors(m.fieldErrors);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <RoadFormError error={error} submitLabel="変更を保存" />

      {/* 並びは作成画面と同じ 困っていること → なりたい姿 → 以前（任意）→ メモ・気づき。 */}
      <RoadFormSection icon={IconRoute} title="この道について">
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
        <TextAreaField
          label="メモ・気づき"
          hint="試してみたこと、気になったこと、周りの人とのやり取りなど、自由に書いてください。"
          {...bind("memo")}
          error={fieldErrors.memo}
          maxLength={FIELD_MAX.longText}
          actions={voice("memo")}
        />
      </RoadFormSection>

      <RoadFormSubmit busy={busy} label="変更を保存" icon={IconPencil} />
    </form>
  );
}
