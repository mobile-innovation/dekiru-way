import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { Card, LinkButton, ResultBadge, StepFlow } from "@/components/ui";
import {
  AttemptPublishToggle,
  DeleteAttemptButton,
  DeleteRoadButton,
  RoadVisibilityToggle,
} from "@/components/road-actions";
import { NextStepHelper } from "@/components/next-step-helper";

export const metadata: Metadata = { title: "自分の道" };

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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <p className="text-sm">
        <Link href="/me">← 自分の道の一覧へ</Link>
      </p>

      <header className="space-y-3">
        <h1 className="text-xl font-bold">{road.title ?? road.difficulty ?? "（無題の道）"}</h1>
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

      {overview.length > 0 && (
        <Card as="section">
          <h2 className="mb-4 text-base font-bold">道のあらまし</h2>
          <StepFlow steps={overview} />
        </Card>
      )}

      <section aria-labelledby="attempts-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="attempts-heading" className="text-base font-bold">
            試したこと（{road.attempts.length}）
          </h2>
          <LinkButton href={`/me/roads/${road.id}/attempts/new`}>試したことを記録</LinkButton>
        </div>

        {road.attempts.length === 0 ? (
          <p className="card p-5 text-sm text-[var(--color-ink-muted)]">
            まだ記録がありません。小さなことでも、試したことと結果を残しておくと道になります。
            うまくいかなかったことも、大切な記録です。
          </p>
        ) : (
          <ol className="space-y-3">
            {road.attempts.map((a, i) => (
              <li key={a.id}>
                <Card as="article">
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
                </Card>
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
