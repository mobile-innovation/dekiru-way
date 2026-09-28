import type { Metadata } from "next";
import { Fragment, Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { RoadCard } from "@/components/road-card";
import { MethodCard } from "@/components/method-card";
import { AdSlot } from "@/components/ad-slot";
import { RestoreSearch } from "@/components/restore-search";
import { ExperienceSearchForm } from "@/components/experience-search-form";
import { EmptyState } from "@/components/ui";
import { RateLimitedNotice } from "@/components/rate-limited-notice";
import { experienceQuerySchema } from "@/lib/validation";
import { searchRoads, searchMethods, getPopularTags } from "@/lib/queries";
import { expandSearchIntent, type SearchIntent } from "@/lib/ai/search";
import {
  fuzzySearchRoadIds,
  fuzzySearchAttemptIds,
  FUZZY_CANDIDATE_LIMIT,
} from "@/lib/search-fuzzy";
import { adContextFromText } from "@/lib/ads";
import { getOptionalUserId } from "@/lib/authz";
import { guardPublicPage } from "@/lib/page-guard";
import { ApiError } from "@/lib/api";
import { enforceRateLimit, clientKeyFromHeaders, RATE_PRESETS } from "@/lib/ratelimit";
import { semanticIndex, type SemanticRanking } from "@/lib/search-semantic";
import { env } from "@/lib/env";

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
        read: undefined,
        page: 1,
        mp: 1,
        kind: "road" as const,
        limit: 20,
        sort: "recent" as const,
        ai: undefined,
        sem: undefined,
      };

  // kind（道 / 方法 / 両方）は検索語の有無に関わらず効く。
  // 検索語なしでも「方法だけ」で公開された試したことの一覧を見られる。
  const roadEnabled = q.kind !== "method";
  const methodEnabled = q.kind !== "road";
  const emptyRes = { items: [] as never[], total: 0, page: 1, hasMore: false, windowExceeded: false };

  // ログイン中なら各カードに既読/未読を付ける（未ログインは全て未読扱い）。
  const viewerUserId = await getOptionalUserId();

  // 検索AIアシスト (Phase 1): ?ai=1 かつ検索語があるときだけ、AI で意図を展開して
  // 複数語ハイブリッド検索＋ページ内関連度ランキングを通す。AI 未設定・失敗でも
  // expandSearchIntent は決定的な展開結果を返し、通常のキーワード検索として機能する。
  //
  // ここはログイン不要の公開ページなので、`guardPublicPage` の一般的な巡回検知だけでは
  // AI 呼び出し（課金対象）を守れない。他の AI エンドポイントと同じ `RATE_PRESETS.ai`
  // （15/分・クライアント単位）をここでも掛け、超過時は例外を投げずに黙って
  // AI 抜きの通常キーワード検索へフォールバックする（検索そのものは止めない）。
  // 意味検索 (Embedding・試験導入): ?sem=1 かつサーバー側で有効化されているときだけ。
  // 意味の近い順の id を既存の searchRoads / searchMethods の ids 経路に渡すので、公開ゲート・
  // 絞り込み・ページ送りは通常検索と同じ。モデルの読み込み失敗・レート制限時は黙って通常検索に戻す。
  // 使っているときは AI アシスト・表記ゆれ検索は通さない（結果の出どころを混ぜない）。
  let semantic: SemanticRanking | null = null;
  if (q.sem === "1" && q.q && env.semantic.configured) {
    try {
      const clientId = clientKeyFromHeaders(await headers());
      enforceRateLimit({ key: `semantic:search:${clientId}`, ...RATE_PRESETS.ai });
      semantic = await semanticIndex.rank(q.q, env.semantic.topK, env.semantic.margin);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "rate_limited")) {
        console.warn("[semantic] search failed, using keyword search:", err instanceof Error ? err.message : "unknown");
      }
    }
  }

  const aiAssist = !semantic && q.ai === "1" && !!q.q;
  let intent: SearchIntent | null = null;
  if (aiAssist) {
    try {
      const clientId = clientKeyFromHeaders(await headers());
      enforceRateLimit({ key: `ai:search:${clientId}`, ...RATE_PRESETS.ai });
      intent = await expandSearchIntent(q.q ?? "");
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "rate_limited")) throw err;
      // レート制限時は intent を null のままにし、下のフォールバック経路（通常検索）に任せる。
    }
  }
  const searchOpts = intent ? { terms: intent.terms, rank: true } : undefined;

  const tagsPromise = getPopularTags(12);
  let [roadRes, methodMatch] = await Promise.all([
    roadEnabled
      ? searchRoads(q, viewerUserId, semantic ? { ids: semantic.roadIds } : searchOpts)
      : Promise.resolve(emptyRes),
    methodEnabled
      ? searchMethods(q, viewerUserId, semantic ? { ids: semantic.attemptIds } : searchOpts)
      : Promise.resolve(emptyRes),
  ]);

  // AIアシストで 1 件も見つからなければ、通常のキーワード検索へ自動フォールバック
  // （利用者は必ずキーワード検索の結果を受け取れる）。
  let aiFellBack = false;
  if (aiAssist && roadRes.total === 0 && methodMatch.total === 0) {
    aiFellBack = true;
    [roadRes, methodMatch] = await Promise.all([
      roadEnabled ? searchRoads(q, viewerUserId) : Promise.resolve(emptyRes),
      methodEnabled ? searchMethods(q, viewerUserId) : Promise.resolve(emptyRes),
    ]);
  }

  // 表記ゆれに強い検索 (pg_trgm、AI・外部サービス不使用): 通常のキーワード検索
  // （AIアシスト利用時はその結果も含め）で 1 件も見つからなかったときだけの最後の手段。
  // DB 内 (pg_trgm) で完結するため、課金や外部サービス停止のリスクが無い。
  let fuzzyFellBack = false;
  if (!semantic && q.q && q.q.trim().length >= 2 && roadRes.total === 0 && methodMatch.total === 0) {
    // 候補は到達可能なページぶん (FUZZY_CANDIDATE_LIMIT) を、絞り込み条件を掛けたうえで類似度順に取る。
    const fuzzyFilters = { result: q.result, tag: q.tag, read: q.read, viewerUserId };
    const [fuzzyRoadIds, fuzzyAttemptIds] = await Promise.all([
      roadEnabled
        ? fuzzySearchRoadIds(q.q, FUZZY_CANDIDATE_LIMIT, fuzzyFilters)
        : Promise.resolve([]),
      methodEnabled
        ? fuzzySearchAttemptIds(q.q, FUZZY_CANDIDATE_LIMIT, fuzzyFilters)
        : Promise.resolve([]),
    ]);
    if (fuzzyRoadIds.length > 0 || fuzzyAttemptIds.length > 0) {
      fuzzyFellBack = true;
      [roadRes, methodMatch] = await Promise.all([
        roadEnabled && fuzzyRoadIds.length > 0
          ? searchRoads(q, viewerUserId, { ids: fuzzyRoadIds })
          : Promise.resolve(emptyRes),
        methodEnabled && fuzzyAttemptIds.length > 0
          ? searchMethods(q, viewerUserId, { ids: fuzzyAttemptIds })
          : Promise.resolve(emptyRes),
      ]);
    }
  }
  const tags = await tagsPromise;
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
      {/* 他ページから素の /experiences に戻ってきたとき、前回の検索状態を復元する */}
      <Suspense fallback={null}>
        <RestoreSearch />
      </Suspense>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">経験を探す</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          できなくなったことや困ったことから、いろいろな人の「道」を探せます。
        </p>
      </div>

      {/* URL の検索条件が変わったら（戻る/復元も含む）フォームの初期値を取り直す */}
      <ExperienceSearchForm
        key={`${q.q ?? ""}|${q.result ?? ""}|${q.tag ?? ""}|${q.kind}|${q.sort}|${q.read ?? ""}|${q.ai ?? ""}`}
        defaultQ={q.q ?? ""}
        defaultResult={q.result ?? ""}
        defaultTag={q.tag ?? ""}
        defaultKind={q.kind}
        defaultSort={q.sort}
        defaultRead={q.read ?? ""}
        defaultAi={q.ai === "1"}
        loggedIn={viewerUserId != null}
        tags={tags}
      />

      {intent && (
        <AiAssistPanel intent={intent} fellBack={aiFellBack} plainHref={plainSearchHref(sp)} />
      )}

      {semantic && <SemanticNotice plainHref={searchHrefWithout(sp, "sem")} />}

      {fuzzyFellBack && <FuzzyFallbackNotice />}

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
            <EmptyState title="もう少し絞り込んでください">
              <p>
                道は一度にすべては表示していません。困っている場面や結果で絞ると見つけやすくなります。
              </p>
            </EmptyState>
          ) : items.length > 0 ? (
            <ul className="grid gap-4 lg:grid-cols-2">
              {items.map((road, i) => (
                <Fragment key={road.entryId}>
                  <li>
                    <RoadCard road={road} loggedIn={viewerUserId != null} />
                  </li>
                  {/* 最初の 2 件のあとに広告を 1 枠だけ（3 件以上あるときのみ）。
                      経験カードとは別枠で、順位には影響しない。ADS_ENABLED=false なら何も出ない。 */}
                  {i === 1 && items.length > 2 && (
                    <li className="lg:col-span-2">
                      <AdSlot slot="search_after_2" context={adContextFromText(q.q)} />
                    </li>
                  )}
                </Fragment>
              ))}
            </ul>
          ) : hasMethodSection ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              下の「試したことの記録」を見てください。
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
              {q.q ? `「${q.q}」が方法の中にあった記録` : "試したことの記録"}
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {q.q
                ? "試したことや気づきの文章の中にことばが見つかった記録です。"
                : "誰かが試したことの記録です。"}
              カードを開くと、その方法をたどった道が見られます。
            </p>
            <p aria-live="polite" className="text-xs text-[var(--color-ink-muted)]">
              {methodMatch.windowExceeded
                ? "これ以上は記録を表示できません。ことばやタグ、結果でもう少し絞り込んでください。"
                : `${methodMatch.total} 件`}
            </p>
          </div>

          {methodMatch.windowExceeded ? (
            <EmptyState title="もう少し絞り込んでください">
              <p>記録は一度にすべては表示していません。結果やタグで絞ると見つけやすくなります。</p>
            </EmptyState>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {methodMatch.items.map((m) => (
                <li key={m.attemptId}>
                  <MethodCard method={m} loggedIn={viewerUserId != null} />
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

/** いまの検索条件から AI アシスト（と現在ページ）を外したリンク。 */
function plainSearchHref(sp: SearchParams): string {
  const params = new URLSearchParams(flatten(sp));
  params.delete("ai");
  params.delete("page");
  params.delete("mp");
  const qs = params.toString();
  return qs ? `/experiences?${qs}` : "/experiences";
}

/**
 * AI が検索意図をどう広げたかを、結果の上に短く見せるパネル。
 * AI は経験を作らない。展開した検索語（プレーンテキスト）と言い換えだけを表示する。
 */
function AiAssistPanel({
  intent,
  fellBack,
  plainHref,
}: {
  intent: SearchIntent;
  fellBack: boolean;
  plainHref: string;
}) {
  const heading = intent.source === "ai" ? "AIが検索を手伝いました" : "検索のことばをひろげました";
  return (
    <section
      aria-label="AIアシスト検索"
      className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-4 text-sm"
    >
      <p className="font-bold text-[var(--color-ink)]">{heading}</p>
      <p className="text-[var(--color-ink-muted)]">
        AIは答えを作りません。あなたの言葉を、みんなの経験に結びつけています。
      </p>
      {intent.rephrased && (
        <p className="text-[var(--color-ink)]">
          言い換え：<span className="font-medium">{intent.rephrased}</span>
        </p>
      )}
      {intent.terms.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="検索に使ったことば">
          {intent.terms.map((t) => (
            <li
              key={t}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-0.5 text-xs text-[var(--color-ink)]"
            >
              {t}
            </li>
          ))}
        </ul>
      )}
      {fellBack && (
        <p className="text-[var(--color-ink-muted)]">
          AIでの絞り込みでは見つからなかったため、ふつうのキーワード検索の結果を表示しています。
        </p>
      )}
      <p className="text-xs text-[var(--color-ink-muted)]">{intent.disclaimer}</p>
      <Link href={plainHref} className="inline-block font-semibold underline">
        AIアシストをやめて検索する
      </Link>
    </section>
  );
}

/** いまの検索条件から指定のクエリ（と現在ページ）を外したリンク。 */
function searchHrefWithout(sp: SearchParams, key: string): string {
  const params = new URLSearchParams(flatten(sp));
  params.delete(key);
  params.delete("page");
  params.delete("mp");
  const qs = params.toString();
  return qs ? `/experiences?${qs}` : "/experiences";
}

/**
 * 意味検索 (?sem=1・試験導入) で表示していることを短く伝える。
 * モデルはサーバー上で動かしており、外部サービスには送っていない。
 */
function SemanticNotice({ plainHref }: { plainHref: string }) {
  return (
    <section
      aria-label="意味の近い経験の検索"
      className="space-y-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-4 text-sm"
    >
      <p className="font-bold text-[var(--color-ink)]">意味の近い経験を表示しています（試験中）</p>
      <p className="text-[var(--color-ink-muted)]">
        ことばが違っていても、内容が近い道・記録を探しています。
      </p>
      <Link href={plainHref} className="inline-block font-semibold underline">
        ふつうの検索に戻す
      </Link>
    </section>
  );
}

/**
 * 通常のキーワード検索・AIアシストどちらでも 0 件だったとき、表記ゆれ検索 (pg_trgm) で
 * 近い言い回しを拾った旨を短く伝える。DB 内で完結し、AI・外部サービスは使っていない。
 */
function FuzzyFallbackNotice() {
  return (
    <section
      aria-label="表記ゆれ検索"
      className="space-y-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-primary-tint)] p-4 text-sm"
    >
      <p className="font-bold text-[var(--color-ink)]">近いことばで探しました</p>
      <p className="text-[var(--color-ink-muted)]">
        そのままの言葉では見つからなかったため、似た言い回しの道・記録を表示しています。
        AIや外部サービスは使っていません。
      </p>
    </section>
  );
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
