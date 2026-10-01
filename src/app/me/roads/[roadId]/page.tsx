import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { Callout, LinkButton, ResultBadge, StepFlow } from "@/components/ui";
import { IconNotebookPen, IconPencil, IconPlus, IconSprout } from "@/components/icons";
import {
  AttemptPublishToggle,
  DeleteAttemptButton,
  DeleteRoadButton,
} from "@/components/road-actions";

export const metadata: Metadata = { title: "自分の道" };

/** カード共通: 白地＋淡いグリーン枠＋控えめな影（他画面のカードと統一。指示書「自分の道詳細 v2」）。 */
const CARD =
  "rounded-[var(--radius-lg)] border border-[var(--color-primary)] shadow-[var(--shadow-card)]";

export default async function MyRoadPage({ params }: { params: Promise<{ roadId: string }> }) {
  const { roadId } = await params;
  const userId = await requirePageUserId();
  const road = await getMyRoad(userId, roadId);
  if (!road) notFound();

  // 見出しは作成・編集画面の項目名と同じ言葉（2026-10-01「道を編集」画面 最終修正指示）。
  // 並びは「以前 → 今 → これから」の時間の流れ（縦フローで道として見せるため、フォームの入力順とは違う）。
  const overview = [
    road.previouslyAble && { label: "以前は、どうしていましたか？", body: road.previouslyAble },
    road.difficulty && { label: "今、どんなことで困っていますか？", body: road.difficulty },
    road.goal && { label: "これから、何ができるようになりたいですか？", body: road.goal },
    road.situation && { label: "どんな場面で困っていますか？", body: road.situation },
    road.progress && { label: "いまの進捗", body: road.progress },
    road.nextAction && { label: "次に試すこと", body: road.nextAction },
  ].filter(Boolean) as { label: string; body: React.ReactNode }[];

  return (
    // 中央コンテナ幅・上部ブロックは「経験詳細」画面（/experiences/[id]）に合わせる。
    <div className="mx-auto w-full max-w-5xl">
      <div className="space-y-4">
        <p className="text-sm">
          <Link href="/me">← 自分の道の一覧へ</Link>
        </p>

        <header className="space-y-3">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            <h1 className="flex items-start gap-2 text-xl font-bold">
              <IconSprout
                aria-hidden="true"
                className="mt-1 h-5 w-5 shrink-0 text-[var(--color-primary)]"
              />
              {road.difficulty ?? "（無題の道）"}
            </h1>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* 道を編集 = 道そのもの（基本情報）／道を育てる = 今の状態・次の一歩（2026-10-01 分離）。
                  どちらも既存の主ボタン（LinkButton の primary）。区別はアイコン（鉛筆／芽）とラベルで付ける。 */}
              <LinkButton href={`/me/roads/${road.id}/edit`}>
                <IconPencil aria-hidden="true" className="h-4 w-4 shrink-0" />
                道を編集
              </LinkButton>
              <LinkButton href={`/me/roads/${road.id}/grow`}>
                <IconSprout aria-hidden="true" className="h-4 w-4 shrink-0" />
                道を育てる
              </LinkButton>
            </div>
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

      {/* 本文セクション。ヘッダーのボタン行との間は詰め（mt-4）、セクション間は space-y-6。 */}
      <div className="mt-4 space-y-6">
        {overview.length > 0 && (
          <section className={`${CARD} bg-[var(--color-surface)] p-5`}>
            <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
              <IconSprout
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-[var(--color-primary)]"
              />
              道のあらまし
            </h2>
            <StepFlow steps={overview} />
          </section>
        )}

        <section aria-labelledby="attempts-heading" className="space-y-3">
          <h2 id="attempts-heading" className="flex items-center gap-2 text-base font-bold">
            <IconNotebookPen
              aria-hidden="true"
              className="h-5 w-5 shrink-0 text-[var(--color-primary)]"
            />
            試したこと（{road.attempts.length}）
          </h2>

          <Callout tone="info" title="「経験として公開」するときの確認について">
            <p>
              公開ボタンを押すと、内容を AI が確認します。次のような内容が含まれていると、
              運営が確認するまで <strong>「確認中」</strong> になり、その間は公開されません。
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              <li>名前・住所・電話番号・勤務先など、個人が分かる情報</li>
              <li>「必ず治る」「絶対に効く」などの医療的な断定</li>
              <li>特定の人・団体への攻撃や誹謗中傷</li>
              <li>宣伝・勧誘、他サービスへの誘導</li>
              <li>差別的・暴力的な表現</li>
            </ul>
            <p className="mt-2">
              問題がなければそのまま公開されます。確認が済むと公開され、見送られた場合は
              内容を直して出し直せます。
            </p>
          </Callout>

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
              <span aria-hidden="true" className="road-guide absolute bottom-4 left-1 top-4" />
              {road.attempts.map((a, i) => (
                <li key={a.id} className="relative">
                  <span
                    aria-hidden="true"
                    className="road-dot absolute -left-5 top-4 ring-2 ring-[var(--color-canvas)]"
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
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <AttemptPublishToggle
                        attemptId={a.id}
                        initial={a.isPublished}
                        initialState={a.publishState}
                      />
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

          {/* 「記録」は追加操作なので、試したことの一覧の後ろに置く。横幅いっぱいで押しやすく。 */}
          <div className="pt-1">
            <LinkButton href={`/me/roads/${road.id}/attempts/new`} className="w-full">
              <IconPlus aria-hidden="true" className="h-4 w-4 shrink-0" />
              試したことを記録
            </LinkButton>
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] pt-6">
          <DeleteRoadButton roadId={road.id} />
        </section>
      </div>
    </div>
  );
}
