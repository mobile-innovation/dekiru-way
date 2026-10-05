import { describe, expect, it } from "vitest";
import {
  buildRoadDetailRows,
  paginateDetailRows,
  DETAIL_PAGE_SIZE,
} from "@/lib/road-detail";
import type { Branch } from "@/components/branching-paths";

const b = (over: Partial<Branch> & { id: string }): Branch => ({
  method: `方法 ${over.id}`,
  result: "ongoing",
  ...over,
});

const rowOf = (rows: ReturnType<typeof buildRoadDetailRows>, id: string) =>
  rows.find((r) => r.branch.id === id)!;

describe("buildRoadDetailRows", () => {
  it("A: state_after がある方法は、その文面を「現在」として持つ", () => {
    const rows = buildRoadDetailRows([
      b({ id: "a", stateAfter: "一人で調理できるようになった", triedAt: "2025-07-01" }),
    ]);
    expect(rowOf(rows, "a").currentState).toBe("一人で調理できるようになった");
    expect(rowOf(rows, "a").label).toBe("方法A");
  });

  it("B: state_after が無い方法は「現在」を持たない（progress を勝手にコピーしない）", () => {
    const rows = buildRoadDetailRows(
      [b({ id: "b", triedAt: "2025-07-01" })],
      "道全体のいまの状態",
    );
    // isCurrent ではないので progress 補完もされない
    expect(rowOf(rows, "b").currentState).toBeNull();
  });

  it("C: previous_attempt_id でつながる子は入れ子ラベル・depth を持ち、子の state_after が現在になる", () => {
    const rows = buildRoadDetailRows([
      b({ id: "c", triedAt: "2025-07-01" }),
      b({
        id: "c2",
        previousAttemptId: "c",
        stateAfter: "煮物も炒め物も一人で作れる",
        triedAt: "2025-08-01",
      }),
    ]);
    expect(rowOf(rows, "c").depth).toBe(0);
    expect(rowOf(rows, "c2").depth).toBe(1);
    expect(rowOf(rows, "c2").label).toBe("方法A-2");
    expect(rowOf(rows, "c").currentState).toBeNull();
    expect(rowOf(rows, "c2").currentState).toBe("煮物も炒め物も一人で作れる");
  });

  it("D: 明示された isCurrent の枝の葉に state_after が無いときだけ Road.progress で補完", () => {
    const rows = buildRoadDetailRows(
      [
        b({ id: "d", isCurrent: true, triedAt: "2025-07-01" }),
        b({ id: "d2", previousAttemptId: "d", triedAt: "2025-08-01" }),
      ],
      "ピルケース＋通知で運用中",
    );
    // 補完は葉(d2)にだけ。親(d)には出さない
    expect(rowOf(rows, "d").currentState).toBeNull();
    expect(rowOf(rows, "d2").currentState).toBe("ピルケース＋通知で運用中");
  });

  it("D-2: isCurrent の枝の葉に state_after があれば progress は使わない", () => {
    const rows = buildRoadDetailRows(
      [
        b({ id: "d", isCurrent: true, triedAt: "2025-07-01" }),
        b({
          id: "d2",
          previousAttemptId: "d",
          stateAfter: "葉の実データ",
          triedAt: "2025-08-01",
        }),
      ],
      "道全体の progress",
    );
    expect(rowOf(rows, "d2").currentState).toBe("葉の実データ");
  });

  it("E: 複数枝で、現在は方法ごとに独立する（A=現在あり / B=なし / C→C-2=現在あり）", () => {
    const rows = buildRoadDetailRows([
      b({ id: "A", stateAfter: "Aの現在", triedAt: "2025-06-01" }),
      b({ id: "B", triedAt: "2025-06-10" }),
      b({ id: "C", triedAt: "2025-06-20" }),
      b({ id: "C2", previousAttemptId: "C", stateAfter: "C-2の現在", triedAt: "2025-07-01" }),
    ]);
    expect(rowOf(rows, "A").currentState).toBe("Aの現在");
    expect(rowOf(rows, "B").currentState).toBeNull();
    expect(rowOf(rows, "C").currentState).toBeNull();
    expect(rowOf(rows, "C2").currentState).toBe("C-2の現在");
  });

  it("F: 日付が新しいだけの方法を「現在の枝」と見なさない（isCurrent 未指定なら progress は補完しない）", () => {
    const rows = buildRoadDetailRows(
      [
        b({ id: "old", triedAt: "2025-01-01" }),
        b({ id: "new", triedAt: "2025-12-31" }),
      ],
      "道全体の progress",
    );
    expect(rowOf(rows, "old").currentState).toBeNull();
    expect(rowOf(rows, "new").currentState).toBeNull();
  });

  it("G: 集合内に無い previous_attempt_id（別 Road 等）は接続せず root 扱い", () => {
    const rows = buildRoadDetailRows([
      b({ id: "x", previousAttemptId: "someone-elses-attempt", triedAt: "2025-07-01" }),
    ]);
    expect(rowOf(rows, "x").depth).toBe(0);
    expect(rowOf(rows, "x").label).toBe("方法A");
  });

  it("既存データ互換: 追加フィールドが全部 null でも行を返す", () => {
    const rows = buildRoadDetailRows([b({ id: "z", result: "failed" })]);
    expect(rows).toHaveLength(1);
    expect(rowOf(rows, "z").currentState).toBeNull();
    expect(rowOf(rows, "z").isLastRow).toBe(true);
  });
});

describe("paginateDetailRows（表示上の 10 ブロックごとのページ分割）", () => {
  const day = (n: number) => String(n).padStart(2, "0");
  const flatRows = (n: number) =>
    buildRoadDetailRows(
      Array.from({ length: n }, (_, i) =>
        b({ id: `m${i + 1}`, triedAt: `2025-01-${day(i + 1)}` }),
      ),
    );

  it("10 件 → 1 ページ（ページネーションは実質不要）", () => {
    const p = paginateDetailRows(flatRows(10), 1);
    expect(p.pageCount).toBe(1);
    expect(p.rows).toHaveLength(10);
    expect(p.continuesToNextPage).toBe(false);
  });

  it("11 件 → 2 ページ（1 ページ目 10 件 / 2 ページ目 1 件）", () => {
    const all = flatRows(11);
    const p1 = paginateDetailRows(all, 1);
    expect(p1.pageCount).toBe(2);
    expect(p1.rows).toHaveLength(10);
    expect(p1.continuesToNextPage).toBe(true);
    const p2 = paginateDetailRows(all, 2);
    expect(p2.rows).toHaveLength(1);
    expect(p2.rows[0].branch.id).toBe("m11");
    expect(p2.continuesToNextPage).toBe(false);
  });

  it("何件目を表示しているかを返す（「全11件のうち 1〜10件目」の表示用）", () => {
    const all = flatRows(11);
    expect(paginateDetailRows(all, 1)).toMatchObject({ firstNumber: 1, lastNumber: 10, total: 11 });
    expect(paginateDetailRows(all, 2)).toMatchObject({ firstNumber: 11, lastNumber: 11, total: 11 });
  });

  it("20 件 → 2 ページ（10 / 10）", () => {
    const all = flatRows(20);
    expect(paginateDetailRows(all, 1).rows).toHaveLength(10);
    expect(paginateDetailRows(all, 2).rows).toHaveLength(10);
    expect(paginateDetailRows(all, 2).pageCount).toBe(2);
  });

  it("21 件 → 3 ページ（10 / 10 / 1）", () => {
    const all = flatRows(21);
    expect(paginateDetailRows(all, 3).pageCount).toBe(3);
    expect(paginateDetailRows(all, 3).rows).toHaveLength(1);
  });

  it("範囲外のページ番号はクランプする", () => {
    const all = flatRows(11);
    expect(paginateDetailRows(all, 0).page).toBe(1);
    expect(paginateDetailRows(all, 99).page).toBe(2);
    expect(paginateDetailRows(all, -5).page).toBe(1);
  });

  it("10 件目に親、その子が 11・12 件目でも、親子は同じ（1）ページに収まる（10 で切らない）", () => {
    // 独立 root 9 個 ＋ 10 個目の root（子 2 個持ち）。行数は 12。
    const branches: Branch[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        b({ id: `r${i + 1}`, triedAt: `2025-02-${day(i + 1)}` }),
      ),
      b({ id: "r10c1", previousAttemptId: "r10", triedAt: "2025-02-20" }),
      b({ id: "r10c2", previousAttemptId: "r10", triedAt: "2025-02-21" }),
    ];
    const all = buildRoadDetailRows(branches);
    expect(all).toHaveLength(12);
    const p1 = paginateDetailRows(all, 1);
    expect(p1.pageCount).toBe(1);
    expect(p1.rows).toHaveLength(12);
    expect(p1.continuesToNextPage).toBe(false);
    const ids = p1.rows.map((r) => r.branch.id);
    expect(ids).toContain("r10");
    expect(ids).toContain("r10c1");
    expect(ids).toContain("r10c2");
  });

  it("9 件目に親、その子 2 件があっても親子は同じページ（I・I-2・I-3 が分かれない）", () => {
    const branches: Branch[] = [
      ...Array.from({ length: 9 }, (_, i) =>
        b({ id: `r${i + 1}`, triedAt: `2025-04-${day(i + 1)}` }),
      ),
      b({ id: "r9c1", previousAttemptId: "r9", triedAt: "2025-04-20" }),
      b({ id: "r9c2", previousAttemptId: "r9", triedAt: "2025-04-21" }),
    ];
    const all = buildRoadDetailRows(branches);
    const p1 = paginateDetailRows(all, 1);
    expect(p1.pageCount).toBe(1);
    expect(p1.rows.map((r) => r.branch.id)).toEqual([
      "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r9c1", "r9c2",
    ]);
  });

  it("次の独立した方法グループは次ページへ送る（2 ページ目の先頭が子にならない）", () => {
    // root 10 個 ＋ r10 の子 1 個（→ 1 ページ 11 行）＋ さらに独立 root 2 個
    const branches: Branch[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        b({ id: `r${i + 1}`, triedAt: `2025-05-${day(i + 1)}` }),
      ),
      b({ id: "r10c", previousAttemptId: "r10", triedAt: "2025-05-11" }),
      b({ id: "x1", triedAt: "2025-05-20" }),
      b({ id: "x2", triedAt: "2025-05-21" }),
    ];
    const all = buildRoadDetailRows(branches);
    const p1 = paginateDetailRows(all, 1);
    const p2 = paginateDetailRows(all, 2);
    expect(p1.pageCount).toBe(2);
    const p1ids = p1.rows.map((r) => r.branch.id);
    expect(p1ids).toContain("r10");
    expect(p1ids).toContain("r10c");
    // 2 ページ目の先頭は独立 root（previousAttemptId 無し）
    expect(p2.rows[0].branch.previousAttemptId ?? null).toBeNull();
    expect(p2.rows.map((r) => r.branch.id)).toEqual(["x1", "x2"]);
    expect(p2.continuesFromLabel).toBeNull();
  });

  it("非常に大きい枝グループは、そのグループ全体を次ページの先頭へ送る（ページが異常に長くならない）", () => {
    // 独立 root 9 個 ＋ 子 12 個を持つ大きな枝（13 行のグループ）
    const branches: Branch[] = [
      ...Array.from({ length: 9 }, (_, i) =>
        b({ id: `r${i + 1}`, triedAt: `2025-06-${day(i + 1)}` }),
      ),
      b({ id: "big", triedAt: "2025-06-10" }),
      ...Array.from({ length: 12 }, (_, i) =>
        b({ id: `big-c${i + 1}`, previousAttemptId: "big", triedAt: `2025-06-${day(11 + i)}` }),
      ),
    ];
    const all = buildRoadDetailRows(branches);
    const p1 = paginateDetailRows(all, 1);
    const p2 = paginateDetailRows(all, 2);
    expect(p1.pageCount).toBe(2);
    // 大きい枝は分割されず、1 ページに 13 行まとめて載る
    const bigPage = [p1, p2].find((pg) => pg.rows.some((r) => r.branch.id === "big"))!;
    const bigIds = bigPage.rows
      .filter((r) => r.branch.id === "big" || r.branch.id.startsWith("big-c"))
      .map((r) => r.branch.id);
    expect(bigIds).toHaveLength(13);
    // その他の独立 root は別ページ
    const otherPage = bigPage === p1 ? p2 : p1;
    expect(otherPage.rows.every((r) => r.depth === 0)).toBe(true);
  });

  it("チェーンをまたがない普通の次ページ先頭には続き表示を付けない", () => {
    const all = flatRows(12); // すべて独立 root
    const p2 = paginateDetailRows(all, 2);
    expect(p2.rows[0].branch.id).toBe("m11");
    expect(p2.continuesFromLabel).toBeNull();
  });

  it("ページを変えても現在・できた％・気持ち・次に試すことは各行に残る", () => {
    const branches = Array.from({ length: 12 }, (_, i) =>
      b({
        id: `m${i + 1}`,
        triedAt: `2025-03-${day(i + 1)}`,
        stateAfter: `m${i + 1} の現在`,
        achievementPercent: 40 + i,
        feeling: `m${i + 1} の気持ち`,
        nextAction: `m${i + 1} の次`,
      }),
    );
    const all = buildRoadDetailRows(branches);
    const p2 = paginateDetailRows(all, 2);
    const r11 = p2.rows.find((r) => r.branch.id === "m11")!;
    expect(r11.currentState).toBe("m11 の現在");
    expect(r11.branch.achievementPercent).toBe(50);
    expect(r11.branch.feeling).toBe("m11 の気持ち");
    expect(r11.branch.nextAction).toBe("m11 の次");
  });

  it("DETAIL_PAGE_SIZE は 10", () => {
    expect(DETAIL_PAGE_SIZE).toBe(10);
  });
});
