import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Callout, Card } from "@/components/ui";
import {
  IconHistory,
  IconImage,
  IconInfo,
  IconRoute,
  IconSprout,
  IconTarget,
} from "@/components/icons";
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
    <div className="mx-auto w-full max-w-5xl space-y-8">
      {/* ① 戻る / ② タイトル */}
      <div className="space-y-4">
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

      {/* PC: 左＝道の本体 / 右＝参考情報＋CTA。スマホ: 道 → 参考情報 → CTA の 1 カラム。 */}
      <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-6 lg:space-y-0">
        <div className="space-y-8">
          {/* ③ この人がたどった道（枝分かれ） */}
          <Card as="section">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <IconRoute aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
              この人がたどった道
            </h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          この人が試してきた方法を、時系列で見られます。うまくいかなかった方法も、道の一部です。
        </p>

        {/* できていたこと / やりたいこと（PC は横並び、スマホは縦。「できていた → やりたい → 道」の起点） */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] px-3 py-2">
            <span className="flex items-center gap-1 text-[11px] font-bold tracking-wide text-[var(--color-ink-muted)]">
              <IconHistory aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span>できていたこと</span>
            </span>
            <span className="mt-0.5 block whitespace-pre-wrap">
              {r.previouslyAble ?? (
                <span className="text-[var(--color-ink-muted)]">まだ登録されていません</span>
              )}
            </span>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] px-3 py-2 font-bold">
            <span className="flex items-center gap-1 text-[11px] font-bold tracking-wide text-[var(--color-ink-muted)]">
              <IconTarget aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span>やりたいこと</span>
            </span>
            <span className="mt-0.5 block whitespace-pre-wrap">
              {r.goal ?? r.difficulty ?? "この困りごと"}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <BranchingPaths
            heading={null}
            note={null}
            trunkLayout="none"
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
        </div>
      </Card>

          {exp.photos.length > 0 && (
            <section aria-labelledby="photos-heading" className="space-y-2">
              <h2
                id="photos-heading"
                className="flex items-center gap-2 text-base font-bold"
              >
                <IconImage
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-[var(--color-primary)]"
                />
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
        </div>

        {/* PC は右サイド、スマホは道の下: 参考情報 → 自分の道を作る */}
        <aside className="space-y-4">
          <Callout tone="warn">
            <span className="mb-1 flex items-center gap-1.5 font-bold">
              <IconInfo aria-hidden="true" className="h-4 w-4 shrink-0" />
              この情報について
            </span>
            {DISCLAIMER}
            {" "}
            枝分かれの中で「できるようになった」が正解というわけではありません。
            うまくいかなかった方法も、次の人にとって大切な情報です。
          </Callout>

          <Card as="section">
            <p className="flex items-start gap-1.5 font-semibold">
              <IconSprout
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]"
              />
              あなたの試した方法も、誰かの次の一歩になります。
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              自分の困りごとや、試したことを記録してみませんか？うまくいかなくても、それも経験です。
            </p>
            <Link
              href="/me/roads/new"
              className="mt-3 block rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-5 py-2.5 text-center text-sm font-semibold text-[var(--color-primary-ink)] no-underline"
            >
              自分の道を作る
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
