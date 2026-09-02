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

  it("親子チェーンがページ境界をまたぐと、次ページ先頭に親ラベルの続き表示が付く", () => {
    // 方法A..方法J（10 root）＋ 方法J の子 方法J-2（11 行目）。境界は 10/11 の間。
    const branches: Branch[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        b({ id: `r${i + 1}`, triedAt: `2025-02-${day(i + 1)}` }),
      ),
      b({ id: "r10child", previousAttemptId: "r10", triedAt: "2025-02-20" }),
    ];
    const all = buildRoadDetailRows(branches);
    expect(all).toHaveLength(11);
    const p2 = paginateDetailRows(all, 2);
    expect(p2.rows[0].branch.id).toBe("r10child");
    expect(p2.continuesFromLabel).toBe("方法J"); // 10 番目の root ラベル
    // 親子関係・入れ子ラベルは分割しても保持
    expect(p2.rows[0].label).toBe("方法J-2");
    expect(p2.rows[0].depth).toBe(1);
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
