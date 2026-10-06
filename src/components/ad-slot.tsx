import { env } from "@/lib/env";
import type { AdContext } from "@/lib/ads";
import { AdSenseUnit } from "@/components/adsense-unit";

type SlotName = "search_after_2" | "road_detail_mid";

/**
 * 広告スロット（広告表示方針 v1）。
 *
 * - `ADS_ENABLED=true` のときだけ描画する。無効時は `null`（レイアウトに一切影響しない）。
 * - 検索一覧（`search_after_2`）と道詳細（`road_detail_mid`）の 2 枠のみで使う。
 *   トップ・自分の道・各フォーム・ログイン・アカウント画面では使わない。
 * - 経験カード（白背景＋緑の実線枠）とは明確に違う見た目（生成り背景＋破線枠＋「広告」表示）にし、
 *   経験情報と誤認させない。
 * - `NEXT_PUBLIC_ADSENSE_CLIENT` ＋ その枠の slot ID が揃っていれば Google AdSense の配信タグ
 *   （非パーソナライズ）を差し込む。揃っていなければ控えめなプレースホルダのみ（dev / 審査前）。
 * - `context`（内部カテゴリ）は AdSense へは渡さない。`data-ad-*` は DOM 内のヒントで、ここから
 *   外部へは何も送らない。
 */
export function AdSlot({
  slot,
  context,
  className = "",
}: {
  slot: SlotName;
  context?: AdContext | null;
  className?: string;
}) {
  if (!env.ads.enabled) return null;

  const client = env.ads.adsenseClient;
  const adUnitSlot =
    slot === "search_after_2" ? env.ads.adsenseSlotSearch : env.ads.adsenseSlotRoad;
  const useAdsense = Boolean(client && adUnitSlot);

  return (
    <aside
      aria-label="広告"
      data-ad-slot={slot}
      data-ad-category={context?.category}
      data-ad-subcategory={context?.subCategory}
      className={`rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-center ${className}`}
    >
      <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
        広告
      </p>
      {useAdsense ? (
        <AdSenseUnit client={client} slot={adUnitSlot} />
      ) : (
        <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">スポンサーからのお知らせ</p>
      )}
    </aside>
  );
}
