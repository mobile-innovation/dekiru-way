import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { Card, LinkButton } from "@/components/ui";
import { RateLimitedNotice } from "@/components/rate-limited-notice";
import { SEARCH_EXAMPLES } from "@/lib/constants";
import { getPathClusters } from "@/lib/queries";
import { guardPublicPage } from "@/lib/page-guard";

/**
 * 「できる道とは」で見せる 4 種類の経験。
 * 色 (絵文字) だけに頼らず、必ず状態名の文字を添える (指示書 9 / 本指示書 §4)。
 */
const EXPERIENCE_KINDS = [
  { icon: "🌱", label: "少しできた" },
  { icon: "⚪", label: "変化がなかった" },
  { icon: "🟠", label: "うまくいかなかった" },
  { icon: "🔵", label: "まだ試している" },
];

export default async function TopPage() {
  const guard = await guardPublicPage("/");
  if (!guard.ok) return <RateLimitedNotice retryAfter={guard.retryAfter} />;

  const clusters = await getPathClusters({ limit: 3 });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10">
      <section aria-labelledby="hero-heading" className="card p-6 sm:p-8">
        <h1 id="hero-heading" className="sr-only">
          できる道 — 何ができなくて困っていますか？
        </h1>
        <SearchBox autoFocus size="hero" />

        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
            こんなことばで探せます
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {SEARCH_EXAMPLES.map((ex) => (
              <li key={ex}>
                <Link
                  href={`/experiences?q=${encodeURIComponent(ex)}`}
                  className="inline-block rounded-[var(--radius-pill)] bg-[var(--color-surface-sunken)] px-3 py-1.5 text-sm no-underline hover:bg-[var(--color-primary-soft)]"
                >
                  {ex}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="about-heading" className="space-y-5">
        {/* 文章は読みやすい幅に収める。4 項目カードと CTA は広い幅を使う (本指示書 §9) */}
        <div className="max-w-2xl space-y-4">
          <h2 id="about-heading" className="text-lg font-bold">
            できる道とは
          </h2>

          {/* 最初に強く見せるメッセージ (本文より視認性を高く、ただし浮くほど大きくしない) */}
          <p className="text-lg font-bold sm:text-xl">「できない」を終点にしない。</p>

          {/* サービス説明: 短く改行して読ませる */}
          <p className="leading-relaxed">
            できなくなったことを一つ入力すると、
            <br />
            同じことで困った人が、
            <br />
            <strong className="rounded bg-[var(--color-primary-soft)] px-1 font-bold">
              何を試して、どうなったか
            </strong>
            を見ることができます。
          </p>

          {/* 「できる道」の特徴。本文に埋め込まず独立させる */}
          <p className="border-l-4 border-[var(--color-accent)] pl-3 text-base font-bold">
            うまくいった話だけが「道」ではありません。
          </p>
        </div>

        {/* 4 種類の経験。PC は横 4 並び、狭い画面は 2 列に折り返す */}
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {EXPERIENCE_KINDS.map((k) => (
            <li
              key={k.label}
              className="card flex items-center gap-2 p-3 text-sm font-semibold"
            >
              <span aria-hidden="true" className="text-lg">
                {k.icon}
              </span>
              <span>{k.label}</span>
            </li>
          ))}
        </ul>

        <p className="font-semibold">どれも、次の誰かの遠回りを減らす経験です。</p>

        {/* 2 つの CTA。片方を極端に目立たせない */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/experiences" variant="primary" className="flex-1 sm:flex-none">
            経験を探す →
          </LinkButton>
          <LinkButton href="/me/roads/new" variant="secondary" className="flex-1 sm:flex-none">
            自分の道を作る →
          </LinkButton>
        </div>
      </section>

      {clusters.length > 0 && (
        <section aria-labelledby="paths-heading" className="space-y-3">
          <h2 id="paths-heading" className="text-lg font-bold">
            いろいろな方法が試されています
          </h2>
          <div className="grid gap-3 lg:grid-cols-3">
            {clusters.map((c) => (
              <Card key={c.key} as="article">
                <p className="font-semibold">{c.difficulty ?? c.goal ?? "ある困りごと"}</p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--color-ink-muted)]">
                  {c.steps.slice(0, 4).map((s) => (
                    <li key={s.experienceId}>
                      ・{s.method} → {labelOf(s.result)}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/experiences/${c.steps[0].experienceId}`}
                  className="mt-2 inline-block text-sm font-semibold"
                >
                  この道を見る →
                </Link>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function labelOf(result: string) {
  const map: Record<string, string> = {
    success: "できるようになった",
    partial: "少しできた",
    no_change: "変化はなかった",
    failed: "うまくいかなかった",
    ongoing: "まだ試している",
  };
  return map[result] ?? result;
}
