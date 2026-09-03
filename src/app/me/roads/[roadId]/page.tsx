import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { LinkButton, ResultBadge, StepFlow } from "@/components/ui";
import { IconNotebookPen, IconSprout } from "@/components/icons";
import {
  AttemptPublishToggle,
  DeleteAttemptButton,
  DeleteRoadButton,
  RoadVisibilityToggle,
} from "@/components/road-actions";
import { NextStepHelper } from "@/components/next-step-helper";

export const metadata: Metadata = { title: "自分の道" };

/** カード共通: 白地＋淡いグリーン枠＋控えめな影（他画面のカードと統一。指示書「自分の道詳細 v2」）。 */
const CARD = "rounded-[var(--radius-lg)] border border-[var(--color-primary)] shadow-[var(--shadow-card)]";

export default async function MyRoadPage({ params }: { params: Promise<{ roadId: string }> }) {
  const { roadId } = await params;
  const userId = await requirePageUserId();
  const road = await getMyRoad(userId, roadId);
  if (!road) notFound();

  const overview = [
    road.previouslyAble && { label: "以前できていた", body: road.previouslyAble },
    road.difficulty && { label: "できなくなった", body: road.difficulty },
    road.goal && { label: "やりたいこと", body: road.goal },
    road.situation && { label: "困っている場面", body: road.situation },
    road.progress && { label: "いまの進捗", body: road.progress },
    road.nextAction && { label: "次に試すこと", body: road.nextAction },
  ].filter(Boolean) as { label: string; body: React.ReactNode }[];

  return (
    // 中央コンテナ幅・上部ブロック・余白は「経験詳細」画面（/experiences/[id]）に合わせる。
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="space-y-4">
        <p className="text-sm">
          <Link href="/me">← 自分の道の一覧へ</Link>
        </p>

        <header className="space-y-3">
          <h1 className="flex items-start gap-2 text-xl font-bold">
            <IconSprout aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
            {road.title ?? road.difficulty ?? "（無題の道）"}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <RoadVisibilityToggle roadId={road.id} initial={road.visibility} />
            <LinkButton href={`/me/roads/${road.id}/edit`} variant="secondary">
              道を編集
            </LinkButton>
          </div>
          {road.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {road.tags.map((t) => (
                <li
                  key={t}
                  className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-xs"
                >
                  #{t}
                </li>
              ))}
            </ul>
          )}
        </header>
      </div>

      {overview.length > 0 && (
        <section className={`${CARD} bg-[var(--color-surface)] p-5`}>
          <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
            <IconSprout aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
            道のあらまし
          </h2>
          <StepFlow steps={overview} />
        </section>
      )}

      <section aria-labelledby="attempts-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="attempts-heading" className="flex items-center gap-2 text-base font-bold">
            <IconNotebookPen
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-[var(--color-primary)]"
            />
            試したこと（{road.attempts.length}）
          </h2>
          <LinkButton href={`/me/roads/${road.id}/attempts/new`}>試したことを記録</LinkButton>
        </div>

        {road.attempts.length === 0 ? (
          <div className={`${CARD} bg-[var(--color-primary-tint)] p-6 text-center`}>
            <IconNotebookPen
              aria-hidden="true"
              className="mx-auto h-8 w-8 text-[var(--color-primary)] opacity-70"
            />
            <p className="mt-2 font-bold">まだ記録がありません</p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              小さなことでも、試したことと結果を残しておくと道になります。
              うまくいかなかったことも、大切な記録です。
            </p>
          </div>
        ) : (
          <ol className="relative space-y-3 pl-5">
            <span
              aria-hidden="true"
              className="absolute bottom-4 left-[7px] top-4 w-[2px] bg-[var(--color-primary)] opacity-25"
            />
            {road.attempts.map((a, i) => (
              <li key={a.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-5 top-4 h-3 w-3 rounded-full bg-[var(--color-primary)] ring-4 ring-[var(--color-canvas)]"
                />
                <article className={`${CARD} bg-[var(--color-surface)] p-5`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--color-ink-muted)]">
                      {i + 1} 件目
                      {a.triedAt ? `・${a.triedAt}` : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <ResultBadge result={a.result} size="sm" />
                      {typeof a.achievementPercent === "number" && (
                        <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink-muted)]">
                          できた度 {a.achievementPercent}%
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap font-medium">{a.method}</p>
                  {a.feeling && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink-muted)]">
                      <span className="font-bold">気持ち：</span>
                      {a.feeling}
                    </p>
                  )}
                  {a.memo && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink-muted)]">
                      <span className="font-bold">気づき：</span>
                      {a.memo}
                    </p>
                  )}
                  {a.stateAfter && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink-muted)]">
                      <span className="font-bold">その後：</span>
                      {a.stateAfter}
                    </p>
                  )}
                  {a.nextAction && (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-ink-muted)]">
                      <span className="font-bold">次に試すこと：</span>
                      {a.nextAction}
                    </p>
                  )}
                  {a.photos.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {a.photos.map((p) => (
                        <li key={p.id}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.storageUrl}
                            alt={p.caption ?? "試したときの写真"}
                            className="h-20 w-20 rounded-[var(--radius-sm)] object-cover"
                            loading="lazy"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <AttemptPublishToggle attemptId={a.id} initial={a.isPublished} />
                    <div className="flex items-center gap-4">
                      <Link
                        href={`/me/roads/${road.id}/attempts/${a.id}/edit`}
                        className="text-sm font-semibold"
                      >
                        編集
                      </Link>
                      <DeleteAttemptButton attemptId={a.id} />
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        )}
      </section>

      <NextStepHelper roadId={road.id} />

      <section className="border-t border-[var(--color-border)] pt-6">
        <DeleteRoadButton roadId={road.id} />
      </section>
    </div>
  );
}
