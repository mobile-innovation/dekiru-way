"use client";

import type { ComponentProps, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TextField, TextAreaField } from "@/components/form";
import { IconLightbulb, IconMapPin, IconRoute, IconSprout } from "@/components/icons";
import { FIELD_MAX } from "@/lib/constants";
import { api, ClientApiError } from "@/lib/client/api";
import type { RoadDTO } from "@/lib/serializers";

/** 意味のまとまりごとのカード（他の記録画面と同じ緑枠カード）。 */
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

export function RoadEditForm({ road }: { road: RoadDTO }) {
  const router = useRouter();
  const [v, setV] = useState({
    title: road.title ?? "",
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await api.patch(`/api/v1/roads/${road.id}`, {
        title: v.title || null,
        previouslyAble: v.previouslyAble || null,
        difficulty: v.difficulty || null,
        goal: v.goal || null,
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
          const fe: Record<string, string> = {};
          for (const d of e2.details as { field: string; message: string }[]) fe[d.field] = d.message;
          setFieldErrors(fe);
        }
      } else {
        setError("保存できませんでした。");
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

      {/* ① 道の基本 */}
      <Section icon={IconSprout} title="道の基本">
        <TextField
          label="タイトル（一覧での見出し）"
          {...bind("title")}
          error={fieldErrors.title}
          maxLength={FIELD_MAX.title}
        />
      </Section>

      {/* ② この道について */}
      <Section icon={IconRoute} title="この道について">
        <TextAreaField
          label="以前できていたこと"
          {...bind("previouslyAble")}
          maxLength={FIELD_MAX.text}
        />
        <TextAreaField
          label="できなくなったこと"
          {...bind("difficulty")}
          error={fieldErrors.difficulty}
          maxLength={FIELD_MAX.text}
        />
        <TextAreaField label="やりたいこと・目標" {...bind("goal")} maxLength={FIELD_MAX.text} />
      </Section>

      {/* ③ 今の状態 */}
      <Section icon={IconMapPin} title="今の状態">
        <TextField
          label="いつ頃から難しくなったか"
          type="date"
          {...bind("startedAt")}
          error={fieldErrors.startedAt}
        />
        <TextAreaField label="困っている場面" {...bind("situation")} maxLength={FIELD_MAX.text} />
        <TextField
          label="状態（例：継続中／一区切り）"
          {...bind("status")}
          maxLength={FIELD_MAX.statusLabel}
        />
        <TextAreaField label="いまの進捗" {...bind("progress")} maxLength={FIELD_MAX.text} />
      </Section>

      {/* ④ 次の一歩・記録 */}
      <Section icon={IconLightbulb} title="次の一歩・記録">
        <TextAreaField label="次に試すこと" {...bind("nextAction")} maxLength={FIELD_MAX.text} />
        <TextAreaField label="メモ" {...bind("memo")} maxLength={FIELD_MAX.longText} />
        <TextField label="タグ（カンマ区切り）" {...bind("tags")} />
      </Section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push(`/me/roads/${road.id}`)}
          className="tap-target rounded-[var(--radius-pill)] border border-[var(--color-border)] px-5 py-2.5 text-sm font-semibold"
        >
          キャンセル
        </button>
        <button
          type="submit"
          disabled={busy}
          className="tap-target rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--color-primary-ink)] disabled:opacity-60"
        >
          {busy ? "保存中…" : "変更を保存"}
        </button>
      </div>
    </form>
  );
}
