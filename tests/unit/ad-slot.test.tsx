import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AdSlot } from "@/components/ad-slot";

/**
 * 広告スロットの ON/OFF ゲート（広告表示方針 v1 §11）。
 * - ADS_ENABLED != "true" のときは何も描画しない（レイアウトに痕跡を残さない）。
 * - 有効時は「広告」と分かる表示・aria-label・data 属性を持つ。
 */

afterEach(() => {
  cleanup();
  delete process.env.ADS_ENABLED;
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

  it('ADS_ENABLED="true" で「広告」と分かる枠を描画し、カテゴリは data 属性に載る', () => {
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
    // 経験カード (article) ではない
    expect(container.querySelector("article")).toBeNull();
  });
});
