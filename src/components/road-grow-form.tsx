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
 *   今の状態: 困っていること（situation）／状態（status）／いまの進捗（progress）／いつ頃から（startedAt）
 *   （並びは「困りごと → 今どうか → 前回から何が変わったか → いつ頃から」。2026-10-06 に日付を末尾へ。
 *   画面上の順番だけで、送る項目・保存処理は同じ）
 *   次の一歩: 次に試すこと（nextAction）／メモ（memo）／タグ
 *   （見出しは 2026-10-01 に「次の一歩・記録」→「次の一歩」。メモ・タグは memo の扱いを変えない／
 *   タグを編集できる画面を無くさないため、このカードに残す）
 * DB は変更していない。履歴は積まず、現在の値を上書き更新する（時系列の履歴機能は将来検討）。
 * PATCH はこの 7 項目だけを送るので、「道を編集」側の基本情報（困っていること等）には触れない。
 * memo は「道を編集」の「メモ・気づき」と同じ roads.memo（両方の画面で同じ内容が見える）。
 * 必須項目は無い。
 * 入力欄の初期行数は書く量の目安に合わせて控えめにする（場面 3／進捗 2／次に試すこと 3／メモ 3。
 * 文字数上限は FIELD_MAX のまま。2026-10-06）。
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
        <TextAreaField
          label="どんなことで困っていますか？"
          placeholder="例：鍋の中が見えにくく、火加減が分かりにくい"
          rows={3}
          {...bind("situation")}
          error={fieldErrors.situation}
          maxLength={FIELD_MAX.text}
          actions={voice("situation")}
        />
        {/* 状態 = roads.status（今どんな状態か。短い自由記述）／いまの進捗 = roads.progress（前回から何が変わったか）。
            違いが分かるよう補足を付ける（「道を育てる」UI改善指示書 §4）。 */}
        <TextField
          label="今の状態"
          hint={
            <>
              今の状態を書いてください。
              <br />
              例：一人では難しい／道具を使えばできる／できるようになった
            </>
          }
          {...bind("status")}
          error={fieldErrors.status}
          maxLength={FIELD_MAX.statusLabel}
        />
        <TextAreaField
          label="いまの進捗"
          hint="前回と比べて、できるようになったことや、まだ難しいことを書いてください。"
          rows={2}
          {...bind("progress")}
          error={fieldErrors.progress}
          maxLength={FIELD_MAX.text}
          actions={voice("progress")}
        />
        <TextField
          label="いつ頃から困るようになりましたか？"
          hint="※だいたいの日付で大丈夫です"
          type="date"
          {...bind("startedAt")}
          error={fieldErrors.startedAt}
        />
      </RoadFormSection>

      <RoadFormSection icon={IconLightbulb} title="次の一歩" lead="これから何を試しますか？">
        <TextAreaField
          label="次に試すこと"
          hint={
            <>
              これから試してみたいことを書いてください。
              <br />
              実際に試したことと結果は、あとで「試したことを記録」から残せます。
            </>
          }
          placeholder="例：車への乗り移り方を調べてみる"
          rows={3}
          {...bind("nextAction")}
          error={fieldErrors.nextAction}
          maxLength={FIELD_MAX.text}
          actions={voice("nextAction")}
        />
        <TextAreaField
          label="メモ"
          hint="気づいたことや、あとで残しておきたいことを書いてください。「道を編集」のメモ・気づきと同じ欄です。"
          rows={3}
          {...bind("memo")}
          error={fieldErrors.memo}
          maxLength={FIELD_MAX.longText}
          actions={voice("memo")}
        />
        <TextField
          label="タグ（任意）"
          hint="カンマ（,）や読点（、）で区切って入力します。"
          {...bind("tags")}
          error={fieldErrors.tags}
        />
      </RoadFormSection>

      <RoadFormSubmit busy={busy} label="保存" icon={IconSprout} />
    </form>
  );
}
