import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUserId } from "@/lib/session";
import { getMyRoads } from "@/lib/queries";
import { Callout, EmptyState, LinkButton, ResultBadge } from "@/components/ui";
import { IconEye, IconFootprints, IconSprout } from "@/components/icons";
import { LikeNotice } from "@/components/like-notice";
import { prisma } from "@/lib/db";
import { LIKE_NOTIFICATION_TYPE } from "@/lib/likes";

export const metadata: Metadata = { title: "自分の道" };

export default async function MyRoadsPage() {
  const userId = await requirePageUserId();
  const roads = await getMyRoads(userId);

  // 「あなたの経験にいいねが届いた」未読通知の有無を見る (件数は前面に出さない)。
  // トップページではなく、自分の道を表示したときに出す。
  const hasLikeNotice =
    (await prisma.notification.count({
      where: { userId, type: LIKE_NOTIFICATION_TYPE, isRead: false },
    })) > 0;

  // まだ「試したこと」を 1 件も記録していない道。これらは公開する経験がない。
  const roadsWithoutAttempts = roads.filter((r) => r.attempts.length === 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {hasLikeNotice && <LikeNotice />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-[var(--color-primary-hover)]">自分の道</h1>
        <LinkButton href="/me/roads/new">道を作る</LinkButton>
      </div>

      {roadsWithoutAttempts.length > 0 && (
        <Callout tone="info" title="試したことを記録すると、経験として公開されます">
          <p>
            道は「試したこと」を記録して公開すると、同じことで困っている人の検索に出ます。
            まだ試したことのない道（{roadsWithoutAttempts.length} 件）は、公開されません。
          </p>
          <p className="mt-2">
            <Link
              href={`/me/roads/${roadsWithoutAttempts[0].id}/attempts/new`}
              className="font-semibold underline"
            >
              「{roadsWithoutAttempts[0].difficulty ?? "道"}」に試したことを記録する →
            </Link>
          </p>
        </Callout>
      )}

      {roads.length === 0 ? (
        <EmptyState icon={IconSprout} title="まだ道がありません">
          <p>
            「できなくなったこと」を一つ書くところから始めましょう。
            <br />
            <Link href="/me/roads/new">最初の道を作る</Link>
          </p>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {roads.map((road) => {
            const published = road.attempts.filter((a) => a.publishState === "published").length;
            const reviewing = road.attempts.filter((a) => a.publishState === "reviewing").length;
            // 検索で最初に開かれる経験（＝道の入口。時系列で最初の「公開中」の試したこと）。
            // これがあるとき＝この道は検索に出せる状態なので、公開表示ボタンを押せる。
            const publicEntryId = road.attempts.find((a) => a.publishState === "published")?.id;
            return (
              <li key={road.id} className="h-full">
                {/* 枠線は検索の方法カード（MethodCard）と同じ `--color-primary`。背景は白のまま。
                    左右に並ぶとき高さを長い方にそろえるため h-full（グリッド行の高さいっぱい）。
                    カード全体をタップで道の詳細へ（リンクに p-5 を持たせて余白も反応させる）。 */}
                <article className="relative h-full rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                  {/* 右上: 検索でこの道がどう見えるか（公開経験の詳細）を確認する。
                      公開中の経験が 1 つ以上あるときだけ押せる。 */}
                  {publicEntryId ? (
                    <Link
                      href={`/experiences/${publicEntryId}`}
                      className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary-hover)] no-underline hover:bg-[var(--color-primary-tint)]"
                    >
                      <IconEye aria-hidden="true" className="h-3.5 w-3.5" />
                      公開表示
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      title="公開中の経験がありません。試したことを「経験として公開」すると押せます。"
                      className="absolute right-3 top-3 z-10 inline-flex cursor-not-allowed items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-ink-muted)] opacity-60"
                    >
                      <IconEye aria-hidden="true" className="h-3.5 w-3.5" />
                      公開表示
                    </span>
                  )}
                  <Link
                    href={`/me/roads/${road.id}`}
                    className="flex h-full flex-col p-5 no-underline"
                  >
                    <p className="flex items-start gap-1.5 pr-24 font-bold text-[var(--color-ink)]">
                      <IconFootprints
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]"
                      />
                      <span className="underline underline-offset-2">
                        {road.difficulty ?? "（無題の道）"}
                      </span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--color-primary-hover)]">
                      <span>試したこと {road.attempts.length} 件</span>
                      <span aria-hidden="true">・</span>
                      <span>
                        公開中 {published} 件
                        {reviewing > 0 && `（確認中 ${reviewing} 件）`}
                      </span>
                    </div>

                    {/* 検索の道カード（RoadCard）と同じ見せ方: 縦線＋方法テキスト＋結果。時系列で先頭 3 件。 */}
                    {road.attempts.length > 0 && (
                      <>
                        <ol className="relative mt-3 space-y-2.5 pl-4">
                          <span
                            aria-hidden="true"
                            className="road-guide absolute bottom-2 left-1 top-2"
                          />
                          {road.attempts.slice(0, 3).map((a) => (
                            <li key={a.id} className="relative">
                              <span
                                aria-hidden="true"
                                className="road-dot absolute -left-4 top-1.5 ring-2 ring-[var(--color-surface)]"
                              />
                              <div className="flex items-start gap-2">
                                <span className="line-clamp-3 min-w-0 flex-1 text-sm text-[var(--color-ink)]">
                                  {a.method}
                                </span>
                                {/* 方法の右に、その試したことの公開状態を出す */}
                                <span
                                  className={`shrink-0 text-[11px] font-bold ${
                                    a.publishState === "published"
                                      ? "text-[var(--color-accent-strong)]"
                                      : "text-[var(--color-ink-muted)]"
                                  }`}
                                >
                                  {a.publishState === "published"
                                    ? "公開中"
                                    : a.publishState === "reviewing"
                                      ? "確認中"
                                      : a.publishState === "rejected"
                                        ? "見送り"
                                        : "非公開"}
                                </span>
                              </div>
                              <div className="mt-0.5">
                                <ResultBadge result={a.result} size="sm" />
                              </div>
                            </li>
                          ))}
                        </ol>
                        {road.attempts.length > 3 && (
                          <p className="mt-2 pl-4 text-xs text-[var(--color-ink-muted)]">
                            ほかに {road.attempts.length - 3} 件の方法
                          </p>
                        )}
                      </>
                    )}
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
