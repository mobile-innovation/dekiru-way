import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUserId } from "@/lib/session";
import { getMyRoads } from "@/lib/queries";
import { EmptyState, LinkButton, ResultBadge } from "@/components/ui";
import { IconFootprints } from "@/components/icons";

export const metadata: Metadata = { title: "自分の道" };

export default async function MyRoadsPage() {
  const userId = await requirePageUserId();
  const roads = await getMyRoads(userId);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">自分の道</h1>
        <LinkButton href="/me/roads/new">道を作る</LinkButton>
      </div>

      {roads.length === 0 ? (
        <EmptyState icon="🌱" title="まだ道がありません">
          <p>
            「できなくなったこと」を一つ書くところから始めましょう。
            <br />
            <Link href="/me/roads/new">最初の道を作る</Link>
          </p>
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {roads.map((road) => {
            const published = road.attempts.filter((a) => a.isPublished).length;
            return (
              <li key={road.id}>
                {/* 枠線は検索の方法カード（MethodCard）と同じ `--color-primary`。背景は白のまま。 */}
                <article className="rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-lift)]">
                  <Link href={`/me/roads/${road.id}`} className="no-underline">
                    <p className="flex items-start gap-1.5 font-bold text-[var(--color-ink)]">
                      <IconFootprints
                        aria-hidden="true"
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]"
                      />
                      {road.title ?? road.difficulty ?? "（無題の道）"}
                    </p>
                  </Link>
                  {road.difficulty && road.title && (
                    <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">{road.difficulty}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--color-ink-muted)]">
                    <span>試したこと {road.attempts.length} 件</span>
                    <span aria-hidden="true">・</span>
                    <span>公開中 {published} 件</span>
                    <span aria-hidden="true">・</span>
                    <span>{road.visibility === "public" ? "道は公開" : "道は非公開"}</span>
                  </div>
                  {road.attempts.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {road.attempts.slice(-4).map((a) => (
                        <li key={a.id}>
                          <ResultBadge result={a.result} size="sm" />
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
