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
      {/* ── ① ヒーロー = head.png（2026-10-07 に文字なしの横長ビジュアルへ差し替え。指示書「トップヒーロー更新指示」）。
          画像はカード化しない（角丸・枠線・影を付けない）。ヘッダーと同じ幅まで、
          main の左右パディング (px-4 / sm:px-6) と上パディング (pt-6) を打ち消して広げる。
          画像に文字は無いので、ブランドメッセージは HTML で空の上に重ねる（文言は変えない）。
          - xl 以上: 画面幅いっぱい（ヘッダーの帯と同じ全幅）の背景にし、左のキッチンの明るい余白に見出し・検索を置く。
            1152px 幅に収めると、検索エリアの高さ（約 500px）に合わせて画像が拡大され右の「道」が切れるため全幅にする。
            左の余白はデザインの一部なので左はほぼ切らない（object-[15%_center]）。
          - sm〜xl 未満: 横長画像の上に文字を重ねると女性に被るため、画像全体を 3:1 の帯で見せ、その下に見出し・検索。
          - スマホ: 画像の右側（女性・空・道）を 2:1 の帯で見せ、その下に見出し・検索。 */}
      <section
        aria-labelledby="hero-heading"
        className="relative isolate -mx-4 -mt-6 overflow-hidden bg-[var(--color-surface)] sm:-mx-6 xl:mx-[calc(50%-50vw)]"
      >
        <div className="relative aspect-[2/1] w-full sm:aspect-[3/1] xl:absolute xl:inset-0 xl:aspect-auto">
          <Image
            src="/head.png"
            alt="明るいキッチンでスマートフォンを手に空を見上げる女性と、窓の外の川沿いに続く道のイラスト。"
            fill
            priority
            sizes="100vw"
            className="object-cover object-right sm:object-center xl:object-[15%_center]"
          />
          {/* 可読性確保のための控えめな下地。画像全体は暗くも白くもしない。
              xl 以上で、見出し・検索が乗る左のキッチン部分にだけ白のグラデーションを効かせる。 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden xl:block xl:bg-gradient-to-r xl:from-white/75 xl:via-white/30 xl:via-35% xl:to-transparent xl:to-50%"
          />
          {/* ブランドメッセージ（文言は変更しない）。右上の空の上に置き、女性の顔・道には掛けない。
              スマホは 14px だと小さく見えるため 15px（2026-10-07 微調整。これ以上大きくすると 375px 幅で女性の髪に掛かる）。 */}
          <p className="absolute right-3 top-3 rounded-[var(--radius-md)] bg-white/75 px-3 py-1.5 text-right text-[0.9375rem] font-bold leading-snug text-[var(--color-primary-hover)] shadow-[var(--shadow-card)] backdrop-blur-[2px] sm:right-5 sm:top-5 sm:text-base xl:right-[4vw] xl:top-10 xl:px-4 xl:py-2.5 xl:text-xl">
            できないが、できるに変わる。
            <br />
            あなたのペースで。
          </p>
        </div>

        <div className="relative flex flex-col justify-center px-5 py-6 sm:px-10 sm:py-8 xl:min-h-[35rem] xl:px-[max(3.5rem,4vw)]">
          {/* 検索フォーム + 具体例チップを 1 つの検索エリアとしてまとめる (指示書「例えばこんなことをヘッド内へ」)。 */}
          <div className="w-full sm:max-w-lg xl:max-w-[30rem]">
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

      {/* ── 中央コンテンツのまとまり。6枚ストーリーを基準に、その下の
        「試した結果の見かた」「いろいろな方法が試されています」「自分の道を作る」まで
        同じ左右幅・左右位置に揃える (指示書「幅統一」)。
        本文 (max-w-5xl) より少し広く、xl 以上で max-w-6xl。個別に max-width を持たせず
        この 1 つの共通コンテナで幅を決める。 */}
      <div className="mx-auto w-full max-w-5xl space-y-10 pt-10 xl:max-w-6xl">
        {/* ── ② 6枚のストーリー。①→⑥ の順。タブレット以上は 2 列 × 3 行、
          スマホは 1 枚ずつ大きく見せる横スクロール（自動では動かない。2026-10-01）。 */}
        <StoryStrip />

        {/* ── ⑤ 試した結果の見かた。6枚ストーリー直後で存在感が弱くならないよう、
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
              <div className="mt-4 flex flex-wrap gap-3">
                <LinkButton href="/try" variant="primary">
                  <IconPlus aria-hidden="true" className="h-4 w-4" />
                  経験を教える（ログイン不要）
                </LinkButton>
                <LinkButton href="/me/roads/new" variant="secondary">
                  自分の道を作る
                </LinkButton>
              </div>
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
