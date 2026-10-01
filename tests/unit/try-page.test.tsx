import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * /try（SNS 簡易登録）のページ。2026-10-01 に導入イラストを try.png → try_image.png（1774×887）へ差し替え。
 */

vi.mock("next/image", () => ({
  default: (p: { src: string; alt: string; width: number; height: number }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.src} alt={p.alt} width={p.width} height={p.height} />
  ),
}));
vi.mock("@/lib/client/api", () => ({
  api: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ClientApiError: class extends Error {},
}));

import TryPage from "@/app/try/page";

afterEach(cleanup);

describe("/try ページ", () => {
  it("導入イラストは try_image.png（1774×887）で、ファイルが public にある", async () => {
    render(await TryPage({ searchParams: Promise.resolve({}) }));
    const img = screen.getByAltText(/困ったことを工夫しながら試し/);
    expect(img.getAttribute("src")).toBe("/try_image.png");
    expect(img.getAttribute("width")).toBe("1774");
    expect(img.getAttribute("height")).toBe("887");
    expect(existsSync(join(process.cwd(), "public", "try_image.png"))).toBe(true);
    // 旧ファイル名は使わない
    expect(existsSync(join(process.cwd(), "public", "try.png"))).toBe(false);
  });

  it("説明文は本文色、注意文（個人情報）は 13px（2026-10-01 最終UI調整）", async () => {
    render(await TryPage({ searchParams: Promise.resolve({}) }));
    expect(
      screen.getByText(/困っていたことと、試してみた方法を教えてください/).className,
    ).toContain("text-[var(--color-ink)]");
    expect(screen.getByText(/氏名や連絡先など/).className).toContain("text-[13px]");
  });
});
