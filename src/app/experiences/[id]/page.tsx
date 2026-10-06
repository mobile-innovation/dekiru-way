import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Callout, Card } from "@/components/ui";
import { IconHistory, IconInfo, IconRoute, IconSprout, IconTarget } from "@/components/icons";
import { BranchingPaths, type Branch } from "@/components/branching-paths";
import { RateLimitedNotice } from "@/components/rate-limited-notice";
import { LikeButton } from "@/components/like-button";
import { ShareButton } from "@/components/share-button";
import { MarkRead } from "@/components/mark-read";
import { MarkReadLocal } from "@/components/mark-read-local";
import { AdSlot } from "@/components/ad-slot";
import { adContextFromText } from "@/lib/ads";
import { getExperience } from "@/lib/queries";
import { getOptionalUserId } from "@/lib/authz";
import { guardPublicPage } from "@/lib/page-guard";
import { DISCLAIMER } from "@/lib/ai/client";
import { env } from "@/lib/env";
import { buildShareText, experienceShareUrl, methodCount } from "@/lib/share";

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
    // 共有される URL はページ送り (?p=) を含まない正規 URL。SNS 共有指示書 §12 で canonical を追加。
    alternates: { canonical: `/experiences/${id}` },
    // 検索エンジン露出方針 (2026-09-20 改定): 経験詳細はトップと並んで index 対象。
    // ルート layout の既定 (noindex) をここだけ上書きする。
    robots: { index: true, follow: true },
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

  const viewerUserId = await getOptionalUserId();
  const exp = await getExperience(id, viewerUserId);
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

  // SNS 共有文（SNS共有機能追加指示書）。このページで公開表示している困りごと・方法・結果だけから作る。
  const shareText = buildShareText({
    difficulty: r.difficulty,
    goal: r.goal,
    methods: branches.map((b) => ({ method: b.method, result: b.result })),
  });
  const shareUrl = experienceShareUrl(env.site.url, exp.id);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      {/* 経験詳細を開いた = 既読 (既読引き継ぎ指示書)。
          ログイン中は自分の経験でない限りサーバーへ、未ログインはブラウザ (localStorage) へ記録する。
          どちらもログイン不要の閲覧方針は変えない。 */}
      {viewerUserId != null ? (
        !exp.like.isMine && <MarkRead attemptId={exp.id} />
      ) : (
        <MarkReadLocal attemptId={exp.id} />
      )}

      {/* ① 戻る / ② タイトル */}
      <div className="space-y-4">
        <p className="text-sm">
          <Link href="/experiences">← 経験を探すへ戻る</Link>
        </p>
        <header className="space-y-2">
          {/* タイトル = 困っていたこと（Road.difficulty）。同じ文をカード内に重ねて出さず、ラベルで意味を示す
              （経験詳細ページ 情報設計・UI改善指示書 §3、2026-10-06 ユーザー確認）。
              difficulty が無い古いデータはタイトルが goal になるので、そのときはラベルを付けない。 */}
          <div>
            {r.difficulty && (
              <p className="text-xs font-bold tracking-wide text-[var(--color-ink-muted)]">
                困っていたこと
              </p>
            )}
            <h1 className="mt-0.5 text-xl font-bold leading-snug sm:text-2xl">
              {r.difficulty ?? r.goal ?? "経験の詳細"}
            </h1>
          </div>
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
            {/* 見出しの右に「参考になった」= この道が役に立ったことを投稿者へ伝えるボタン（いいね指示書）と、
                控えめな「この道をSNSで紹介」（SNS共有機能追加指示書）。スマホでは折り返して見出しの下に来る。
                共有カードは押したときだけ開く（スマホはこの行の下、PC はボタン直下に重ねる。relative はその基点）。 */}
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <IconRoute
                  aria-hidden="true"
                  className="h-5 w-5 shrink-0 text-[var(--color-primary)]"
                />
                この人がたどった道
              </h2>
              <div className="relative flex flex-wrap items-start gap-x-3 gap-y-2">
                <LikeButton
                  attemptId={exp.id}
                  isMine={exp.like.isMine}
                  loggedIn={viewerUserId != null}
                  initialLiked={exp.like.likedByMe}
                  loginNext={`/experiences/${id}`}
                />
                <ShareButton
                  text={shareText}
                  url={shareUrl}
                  title={r.difficulty ?? r.goal ?? "この人がたどった道"}
                />
              </div>
            </div>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              困りごとから、実際に試してきた方法を順番に見ることができます。
            </p>

            {/* 道の起点: できていたこと（控えめ・登録が無ければ出さない）→ できるようにしたいこと（強調）。
                「困っていたこと」はページタイトル。値が無い項目は補わない（指示書 §10）。 */}
            {(r.previouslyAble || (r.difficulty && r.goal)) && (
              <div className="mt-4 space-y-2">
                {r.previouslyAble && (
                  <div className="rounded-[var(--radius-sm)] bg-[var(--color-surface-sunken)] px-3 py-1.5 text-sm">
                    <span className="flex items-center gap-1 text-[0.6875rem] font-bold tracking-wide text-[var(--color-ink-muted)]">
                      <IconHistory aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span>できていたこと</span>
                    </span>
                    <span className="mt-0.5 block whitespace-pre-wrap text-[var(--color-ink-muted)]">
                      {r.previouslyAble}
                    </span>
                  </div>
                )}
                {/* goal はタイトルに使っていない（difficulty がある）ときだけここに出す */}
                {r.difficulty && r.goal && (
                  <div className="rounded-[var(--radius-sm)] bg-[var(--color-primary-soft)] px-3 py-2">
                    <span className="flex items-center gap-1 text-[0.6875rem] font-bold tracking-wide text-[var(--color-ink-muted)]">
                      <IconTarget aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      <span>できるようにしたいこと</span>
                    </span>
                    <span className="mt-0.5 block whitespace-pre-wrap font-bold">{r.goal}</span>
                  </div>
                )}
              </div>
            )}

            {/* 中心コンテンツ: 試してきた方法（方法＋結果のカードを時系列の線でつなぐ） */}
            <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-bold">試してきた方法</h3>
              <span className="text-sm font-semibold text-[var(--color-ink-muted)]">
                {methodCount(branches.length)}の方法
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
              うまくいかなかった方法も含めて残っています。
            </p>

            <div className="mt-3">
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

          {/* 道の内容を読んだあとに広告を 1 枠（広告表示方針 v1 §3）。
              「次の一歩」(右サイドの CTA) より前・経験情報とは別枠。ADS_ENABLED=false なら何も出ない。 */}
          <AdSlot slot="road_detail_mid" context={adContextFromText(r.difficulty ?? r.goal)} />
        </div>

        {/* PC は右サイド、スマホは道の下: 参考情報 → 自分の道を作る */}
        <aside className="space-y-4">
          <Callout tone="warn">
            <span className="mb-1 flex items-center gap-1.5 font-bold">
              <IconInfo aria-hidden="true" className="h-4 w-4 shrink-0" />
              この情報について
            </span>
            {DISCLAIMER} 枝分かれの中で「できるようになった」が正解というわけではありません。
            うまくいかなかった方法も、次の人にとって大切な情報です。
          </Callout>

          <Card as="section">
            {/* 経験を読み終えたあとの導線（指示書 §14）。SNS で紹介する（他人に教える）とは別の行動 */}
            <p className="flex items-start gap-1.5 font-semibold">
              <IconSprout
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]"
              />
              あなたも同じことで困っていますか？
            </p>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              あなたが試した方法も、誰かの次の一歩になるかもしれません。うまくいかなかったことも、大切な経験です。
            </p>
            <Link
              href={r.difficulty ? `/try?problem=${encodeURIComponent(r.difficulty)}` : "/try"}
              className="mt-3 block rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-5 py-2.5 text-center text-sm font-semibold text-[var(--color-primary-ink)] no-underline"
            >
              自分が試した方法を残す
            </Link>
            <Link href="/me/roads/new" className="mt-2 block text-center text-sm underline">
              ログインして自分の道を作る
            </Link>
          </Card>
        </aside>
      </div>
    </div>
  );
}
