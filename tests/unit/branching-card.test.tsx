import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BranchingPaths, type Branch } from "@/components/branching-paths";

/**
 * 経験詳細の方法カード（最終仕上げ指示書）。
 *   第 1 層: 方法 → 結果 → できた度 → 結果説明（state_after。「現在：」ラベルは付けない）
 *   第 2 層（詳しく見る）: 気づき → そのときの気持ち → 現在（Road.progress を補ったときだけ）→ 次に試すこと
 */

afterEach(cleanup);

const base: Branch = { id: "a1", method: "IHに変えた", result: "success", triedAt: "2025-07-25" };

function renderCard(branches: Branch[], progress?: string | null) {
  return render(
    <BranchingPaths
      heading={null}
      note={null}
      trunkLayout="none"
      trunk={{}}
      branches={branches}
      present={{ progress }}
      pageHref={(p) => `/experiences/a1?p=${p}`}
    />,
  );
}

describe("経験詳細の方法カード", () => {
  it("state_after は結果の直下にラベル無しで出す。「詳しく見る」は括弧書き無しで統一", () => {
    renderCard([
      {
        ...base,
        achievementPercent: 80,
        stateAfter: "一人でも温度を決めて調理できるようになった。",
        note: "温度を数字で決められる",
        feeling: "ほっとした",
      },
    ]);
    expect(screen.getByText("一人でも温度を決めて調理できるようになった。").tagName).toBe("P");
    expect(screen.queryByText("現在：")).toBeNull();
    expect(screen.getByText("できた度 80%")).toBeTruthy();
    const summary = document.querySelector("summary")!;
    expect(summary.textContent).toBe("＋−詳しく見る閉じる");
    // 詳細は存在する項目だけ、ラベル付きで
    const labels = [...document.querySelectorAll("details dt")].map((d) => d.textContent);
    expect(labels).toEqual(["気づき：", "そのときの気持ち："]);
    expect(document.querySelector("details")!.hasAttribute("open")).toBe(false);
  });

  it("state_after が無い最新の方法に Road.progress を補ったときは、結果説明ではなく詳細の「現在」に出す", () => {
    renderCard(
      [{ ...base, isCurrent: true, nextAction: "音声タイマーを試す" }],
      "いまは週 3 回自炊",
    );
    const labels = [...document.querySelectorAll("details dt")].map((d) => d.textContent);
    expect(labels).toEqual(["現在：", "次に試すこと："]);
    expect(screen.getByText("いまは週 3 回自炊").closest("details")).not.toBeNull();
  });

  it("詳細が無ければ「詳しく見る」を出さない。できた度・結果説明が無くてもプレースホルダーを出さない", () => {
    renderCard([{ ...base, result: "failed" }]);
    expect(document.querySelector("details")).toBeNull();
    expect(screen.queryByText(/できた度/)).toBeNull();
    expect(screen.queryByText(/未登録|まだありません|まだ登録されていません/)).toBeNull();
    expect(screen.getByText("うまくいかなかった")).toBeTruthy();
  });
});
