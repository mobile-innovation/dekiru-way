"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextField, TextAreaField } from "@/components/form";
import { IconLightbulb, IconMapPin, IconSprout } from "@/components/icons";
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
 * 道を育てる = 作った道の今の状態と、これからの一歩を整理する画面。
 * 実際に試したことと結果（過去）は「試したことを記録」（Attempt）で扱い、ここでは扱わない。
 * 「次に試すこと」（未来）はここ（2026-10-01 役割整理）。
 *
 * 2026-10-01「道を編集」と「道を育てる」を分離: 以前「道を編集」にあった追加項目をそのまま移した。
 *   今の状態: いつ頃から（startedAt）／場面（situation）／状態（status）／いまの進捗（progress）
 *   次の一歩: 次に試すこと（nextAction）／メモ（memo）／タグ
 *   （見出しは 2026-10-01 に「次の一歩・記録」→「次の一歩」。メモ・タグは memo の扱いを変えない／
 *   タグを編集できる画面を無くさないため、このカードに残す）
 * DB は変更していない。履歴は積まず、現在の値を上書き更新する（時系列の履歴機能は将来検討）。
 * PATCH はこの 7 項目だけを送るので、「道を編集」側の基本情報（困っていること等）には触れない。
 * memo は「道を編集」の「メモ・気づき」と同じ roads.memo（両方の画面で同じ内容が見える）。
 * 必須項目は無い。
 */
export function RoadGrowForm({ road }: { road: RoadDTO }) {
  const router = useRouter();
  const [v, setV] = useState({
    startedAt: road.startedAt ?? "",
    situation: road.situation ?? "",
    status: road.status ?? "",
    progress: road.progress ?? "",
    nextAction: road.nextAction ?? "",
    memo: road.memo ?? "",
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
  const voice = (k: keyof typeof v) => appendVoiceButton(k, setV);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      await api.patch(`/api/v1/roads/${road.id}`, {
        startedAt: v.startedAt || null,
        situation: v.situation || null,
        status: v.status || null,
        progress: v.progress || null,
        nextAction: v.nextAction || null,
        memo: v.memo || null,
        tags: v.tags
          .split(/[,、\s]+/)
          .map((s) => s.trim())
          .filter(Boolean),
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
      <RoadFormError error={error} submitLabel="保存" />

      <RoadFormSection icon={IconMapPin} title="今の状態">
        <TextField
          label="いつ頃から困るようになりましたか？"
          type="date"
          {...bind("startedAt")}
          error={fieldErrors.startedAt}
        />
        <TextAreaField
          label="どんな場面で困っていますか？"
          {...bind("situation")}
          error={fieldErrors.situation}
          maxLength={FIELD_MAX.text}
          actions={voice("situation")}
        />
        <TextField
          label="状態（例：継続中／一区切り）"
          {...bind("status")}
          error={fieldErrors.status}
          maxLength={FIELD_MAX.statusLabel}
        />
        <TextAreaField
          label="いまの進捗"
          {...bind("progress")}
          error={fieldErrors.progress}
          maxLength={FIELD_MAX.text}
          actions={voice("progress")}
        />
      </RoadFormSection>

      <RoadFormSection icon={IconLightbulb} title="次の一歩">
        <TextAreaField
          label="次に試すこと"
          hint="これから試してみたいことを書いてください。実際に試したことと結果は、自分の道の「試したことを記録」から残せます。"
          placeholder="例：車への乗り移り方を調べてみる"
          {...bind("nextAction")}
          error={fieldErrors.nextAction}
          maxLength={FIELD_MAX.text}
          actions={voice("nextAction")}
        />
        <TextAreaField
          label="メモ"
          {...bind("memo")}
          error={fieldErrors.memo}
          maxLength={FIELD_MAX.longText}
          actions={voice("memo")}
        />
        <TextField label="タグ（カンマ区切り）" {...bind("tags")} error={fieldErrors.tags} />
      </RoadFormSection>

      <RoadFormSubmit busy={busy} label="保存" icon={IconSprout} />
    </form>
  );
}
