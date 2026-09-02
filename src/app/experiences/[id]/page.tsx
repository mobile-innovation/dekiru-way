import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Callout, Card } from "@/components/ui";
import { BranchingPaths, type Branch } from "@/components/branching-paths";
import { RateLimitedNotice } from "@/components/rate-limited-notice";
import { getExperience } from "@/lib/queries";
import { guardPublicPage } from "@/lib/page-guard";
import { DISCLAIMER } from "@/lib/ai/client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const exp = await getExperience(id);
  if (!exp) return { title: "経験が見つかりません" };
  return {
    title: exp.road.difficulty ?? exp.road.goal ?? "経験の詳細",
    description: `試したこと: ${exp.method.slice(0, 80)}`,
  };
}

export default async function ExperienceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const { id } = await params;
  const pRaw = (await searchParams).p;
  const page = Math.max(1, Number(Array.isArray(pRaw) ? pRaw[0] : pRaw) || 1);

  const guard = await guardPublicPage("/experiences/[id]", { id });
  if (!guard.ok) return <RateLimitedNotice retryAfter={guard.retryAfter} />;

  const exp = await getExperience(id);
  if (!exp) notFound();

  const r = exp.road;

  // 枝 = この人が公開している試したこと（同じ Road の公開 Attempt）。
  // 各方法カードは詳細画面でそのまま全部表示する（タップして選ぶ操作は無い）。
  const branches: Branch[] = exp.siblings ?? [
    {
      id: exp.id,
      method: exp.method,
      result: exp.result,
      triedAt: exp.triedAt,
      isCurrent: true,
      note: exp.memo,
      achievementPercent: exp.achievementPercent,
      feeling: exp.feeling,
      stateAfter: exp.stateAfter,
      nextAction: exp.nextAction,
      previousAttemptId: exp.previousAttemptId,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {/* ① 戻る / ② タイトル */}
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <p className="text-sm">
          <Link href="/experiences">← 経験を探すへ戻る</Link>
        </p>
        <header className="space-y-2">
          <h1 className="text-xl font-bold">{r.difficulty ?? r.goal ?? "経験の詳細"}</h1>
          {r.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {r.tags.map((t) => (
                <li key={t}>
                  <Link
                    href={`/experiences?tag=${encodeURIComponent(t)}`}
                    className="inline-block rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-2.5 py-0.5 text-xs no-underline"
                  >
                    #{t}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </header>
      </div>

      {/* ③ この人がたどった道（枝分かれ） */}
      <Card as="section">
        <h2 className="text-base font-bold">この人がたどった道</h2>
        <p className="mb-8 mt-1 text-sm text-[var(--color-ink-muted)]">
          この人が、できなくなったあと、いろいろな方法を試しながら、いまの状態まで来た道です。
          うまくいかなかった方法も、道の一部として残しています。
        </p>
        <BranchingPaths
          heading={null}
          note={null}
          trunk={{
            previouslyAble: r.previouslyAble,
            difficulty: r.difficulty,
            goal: r.goal,
          }}
          branches={branches}
          present={{ progress: r.progress }}
          page={page}
          pageHref={(p) => (p <= 1 ? `/experiences/${id}` : `/experiences/${id}?p=${p}`)}
        />
      </Card>

      {exp.photos.length > 0 && (
        <section
          aria-labelledby="photos-heading"
          className="mx-auto w-full max-w-3xl space-y-2"
        >
          <h2 id="photos-heading" className="text-base font-bold">
            写真
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {exp.photos.map((p) => (
              <li key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.storageUrl}
                  alt={p.caption ?? "試したときの写真"}
                  className="aspect-square w-full rounded-[var(--radius-md)] object-cover"
                  loading="lazy"
                />
                {p.caption && (
                  <p className="mt-1 text-xs text-[var(--color-ink-muted)]">{p.caption}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ⑤ 注意書き / ⑥ これなら試せそう */}
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <Callout tone="warn">
          {DISCLAIMER}
          {" "}
          枝分かれの中で「できるようになった」が正解というわけではありません。何が試され、どうなったかが道です。
        </Callout>

        <Card as="section">
          <p className="font-semibold">これなら試せそう、と思ったら</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            自分の道を作って、試したことと結果を残していけます。うまくいかなくても、それも経験です。
          </p>
          <Link
            href="/me/roads/new"
            className="mt-3 inline-block rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-primary-ink)] no-underline"
          >
            自分の道を作る
          </Link>
        </Card>
      </div>
    </div>
  );
}
