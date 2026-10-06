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
  ToastRegion,
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
    road.situation && { label: "どんなことで困っていますか？", body: road.situation },
    road.progress && { label: "いまの進捗", body: road.progress },
    road.nextAction && { label: "次に試すこと", body: road.nextAction },
  ].filter(Boolean) as { label: string; body: React.ReactNode }[];

  return (
    // 中央コンテナ幅・上部ブロックは「経験詳細」画面（/experiences/[id]）に合わせる。
    <div className="mx-auto w-full max-w-5xl">
      {/* 試したことの削除などの短い通知（数秒で消える） */}
      <ToastRegion />
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

          {/* 公開の説明は短く（最終UI改善指示 §2）。注意事項は消さずに「詳しく見る」へ畳む。
              公開は道ではなく試したこと 1 件ごと（道そのものに公開設定は無い。spec §5.1）。 */}
          <Callout tone="info" title="公開について">
            <p>
              各記録のボタンで<strong>「公開中」</strong>にすると、その経験が他の人にも見えるようになります。
              公開前に内容を確認します。
            </p>
            <details className="group mt-1">
              <summary className="inline-flex min-h-[var(--tap-min)] cursor-pointer list-none items-center gap-1.5 font-semibold text-[var(--color-primary-hover)] [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className="inline-block w-3 text-center group-open:hidden">
                  ＋
                </span>
                <span aria-hidden="true" className="hidden w-3 text-center group-open:inline-block">
                  −
                </span>
                <span className="group-open:hidden">詳しく見る</span>
                <span className="hidden group-open:inline">閉じる</span>
              </summary>
              <div className="pb-1">
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
                  問題がなければそのまま公開されます。見送られた場合は、内容を直して出し直せます。
                  公開中の記録は、もう一度押すといつでも<strong>「自分だけに表示」</strong>に戻せます。
                </p>
              </div>
            </details>
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
                    {/* 並びは 何を試したか → 結果 → その後 → 詳細（最終UI改善指示 §6）。
                        気づき・気持ち・次に試すことは経験詳細と同じ「詳しく見る」に畳む。 */}
                    <span className="text-xs font-bold text-[var(--color-ink-muted)]">
                      {i + 1} 件目
                      {a.triedAt ? `・${a.triedAt}` : ""}
                    </span>
                    <p className="mt-1 whitespace-pre-wrap font-medium">{a.method}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-bold text-[var(--color-ink-muted)]">結果</span>
                      <ResultBadge result={a.result} size="sm" />
                      {typeof a.achievementPercent === "number" && (
                        <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2 py-0.5 text-[0.6875rem] font-bold text-[var(--color-ink-muted)]">
                          できた度 {a.achievementPercent}%
                        </span>
                      )}
                    </div>
                    {a.stateAfter && (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm">
                        <span className="font-bold text-[var(--color-ink-muted)]">その後：</span>
                        {a.stateAfter}
                      </p>
                    )}
                    <AttemptDetails
                      items={[
                        a.memo && { label: "気づき", text: a.memo },
                        a.feeling && { label: "そのときの気持ち", text: a.feeling },
                        a.nextAction && { label: "次に試すこと", text: a.nextAction },
                      ]}
                    />
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <AttemptPublishToggle
                        attemptId={a.id}
                        initial={a.isPublished}
                        initialState={a.publishState}
                      />
                      <div className="flex items-center gap-4">
                        <Link
                          href={`/me/roads/${road.id}/attempts/${a.id}/edit`}
                          className="tap-target inline-flex items-center text-sm font-semibold"
                        >
                          編集
                        </Link>
                        <DeleteAttemptButton attemptId={a.id} method={a.method} />
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
            <p className="mt-2 text-center text-xs text-[var(--color-ink-muted)]">
              うまくいかなかったことも、少しできたことも、そのまま記録できます。
            </p>
          </div>
        </section>

        <section className="border-t border-[var(--color-border)] pt-6">
          <DeleteRoadButton roadId={road.id} attemptCount={road.attempts.length} />
        </section>
      </div>
    </div>
  );
}

/** 試したことの第 2 層（「詳しく見る」で開く）。値の無い項目は出さず、1 つも無ければ何も出さない。
 *  見た目は経験詳細（branching-paths の <details>）と同じ。 */
function AttemptDetails({ items }: { items: (false | null | undefined | "" | { label: string; text: string })[] }) {
  const details = items.filter(Boolean) as { label: string; text: string }[];
  if (details.length === 0) return null;
  return (
    <details className="group mt-2 border-t border-[var(--color-border)] pt-1">
      <summary className="inline-flex min-h-[var(--tap-min)] cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-[var(--color-primary-hover)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block w-3 shrink-0 text-center group-open:hidden">
          ＋
        </span>
        <span aria-hidden="true" className="hidden w-3 shrink-0 text-center group-open:inline-block">
          −
        </span>
        <span className="shrink-0 whitespace-nowrap group-open:hidden">詳しく見る</span>
        <span className="hidden shrink-0 whitespace-nowrap group-open:inline">閉じる</span>
      </summary>
      <dl className="space-y-2 pb-1 pt-1 text-sm leading-relaxed">
        {details.map((d) => (
          <div key={d.label}>
            <dt className="text-xs font-bold text-[var(--color-ink-muted)]">{d.label}：</dt>
            <dd className="whitespace-pre-wrap">{d.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
