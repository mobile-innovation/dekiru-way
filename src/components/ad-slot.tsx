import { env } from "@/lib/env";
import type { AdContext } from "@/lib/ads";

/**
 * 広告スロット（広告表示方針 v1）。
 *
 * - `ADS_ENABLED=true` のときだけ描画する。無効時は `null`（レイアウトに一切影響しない）。
 * - 検索一覧（`search_after_2`）と道詳細（`road_detail_mid`）の 2 枠のみで使う。
 *   トップ・自分の道・各フォーム・ログイン・アカウント画面では使わない。
 * - 経験カード（白背景＋緑の実線枠）とは明確に違う見た目（生成り背景＋破線枠＋「広告」表示）にし、
 *   経験情報と誤認させない。
 * - 広告プロバイダは未接続。接続時はこの中に配信タグを差し込む（UI と疎結合）。
 *   `data-ad-*` は将来のプロバイダ用のヒント。ここから外部へは何も送らない。
 * - 読み込み失敗時に大きな空白を残さないよう、プレースホルダ自体を小さく保つ。
 */
export function AdSlot({
  slot,
  context,
  className = "",
}: {
  slot: "search_after_2" | "road_detail_mid";
  context?: AdContext | null;
  className?: string;
}) {
  if (!env.ads.enabled) return null;

  return (
    <aside
      aria-label="広告"
      data-ad-slot={slot}
      data-ad-category={context?.category}
      data-ad-subcategory={context?.subCategory}
      className={`rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-4 py-3 text-center ${className}`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
        広告
      </p>
      <p className="mt-0.5 text-xs text-[var(--color-ink-muted)]">スポンサーからのお知らせ</p>
      {/* 広告プロバイダの配信タグはここに入る（未接続時はプレースホルダのみ）。 */}
    </aside>
  );
}
