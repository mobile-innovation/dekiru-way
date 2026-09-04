import Image from "next/image";
import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { Card, LinkButton } from "@/components/ui";
import { RateLimitedNotice } from "@/components/rate-limited-notice";
import {
  IconArrowRight,
  IconEye,
  IconFootprints,
  IconPlus,
  IconSprout,
  resultIcon,
} from "@/components/icons";
import { ATTEMPT_RESULTS, resultMeta, SEARCH_EXAMPLES } from "@/lib/constants";
import { getPathClusters } from "@/lib/queries";
import { guardPublicPage } from "@/lib/page-guard";

export default async function TopPage() {
  const guard = await guardPublicPage("/");
  if (!guard.ok) return <RateLimitedNotice retryAfter={guard.retryAfter} />;

  const clusters = await getPathClusters({ limit: 3 });

  return (
    <div className="mx-auto w-full max-w-5xl space-y-10">
      {/* ── ① ファーストビュー = 「できる道」の世界観 (指示書 v2 §5 / §23)。
          画像内に「できる道」「「できない」を終点にしない。」等が描かれているため HTML で重複させない。
          操作対象は下の本物の検索フォーム。 */}
      <Image
        src="/1.png"
        alt="できる道 — 「できない」を終点にしない。誰かの試行錯誤を、誰かの次の一歩へつなぐ場所。丘の上の旗に向かって続く道のイラスト。"
        width={1774}
        height={887}
        priority
        sizes="(min-width: 64rem) 64rem, 100vw"
        className="h-auto w-full rounded-[var(--radius-lg)] border border-[var(--color-border)]"
      />

      {/* ── ② 困りごと検索カード (指示書 v2 §6 / §7)。検索が主役。
          「探す場所」＝淡いグリーン、中の入力欄は白のまま。 */}
      <section
        aria-labelledby="hero-heading"
        className="rise-in rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-6 shadow-[var(--shadow-card)] sm:p-9"
      >
        <h1 id="hero-heading" className="sr-only">
          できる道 — 何ができなくて困っていますか？
        </h1>

        <SearchBox size="hero" />

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

      {/* ── ③ できる道で、できること (指示書 v3)。3/4/5.png はサービスの「価値」を伝える中間セクション。
          画像内のボタン・カード・検索欄はイラスト表現であって操作対象ではない。画像の焼き込み文と
          重複しないよう HTML は短い見出し＋1 文だけ。実データの実例カードは別（§13）。 */}
      <section aria-labelledby="value-heading" className="space-y-3">
        <h2 id="value-heading" className="text-lg font-bold">
          できる道で、できること
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              src: "/3.png",
              pos: "50% 60%",
              title: "いろいろな経験を見つける",
              body: "同じことで困った人の工夫や結果を見られます。",
              alt: "スマホで、他の人の「困ったこと・試したこと・結果」の記録を探しているイラスト。",
            },
            {
              src: "/4.png",
              pos: "55% 45%",
              title: "あなたの経験を残す",
              body: "試したことや結果を記録すると、自分の道になります。",
              alt: "ノートに、困ったこと・試したこと・結果・今の状態を書き留めているイラスト。",
            },
            {
              src: "/5.png",
              pos: "50% 45%",
              title: "誰かの次の一歩へ",
              body: "あなたの記録が、同じことで困っている人の助けになります。",
              alt: "一人の経験の記録が、同じように困っている別の人へ渡っていくイラスト。",
            },
          ].map((c) => (
            <li key={c.src}>
              <div className="card flex h-full flex-col overflow-hidden p-0">
                <Image
                  src={c.src}
                  alt={c.alt}
                  width={1536}
                  height={1024}
                  sizes="(min-width: 64rem) 20rem, (min-width: 40rem) 45vw, 100vw"
                  style={{ objectPosition: c.pos }}
                  className="aspect-[16/9] w-full object-cover"
                />
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-bold text-[var(--color-ink)]">{c.title}</h3>
                  <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{c.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── ④ できる道とは (指示書 v2 §8 / §9 / §14)。6.png に見出し・説明・利用フロー・
          「うまくいかなかった方法も大切」まで描かれているので、HTML は landmark 用の見出しだけ持ち
          （sr-only）、本文・フロー図は重複させない。結果 5 分類は §15 のとおり別カードで HTML 表示。 */}
      <section aria-labelledby="about-heading">
        <h2 id="about-heading" className="sr-only">
          できる道とは
        </h2>
        <Image
          src="/6.png"
          alt="できる道とは — 「できない」を終点にしない。困ったことを入力して似た経験を探し（探す）、方法や結果を見て道を選び（道を見る）、自分で試し（試す）、試したことと結果を記録して次の人につなげる（残す）という流れ。うまくいった方法も、うまくいかなかった方法も、すべてが大切な経験です。"
          width={1536}
          height={1024}
          sizes="(min-width: 64rem) 64rem, 100vw"
          className="h-auto w-full rounded-[var(--radius-lg)] border border-[var(--color-border)]"
        />
      </section>

      {/* ── ⑤ 試した結果の見かた (指示書 v2 §15。データ上の意味を持つので画像化せず HTML) ── */}
      <Card as="section" aria-labelledby="results-heading">
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

      {/* ── ⑥ いろいろな方法が試されています (実データ。指示書 v2 §18 / §19) ── */}
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
                      className="road-guide absolute bottom-2 left-1 top-2"
                    />
                    {c.steps.slice(0, 3).map((s) => {
                      const m = resultMeta(s.result);
                      const RIcon = resultIcon(s.result);
                      return (
                        <li key={s.experienceId} className="relative">
                          <span
                            aria-hidden="true"
                            className="road-dot absolute -left-4 top-1.5 ring-2 ring-[var(--color-primary-soft)]"
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

      {/* ── ⑦ 自分の道を残す CTA (指示書 v2 §20 / v4)。7.png は右側の装飾ビジュアルのみ。
          7.png に描かれた見出し・ボタンはイラストで、操作対象は下の本物の HTML ボタン。
          画像は右端の風景部分だけ見せ（object-right）、左端は card 色へフェードして継ぎ目を消す。 */}
      <section
        aria-labelledby="cta-heading"
        className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-soft)]"
      >
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          <div className="flex-1 p-5 sm:p-6">
            <h2
              id="cta-heading"
              className="flex items-start gap-2 font-bold text-[var(--color-ink)]"
            >
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
          </div>
          <div className="relative h-24 w-full shrink-0 sm:h-auto sm:w-[38%] sm:max-w-[22rem]">
            <Image
              src="/7-scene.png"
              alt=""
              fill
              sizes="(min-width: 40rem) 22rem, 100vw"
              className="object-cover object-[center_40%] [mask-image:linear-gradient(to_right,transparent,#000_2.5rem)]"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
