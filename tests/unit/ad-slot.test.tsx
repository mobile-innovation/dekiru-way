import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AdSlot } from "@/components/ad-slot";

/**
 * 広告スロットの ON/OFF ゲートと AdSense 差し込み（広告表示方針 v1）。
 * - ADS_ENABLED != "true" → 何も描画しない（レイアウトに痕跡を残さない）。
 * - 有効時は「広告」と分かる枠を描画。
 * - NEXT_PUBLIC_ADSENSE_CLIENT ＋ slot ID が揃ったときだけ `<ins class="adsbygoogle">` を出す。
 */

afterEach(() => {
  cleanup();
  delete process.env.ADS_ENABLED;
  delete process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  delete process.env.NEXT_PUBLIC_ADSENSE_SLOT_SEARCH;
  delete process.env.NEXT_PUBLIC_ADSENSE_SLOT_ROAD;
});

describe("<AdSlot>", () => {
  it("ADS_ENABLED 未設定なら何も描画しない", () => {
    const { container } = render(<AdSlot slot="search_after_2" />);
    expect(container.firstChild).toBeNull();
  });

  it('ADS_ENABLED="false" でも何も描画しない', () => {
    process.env.ADS_ENABLED = "false";
    const { container } = render(<AdSlot slot="road_detail_mid" />);
    expect(container.firstChild).toBeNull();
  });

  it('ADS_ENABLED="true" で「広告」と分かる枠を描画。カテゴリは data 属性、実広告は無し', () => {
    process.env.ADS_ENABLED = "true";
    const { container } = render(
      <AdSlot slot="search_after_2" context={{ category: "clothing", subCategory: "dressing_support" }} />,
    );
    const el = container.querySelector('[aria-label="広告"]');
    expect(el).not.toBeNull();
    expect(el?.tagName.toLowerCase()).toBe("aside");
    expect(el?.textContent).toContain("広告");
    expect(el?.getAttribute("data-ad-slot")).toBe("search_after_2");
    expect(el?.getAttribute("data-ad-category")).toBe("clothing");
    // AdSense クライアント未設定なので配信タグは出さない
    expect(container.querySelector("ins.adsbygoogle")).toBeNull();
    // 経験カード (article) ではない
    expect(container.querySelector("article")).toBeNull();
  });

  it("ADSENSE_CLIENT ＋ slot ID が揃うと枠内に <ins class=adsbygoogle> を出す（非個人化・data 属性に ID）", () => {
    process.env.ADS_ENABLED = "true";
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT = "ca-pub-0000000000000000";
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_SEARCH = "1234567890";
    const { container } = render(<AdSlot slot="search_after_2" />);

    const frame = container.querySelector('[aria-label="広告"]');
    expect(frame).not.toBeNull();
    const ins = frame?.querySelector("ins.adsbygoogle");
    expect(ins).not.toBeNull();
    expect(ins?.getAttribute("data-ad-client")).toBe("ca-pub-0000000000000000");
    expect(ins?.getAttribute("data-ad-slot")).toBe("1234567890");
    expect(container.querySelector("article")).toBeNull();
  });

  it("道詳細枠は SLOT_ROAD を使う。SLOT が無い枠はプレースホルダのまま", () => {
    process.env.ADS_ENABLED = "true";
    process.env.NEXT_PUBLIC_ADSENSE_CLIENT = "ca-pub-0000000000000000";
    process.env.NEXT_PUBLIC_ADSENSE_SLOT_ROAD = "9876543210";
    const road = render(<AdSlot slot="road_detail_mid" />);
    expect(
      road.container.querySelector("ins.adsbygoogle")?.getAttribute("data-ad-slot"),
    ).toBe("9876543210");
    cleanup();

    // 検索枠は SLOT_SEARCH 未設定なので <ins> なし
    const search = render(<AdSlot slot="search_after_2" />);
    expect(search.container.querySelector("ins.adsbygoogle")).toBeNull();
    expect(search.container.querySelector('[aria-label="広告"]')).not.toBeNull();
  });
});
