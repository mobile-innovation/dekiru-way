import type { Metadata } from "next";
import Link from "next/link";
import { RoadCard } from "@/components/road-card";
import { MethodCard } from "@/components/method-card";
import { ExperienceSearchForm } from "@/components/experience-search-form";
import { EmptyState } from "@/components/ui";
import { RateLimitedNotice } from "@/components/rate-limited-notice";
import { experienceQuerySchema } from "@/lib/validation";
import { searchRoads, searchMethods, getPopularTags } from "@/lib/queries";
import { guardPublicPage } from "@/lib/page-guard";

export const metadata: Metadata = { title: "経験を探す" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ExperiencesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const guard = await guardPublicPage("/experiences", sp);
  if (!guard.ok) return <RateLimitedNotice retryAfter={guard.retryAfter} />;

  const parsed = experienceQuerySchema.safeParse(flatten(sp));
  const q = parsed.success
    ? parsed.data
    : {
        q: undefined,
        result: undefined,
        tag: undefined,
        page: 1,
        mp: 1,
        kind: "road" as const,
        limit: 20,
        sort: "recent" as const,
      };

  // kind（道 / 方法 / 両方）は検索語ありのときだけ効く。検索語なしはこれまで通り道の一覧。
  const roadEnabled = !q.q || q.kind !== "method";
  const methodEnabled = Boolean(q.q) && q.kind !== "road";
  const emptyRes = { items: [] as never[], total: 0, page: 1, hasMore: false, windowExceeded: false };

  const [roadRes, methodMatch, tags] = await Promise.all([
    roadEnabled ? searchRoads(q) : Promise.resolve(emptyRes),
    methodEnabled ? searchMethods(q) : Promise.resolve(emptyRes),
    getPopularTags(12),
  ]);
  const { items, total, page, hasMore, windowExceeded } = roadRes;

  const hasRoadSection = roadEnabled;
  // 方法（試したこと本文・気づき）の中に検索語が当たった記録カード。道カードと独立にページ制御（?mp=）。
  const hasMethodSection =
    methodEnabled && (methodMatch.items.length > 0 || methodMatch.windowExceeded);
  const nothingFound =
    items.length === 0 &&
    !windowExceeded &&
    methodMatch.items.length === 0 &&
    !methodMatch.windowExceeded;

  const resultsHeading = q.q ? `「${q.q}」への、いろいろな道` : "いろいろな道";
  const liveMessage = windowExceeded
    ? "これ以上は道を表示できません。ことばやタグ、結果でもう少し絞り込んでください。"
    : items.length === 0
      ? q.q
        ? "「" + q.q + "」が困りごと・目標に当てはまる道はありませんでした。"
        : "この条件では、まだ道が見つかりませんでした。"
      : `困りごと・目標に当てはまる道 ${total} 件`;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">経験を探す</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          できなくなったことや困ったことから、いろいろな人の「道」を探せます。
        </p>
      </div>

      <ExperienceSearchForm
        defaultQ={q.q ?? ""}
        defaultResult={q.result ?? ""}
        defaultTag={q.tag ?? ""}
        defaultKind={q.kind}
        defaultSort={q.sort}
        tags={tags}
      />

      {nothingFound && (
        <EmptyState title="まだ見つかりませんでした">
          <p>
            ことばを変えて試してみてください。あなたの試行錯誤を
            <Link href="/me/roads/new"> 記録する </Link>
            と、次に同じことで困った人の道になります。
          </p>
        </EmptyState>
      )}

      {hasRoadSection && !nothingFound && (
        <section aria-labelledby="results-heading" className="space-y-4">
          <div className="space-y-1">
            <h2 id="results-heading" className="text-lg font-bold">
              {resultsHeading}
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              同じことに困った人が、それぞれ違う方法を試しています。
              うまくいかなかった道も、まだ試している道も含まれます。
            </p>
            <p aria-live="polite" className="text-xs text-[var(--color-ink-muted)]">
              {liveMessage}
            </p>
          </div>

          {windowExceeded ? (
            <EmptyState icon="🔎" title="もう少し絞り込んでください">
              <p>
                道は一度にすべては表示していません。困っている場面や結果で絞ると見つけやすくなります。
              </p>
            </EmptyState>
          ) : items.length > 0 ? (
            <ul className="grid gap-4 lg:grid-cols-2">
              {items.map((road) => (
                <li key={road.entryId}>
                  <RoadCard road={road} />
                </li>
              ))}
            </ul>
          ) : q.q && hasMethodSection ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              下の「方法の中にあった記録」を見てください。
            </p>
          ) : null}

          {items.length > 0 && (
            <Pagination
              param="page"
              page={page}
              hasMore={hasMore}
              sp={sp}
              label="困りごと・目標の道"
            />
          )}
        </section>
      )}

      {hasMethodSection && (
        <section aria-labelledby="method-results-heading" className="space-y-4">
          <div className="space-y-1">
            <h2 id="method-results-heading" className="text-lg font-bold">
              「{q.q}」が方法の中にあった記録
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              試したことや気づきの文章の中にことばが見つかった記録です。
              カードを開くと、その方法をたどった道が見られます。
            </p>
            <p aria-live="polite" className="text-xs text-[var(--color-ink-muted)]">
              {methodMatch.windowExceeded
                ? "これ以上は記録を表示できません。ことばやタグ、結果でもう少し絞り込んでください。"
                : `${methodMatch.total} 件`}
            </p>
          </div>

          {methodMatch.windowExceeded ? (
            <EmptyState icon="🔎" title="もう少し絞り込んでください">
              <p>記録は一度にすべては表示していません。結果やタグで絞ると見つけやすくなります。</p>
            </EmptyState>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {methodMatch.items.map((m) => (
                <li key={m.attemptId}>
                  <MethodCard method={m} />
                </li>
              ))}
            </ul>
          )}

          {methodMatch.items.length > 0 && (
            <Pagination
              param="mp"
              page={methodMatch.page}
              hasMore={methodMatch.hasMore}
              sp={sp}
              label="方法の記録"
            />
          )}
        </section>
      )}
    </div>
  );
}

function flatten(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v[0]) out[k] = v[0];
  }
  return out;
}

function Pagination({
  param,
  page,
  hasMore,
  sp,
  label,
}: {
  /** URL クエリ名。道カード= "page"、方法カード= "mp"（互いに独立してページ送りする） */
  param: "page" | "mp";
  page: number;
  hasMore: boolean;
  sp: SearchParams;
  /** どちらのページ送りか（スクリーンリーダー向け） */
  label: string;
}) {
  if (page <= 1 && !hasMore) return null;
  const make = (p: number) => {
    const params = new URLSearchParams(flatten(sp));
    if (p <= 1) params.delete(param);
    else params.set(param, String(p));
    const qs = params.toString();
    return qs ? `/experiences?${qs}` : "/experiences";
  };
  return (
    <nav className="flex items-center justify-between" aria-label={`${label}のページ送り`}>
      {page > 1 ? (
        <Link href={make(page - 1)} className="font-semibold" rel="prev">
          ← 前のページ
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-[var(--color-ink-muted)]">{page} ページ目</span>
      {hasMore ? (
        <Link href={make(page + 1)} className="font-semibold" rel="next">
          次のページ →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
