import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { IconRoute } from "@/components/icons";
import { BranchingPaths } from "@/components/branching-paths";
import { RateLimitedNotice } from "@/components/rate-limited-notice";
import { getPathClusters } from "@/lib/queries";
import { guardPublicPage } from "@/lib/page-guard";

export const metadata: Metadata = { title: "道の見える化" };

export default async function PathsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const guard = await guardPublicPage("/experiences/paths", sp);
  if (!guard.ok) return <RateLimitedNotice retryAfter={guard.retryAfter} />;

  const q = typeof sp.q === "string" ? sp.q : undefined;
  const tag = typeof sp.tag === "string" ? sp.tag : undefined;
  const clusters = await getPathClusters({ q, tag, limit: 20 });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="mx-auto max-w-3xl space-y-1">
        <h1 className="text-xl font-bold">道の見える化</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          同じ困りごとから、いろいろな方法へ道が枝分かれしています。
          どれかが「正解」ではありません。うまくいかなかった道も残しています。
        </p>
      </header>

      {clusters.length === 0 ? (
        <EmptyState icon={IconRoute} title="表示できる道がまだありません">
          <p>
            <Link href="/experiences">経験を探す</Link> か、
            <Link href="/me/roads/new"> 自分の道を作る </Link>
            ところから始められます。
          </p>
        </EmptyState>
      ) : (
        <ul className="space-y-5">
          {clusters.map((c) => (
            <li key={c.key}>
              <Card as="article" className="space-y-3">
                <div>
                  <p className="font-bold">{c.difficulty ?? c.goal ?? "ある困りごと"}</p>
                  {c.goal && c.difficulty && (
                    <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">目標：{c.goal}</p>
                  )}
                </div>
                <BranchingPaths
                  dense
                  trunk={{
                    previouslyAble: c.previouslyAble,
                    difficulty: c.difficulty,
                    goal: c.goal,
                  }}
                  branches={c.steps.map((s) => ({
                    id: s.experienceId,
                    method: s.method,
                    result: s.result,
                  }))}
                />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
