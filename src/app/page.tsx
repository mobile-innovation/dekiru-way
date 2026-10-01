import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SearchBox } from "@/components/search-box";
import { StoryStrip } from "@/components/story-strip";
import { SwipeCarousel } from "@/components/swipe-carousel";
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

// トップページだけは検索エンジンへの登録を許可する (露出方針: トップ以外は noindex)。
export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default async function TopPage() {
  const guard = await guardPublicPage("/");
  if (!guard.ok) return <RateLimitedNotice retryAfter={guard.retryAfter} />;

  const clusters = await getPathClusters({ limit: 3 });

  return (
    <>
      {/* ── ① ヒーロー = head.png を全面背景にしたファーストビュー
          (指示書「ヘッド画像を背景化する更新指示」)。
          画像はカード化しない（角丸・枠線・影を付けない）。ヘッダーと同じ幅まで、
          main の左右パディング (px-4 / sm:px-6) と上パディング (pt-6) を打ち消して広げる。
          画像内の baked-in テキストとは別に、実際に読み上げ・選択できる本物の見出しを重ねる。 */}
      <section
        aria-labelledby="hero-heading"
        className="relative isolate -mx-4 -mt-6 overflow-hidden sm:-mx-6"
      >
        <Image
          src="/head.png"
          alt="リュックを背負った女性が、緑の丘に続く道を「できる道へ」の看板に向かって歩いていくイラスト。「できないが、できるに変わる。あなたのペースで。」という言葉が添えられている。"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[68%_center] sm:object-[85%_center] lg:object-right"
        />
        {/* 可読性確保のための控えめな下地。画像全体を暗くはしない (指示書 §8)。
            スマホは文字がほぼ全幅に乗るので均一の白（2026-10-01 に 55% → 72%。イラストが見出し・検索欄より
            目立たないように）、PC以上は従来どおり 55% の白＋左側だけ効くグラデーション（変更なし）。 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-white/72 sm:bg-white/55 sm:bg-gradient-to-r sm:from-white/85 sm:via-white/35 sm:to-transparent"
        />

        <div className="relative flex min-h-[30rem] flex-col justify-center px-5 py-8 sm:min-h-[34rem] sm:px-10 sm:py-10 lg:min-h-[36rem] lg:px-14">
          {/* 検索フォーム + 具体例チップを 1 つの検索エリアとしてまとめる (指示書「例えばこんなことをヘッド内へ」)。 */}
          <div className="w-full sm:max-w-md md:max-w-lg">
            <h1
              id="hero-heading"
              className="text-2xl font-bold text-[var(--color-ink)] sm:text-3xl"
            >
              できる道
            </h1>
            <p className="mt-1.5 text-base font-semibold text-[var(--color-ink)] sm:text-lg">
              「できなかった」を、誰かの経験から「次の一歩」へ。
            </p>
            <div className="mt-4 sm:mt-6">
              <SearchBox size="hero" />
            </div>

            {/* ── 検索の具体例。検索フォームの直下に置いて検索のきっかけにする ── */}
            <div className="mt-4 sm:mt-5">
              <p className="text-xs font-bold text-[var(--color-ink-muted)]">例えばこんなこと</p>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {SEARCH_EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <Link
                      href={`/experiences?q=${encodeURIComponent(ex)}`}
                      className="inline-flex items-center rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm no-underline transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-soft)]"
                    >
                      {ex}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 中央コンテンツのまとまり。8枚ストーリーを基準に、その下の
        「試した結果の見かた」「いろいろな方法が試されています」「自分の道を作る」まで
        同じ左右幅・左右位置に揃える (指示書「幅統一」)。
        本文 (max-w-5xl) より少し広く、xl 以上で max-w-6xl。個別に max-width を持たせず
        この 1 つの共通コンテナで幅を決める。 */}
      <div className="mx-auto w-full max-w-5xl space-y-10 pt-10 xl:max-w-6xl">
        {/* ── ② 8枚のストーリー。①→⑧ の順。タブレット以上は 2 列 × 4 行、
          スマホは 1 枚ずつ大きく見せる横スクロール（自動では動かない。2026-10-01）。 */}
        <StoryStrip />

        {/* ── ⑤ 試した結果の見かた。8枚ストーリー直後で存在感が弱くならないよう、
          card padding を CTA と揃えて少し広げ、結果チップも少し読みやすくする (指示書「最終微調整」§2)。
          新しいカード・説明・イラストは足さない。 */}
        <Card as="section" aria-labelledby="results-heading" className="sm:p-6">
          <h2 id="results-heading" className="flex items-center gap-2 text-lg font-bold">
            <IconEye aria-hidden="true" className="h-5 w-5 text-[var(--color-primary)]" />
            試した結果の見かた
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {ATTEMPT_RESULTS.map((value) => {
              const m = resultMeta(value);
              const RIcon = resultIcon(value);
              return (
                <li
                  key={value}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2 text-sm font-semibold"
                >
                  <span aria-hidden="true" style={{ color: `var(--color-result-${m.tokenKey})` }}>
                    <RIcon className="h-4 w-4" />
                  </span>
                  {m.label}
                </li>
              );
            })}
          </ul>
          <p className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] p-3 text-sm">
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
            {/* スマホは横スライド（1 件 85% 幅＋次がのぞく・ドット・自動送りなし。2026-10-01）、
                md 2 列 / lg 3 列は従来どおり。カードの中身・リンクは変更なし。 */}
            <SwipeCarousel
              label="記録された道の例"
              desktopListClassName="md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3"
              dotLabelSuffix="件目を表示"
              items={clusters.map((c, ci) => ({
                key: c.key,
                node: (
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
                            <p className="line-clamp-1 text-sm text-[var(--color-ink)]">
                              {s.method}
                            </p>
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
                ),
              }))}
            />
          </section>
        )}

        {/* 「できる道で、できること」3カード (旧 3/4/5.png) は削除。8枚のストーリー
          (④他の人の経験を見つけた！/ ⑤少しずつできるように！/ ⑥試してみたことを記録する 等) と
          内容が重複するため、同じ説明を繰り返さない (指示書「3カードを削除する」)。 */}

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
    </>
  );
}
