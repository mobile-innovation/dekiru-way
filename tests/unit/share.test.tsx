import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  buildShareText,
  experienceShareUrl,
  xShareUrl,
  xWeightedLength,
  type ShareSource,
} from "@/lib/share";
import { ShareButton } from "@/components/share-button";

/** 経験詳細の SNS 共有（SNS共有機能追加指示書）。共有文は公開表示している困りごと・方法・結果だけから作る。 */

const ID = "11111111-1111-4111-8111-111111111111";
const fitsX = (t: string) => xWeightedLength(t) + 1 + 23 <= 280;

describe("experienceShareUrl / xShareUrl", () => {
  it("既存の SITE_URL を基点に /experiences/{id} の正規 URL を作る（末尾スラッシュは除く）", () => {
    expect(experienceShareUrl("https://dekirumichi.net/", ID)).toBe(
      `https://dekirumichi.net/experiences/${ID}`,
    );
  });

  it("X の投稿画面（intent）に本文と URL を渡す。自動投稿の API は使わない", () => {
    const u = new URL(xShareUrl("キッチン\n狭い", "https://dekirumichi.net/experiences/x"));
    expect(u.origin + u.pathname).toBe("https://x.com/intent/post");
    expect(u.searchParams.get("text")).toBe("キッチン\n狭い");
    expect(u.searchParams.get("url")).toBe("https://dekirumichi.net/experiences/x");
  });
});

describe("buildShareText", () => {
  const base: ShareSource = {
    difficulty: "キッチンが狭くて、料理がしにくい",
    goal: "料理を続けたい",
    methods: [
      { method: "調理器具を片付ける", result: "partial" },
      { method: "別の場所へ移す", result: "failed" },
      { method: "排気口カバーを使う", result: "success" },
    ],
  };

  it("困っていたこと → 試したこと → 結果のひとこと の順で、URL は含めない", () => {
    const t = buildShareText(base);
    expect(t).toBe(
      [
        "キッチンが狭くて、料理がしにくい。",
        "",
        "この人は、",
        "・調理器具を片付ける",
        "・別の場所へ移す",
        "・排気口カバーを使う",
        "という方法を試していました。",
        "",
        "うまくいかなかった方法も含めて、実際の試行錯誤が残っています。",
        "",
        "↓ この人がたどった道",
      ].join("\n"),
    );
    expect(t).not.toContain("http");
    expect(fitsX(t)).toBe(true);
  });

  it("うまくいかなかった経験を成功のように書き換えない（変化なし・失敗だけ）", () => {
    const t = buildShareText({
      ...base,
      methods: [
        { method: "A", result: "failed" },
        { method: "B", result: "no_change" },
        { method: "C", result: "failed" },
      ],
    });
    expect(t).toContain("どの方法も、十分な改善にはつながりませんでした。");
    expect(t).not.toMatch(/できるようになった|うまくいった|成功|効果/);
  });

  it("1 件ならその結果をそのまま、継続中だけなら『途中』。成功を断定する文は作らない", () => {
    expect(buildShareText({ ...base, methods: [{ method: "A", result: "failed" }] })).toContain(
      "結果は「うまくいかなかった」でした。",
    );
    expect(buildShareText({ ...base, methods: [{ method: "A", result: "no_change" }] })).toContain(
      "結果は「変化はなかった」でした。",
    );
    expect(
      buildShareText({
        ...base,
        methods: [
          { method: "A", result: "ongoing" },
          { method: "B", result: "ongoing" },
        ],
      }),
    ).toContain("いまも試している途中です。");
    // うまくいった＋継続中のように、ひとことで言い切れないときは結果を書かない（ページで見てもらう）
    const mixed = buildShareText({
      ...base,
      methods: [
        { method: "A", result: "success" },
        { method: "B", result: "ongoing" },
      ],
    });
    expect(mixed).not.toMatch(/成功|効果|うまくいかなかった|結果は/);
  });

  it("3 件までは全部、4 件以上は代表 2 件＋件数。9 以下は「つ」、10 以上は「件」（「12つ」にしない）", () => {
    const many = (n: number) =>
      buildShareText({
        ...base,
        methods: Array.from({ length: n }, (_, i) => ({
          method: i === 0 ? "一\nつ目" : `方法${i + 1}`,
          result: "partial",
        })),
      });
    expect(many(3)).toContain("・一 つ目\n・方法2\n・方法3\nという方法を試していました。");
    expect(many(5)).toContain("・一 つ目\n・方法2\nなど、5つの方法を試していました。");
    expect(many(5)).not.toContain("・方法3");
    expect(many(12)).toContain("など、12件の方法を試していました。");
    expect(many(12)).not.toMatch(/\d{2}つ/);
  });

  it("方法が 20 件あっても共有文は短いまま（URL 込みで X に収まる・全文コピーにならない）", () => {
    const t = buildShareText({
      ...base,
      methods: Array.from({ length: 20 }, (_, i) => ({
        method: `スマホの文字を大きくする設定その${i + 1}を試した`,
        result: i % 2 ? "failed" : "success",
      })),
    });
    expect(fitsX(t)).toBe(true);
    expect(t.split("\n").filter((l) => l.startsWith("・"))).toHaveLength(2);
    expect(t).toContain("など、20件の方法を試していました。");
  });

  it("長い入力でも X の上限（日本語 1 字 = 2、URL = 23）に収まるよう削る。困りごとは残す", () => {
    const long = "あ".repeat(300);
    const t = buildShareText({
      difficulty: `困りごと${long}`,
      goal: null,
      methods: Array.from({ length: 6 }, (_, i) => ({
        method: `方法${i}${long}`,
        result: "failed",
      })),
    });
    expect(fitsX(t)).toBe(true);
    expect(t.startsWith("困りごと")).toBe(true);
    expect(t).toContain("・方法0");
    expect(t).toContain("6つの方法を試していました。");
  });

  it("困りごとが無ければやりたいことを使い、どちらも無くても作れる。文末が句読点なら「。」を足さない", () => {
    expect(buildShareText({ ...base, difficulty: null }).startsWith("料理を続けたい。\n")).toBe(
      true,
    );
    expect(
      buildShareText({ ...base, difficulty: "料理ができない！" }).startsWith("料理ができない！\n"),
    ).toBe(true);
    expect(buildShareText({ difficulty: null, goal: null, methods: [] })).toBe(
      "↓ この人がたどった道",
    );
  });
});

afterEach(cleanup);

describe("ShareButton", () => {
  const url = `https://dekirumichi.net/experiences/${ID}`;

  it("最初は控えめなボタンだけ。押すと共有文・X・コピーが開く（自動投稿しない旨も出す）", () => {
    render(<ShareButton text={"困りごと\n↓ この人がたどった道"} url={url} title="困りごと" />);
    const btn = screen.getByRole("button", { name: "この道をSNSで紹介" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Xで紹介する" })).toBeNull();

    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/自動では投稿されません/)).toBeTruthy();
    expect(screen.getByLabelText("共有される文章").textContent).toBe(
      `困りごと\n↓ この人がたどった道\n${url}`,
    );
    const x = screen.getByRole("link", { name: "Xで紹介する" });
    const href = new URL(x.getAttribute("href")!);
    expect(href.origin + href.pathname).toBe("https://x.com/intent/post");
    expect(href.searchParams.get("url")).toBe(url);
    expect(href.searchParams.get("text")).toBe("困りごと\n↓ この人がたどった道");
    expect(x.getAttribute("target")).toBe("_blank");
    expect(x.getAttribute("rel")).toContain("noopener");
    expect(screen.getByRole("button", { name: "リンクをコピー" })).toBeTruthy();
  });

  it("もう一度押す・「閉じる」・Esc で閉じ、閉じたらボタンにフォーカスが戻る", () => {
    render(<ShareButton text="困りごと" url={url} title="困りごと" />);
    const btn = screen.getByRole("button", { name: "この道をSNSで紹介" });
    const isOpen = () => screen.queryByRole("link", { name: "Xで紹介する" }) != null;

    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(isOpen()).toBe(false);

    fireEvent.click(btn);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);
    fireEvent.keyDown(screen.getByRole("link", { name: "Xで紹介する" }), { key: "Escape" });
    expect(isOpen()).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("カードの外側を押すと閉じる。カードの中を押しても閉じない", () => {
    render(
      <div>
        <p>道の本文</p>
        <ShareButton text="困りごと" url={url} title="困りごと" />
      </div>,
    );
    const btn = screen.getByRole("button", { name: "この道をSNSで紹介" });
    fireEvent.click(btn);
    fireEvent.pointerDown(screen.getByLabelText("共有される文章"));
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.pointerDown(screen.getByText("道の本文"));
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("「リンクをコピー」は正規 URL だけをコピーする", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<ShareButton text="困りごと" url={url} title="困りごと" />);
    fireEvent.click(screen.getByRole("button", { name: "この道をSNSで紹介" }));
    fireEvent.click(screen.getByRole("button", { name: "リンクをコピー" }));
    expect(await screen.findByRole("button", { name: "リンクをコピーしました" })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(url);
  });
});
