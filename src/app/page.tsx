import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { Card, LinkButton } from "@/components/ui";
import { RateLimitedNotice } from "@/components/rate-limited-notice";
import {
  IconArrowRight,
  IconCompass,
  IconEye,
  IconFootprints,
  IconLightbulb,
  IconPlus,
  IconRoute,
  IconSearch,
  IconSprout,
  IconTarget,
  resultIcon,
} from "@/components/icons";
import { ATTEMPT_RESULTS, resultMeta, SEARCH_EXAMPLES } from "@/lib/constants";
import { getPathClusters } from "@/lib/queries";
import { guardPublicPage } from "@/lib/page-guard";

/** 「できない → 探す → 道を見る → 試す → 残す」の視覚フロー (指示書 v1 §8 / v2 §9)。 */
const FLOW = [
  { label: "できない", Icon: IconTarget },
  { label: "探す", Icon: IconSearch },
  { label: "道を見る", Icon: IconRoute },
  { label: "試す", Icon: IconFootprints },
  { label: "残す", Icon: IconPlus },
] as const;

export default async function TopPage() {
  const guard = await guardPublicPage("/");
  if (!guard.ok) return <RateLimitedNotice retryAfter={guard.retryAfter} />;

  const clusters = await getPathClusters({ limit: 3 });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10">
      {/* ── ① 短いメッセージ ＋ ② 困りごと検索カード (指示書 v2 §3 / §4 / §21) ──
          検索カードは「探す場所」＝淡いグリーン。中の入力欄は白のまま（2 段の浮き）。 */}
      <section
        aria-labelledby="hero-heading"
        className="rise-in rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-6 shadow-[var(--shadow-card)] sm:p-9"
      >
        <h1 id="hero-heading" className="sr-only">
          できる道 — 何ができなくて困っていますか？
        </h1>
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-primary-hover)]">
          <IconCompass aria-hidden="true" className="h-4 w-4" />
          できる道
        </p>
        <p className="mt-1 text-base font-bold sm:text-lg">「できない」を終点にしない。</p>

        <div className="mt-5">
          <SearchBox size="hero" />
        </div>

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            例えばこんなこと
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {SEARCH_EXAMPLES.map((ex) => (
              <li key={ex}>
                <Link
                  href={`/experiences?q=${encodeURIComponent(ex)}`}
                  className="inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm no-underline transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                >
                  {ex}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── ③ できる道とは ＋ ④ 試した結果の見かた: PC 横並びカード (指示書 v2 §11–§16) ── */}
      <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
        <Card as="section" aria-labelledby="about-heading" className="flex flex-col">
          <h2 id="about-heading" className="flex items-center gap-2 text-lg font-bold">
            <IconLightbulb aria-hidden="true" className="h-5 w-5 text-[var(--color-primary)]" />
            できる道とは
          </h2>
          <div className="mt-2 space-y-2 leading-relaxed">
            <p className="font-bold">「できない」を終点にしない。</p>
            <p>
              できなくなったことを入力すると、同じことで困った人が
              <strong className="rounded bg-[var(--color-primary-soft)] px-1 font-bold">
                何を試して、どうなったか
              </strong>
              を見ることができます。
            </p>
          </div>

          {/* 利用の流れ（カード内で自然に折り返す） */}
          <div className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {FLOW.map((f, i) => (
              <div key={f.label} className="contents">
                <span className="inline-flex items-center gap-1.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
                    <f.Icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-semibold">{f.label}</span>
                </span>
                {i < FLOW.length - 1 && (
                  <IconArrowRight
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-[var(--color-ink-muted)]"
                  />
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card as="section" aria-labelledby="results-heading" className="flex flex-col">
          <h2 id="results-heading" className="flex items-center gap-2 text-lg font-bold">
            <IconEye aria-hidden="true" className="h-5 w-5 text-[var(--color-primary)]" />
            試した結果の見かた
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {ATTEMPT_RESULTS.map((value) => {
              const m = resultMeta(value);
              const RIcon = resultIcon(value);
              return (
                <li
                  key={value}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-semibold"
                >
                  <span aria-hidden="true" style={{ color: `var(--color-result-${m.tokenKey})` }}>
                    <RIcon className="h-4 w-4" />
                  </span>
                  {m.label}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] p-3 text-sm">
            <span className="font-bold">「うまくいかなかった」も、道の一部です。</span>
            その方法で変化がなかったという記録が、次の人の遠回りを減らします。
          </p>
        </Card>
      </div>

      {/* ── ⑤ いろいろな方法が試されています (実データ。指示書 v2 §18 / §19) ── */}
      {clusters.length > 0 && (
        <section aria-labelledby="paths-heading" className="space-y-3">
          <h2 id="paths-heading" className="text-lg font-bold">
            いろいろな方法が試されています
          </h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            実際に記録された道の、ほんの一部です。
          </p>
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {clusters.map((c, ci) => (
              <li key={c.key}>
                <Link
                  href={`/experiences/${c.steps[0].experienceId}`}
                  style={{ animationDelay: `${ci * 70}ms` }}
                  className="rise-in group flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--color-primary)] bg-[var(--color-primary-soft)] p-5 no-underline transition-shadow hover:shadow-[var(--shadow-lift)]"
                >
                  <p className="flex items-start gap-1.5 font-bold text-[var(--color-ink)]">
                    <IconFootprints
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]"
                    />
                    {c.difficulty ?? c.goal ?? "ある困りごと"}
                  </p>

                  <ol className="relative mt-3 flex-1 space-y-3 pl-4">
                    <span
                      aria-hidden="true"
                      className="absolute bottom-2 left-[5px] top-2 w-[2px] bg-[var(--color-primary)] opacity-25"
                    />
                    {c.steps.slice(0, 3).map((s) => {
                      const m = resultMeta(s.result);
                      const RIcon = resultIcon(s.result);
                      return (
                        <li key={s.experienceId} className="relative">
                          <span
                            aria-hidden="true"
                            className="absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-primary)] ring-2 ring-[var(--color-primary-soft)]"
                          />
                          <p className="line-clamp-1 text-sm text-[var(--color-ink)]">{s.method}</p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-ink)]">
                            <span
                              aria-hidden="true"
                              style={{ color: `var(--color-result-${m.tokenKey})` }}
                            >
                              <RIcon className="h-3.5 w-3.5" />
                            </span>
                            {m.label}
                          </p>
                        </li>
                      );
                    })}
                  </ol>

                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-primary-hover)] group-hover:underline">
                    この道を見る
                    <IconArrowRight
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── ⑥ 自分の道を残す CTA (最後に背中を押す程度。指示書 v2 §20) ── */}
      <section
        aria-labelledby="cta-heading"
        className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-soft)] p-5 sm:p-6"
      >
        <h2 id="cta-heading" className="flex items-start gap-2 font-bold text-[var(--color-ink)]">
          <IconSprout
            aria-hidden="true"
            className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-primary)]"
          />
          あなたの試したことも、誰かの次の一歩になります
        </h2>
        <p className="mt-2 max-w-prose text-sm text-[var(--color-ink-muted)]">
          うまくいったことも、いかなかったことも。記録すれば、同じことで困っている人の道になります。
        </p>
        <LinkButton href="/me/roads/new" variant="primary" className="mt-4">
          <IconPlus aria-hidden="true" className="h-4 w-4" />
          自分の道を作る
        </LinkButton>
      </section>
    </div>
  );
}
