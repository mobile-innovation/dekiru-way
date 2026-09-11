import { describe, it, expect } from "vitest";
import {
  coerceResult,
  generateSeedDrafts,
  isConcreteDifficulty,
  localStubDrafts,
  meaningTokens,
  nearDuplicate,
  normalizeDrafts,
  parseSeedThemes,
  seedDomainKey,
} from "@/lib/ai/seed-data";
import { ATTEMPT_RESULTS } from "@/lib/constants";

describe("coerceResult", () => {
  it("5 分類はそのまま通す", () => {
    for (const r of ATTEMPT_RESULTS) expect(coerceResult(r)).toBe(r);
  });

  it("5 分類以外は ongoing に寄せる", () => {
    expect(coerceResult("banana")).toBe("ongoing");
    expect(coerceResult(null)).toBe("ongoing");
    expect(coerceResult(42)).toBe("ongoing");
    expect(coerceResult("")).toBe("ongoing");
  });

  it("日本語の言い回しはゆるく対応する", () => {
    expect(coerceResult("できるようになった")).toBe("success");
    expect(coerceResult("少しできた")).toBe("partial");
    expect(coerceResult("変化なし")).toBe("no_change");
    expect(coerceResult("うまくいかなかった")).toBe("failed");
  });
});

describe("isConcreteDifficulty", () => {
  const KW = "料理を作る";

  it("具体的な行動が難しい形は OK", () => {
    expect(isConcreteDifficulty("包丁で食材を切るのが難しい", KW)).toBe(true);
    expect(isConcreteDifficulty("立ったまま料理を続けるのが難しい", KW)).toBe(true);
    expect(isConcreteDifficulty("靴下を一人で履くのが難しい", "靴下が履きにくい")).toBe(true);
  });

  it("入力キーワードそのままは NG", () => {
    expect(isConcreteDifficulty("料理を作る", KW)).toBe(false);
    expect(isConcreteDifficulty("料理を作る（サンプル1）", KW)).toBe(false);
    expect(isConcreteDifficulty("料理を作る について", KW)).toBe(false);
  });

  it("抽象的なテーマ・カテゴリだけは NG", () => {
    for (const bad of ["料理", "外出", "歩く", "生活", "家事"]) {
      expect(isConcreteDifficulty(bad, bad)).toBe(false);
    }
  });

  it("困りごとの語がなく「困っている」だけの文は NG", () => {
    expect(isConcreteDifficulty("料理について困っている", KW)).toBe(false);
  });

  it("「サンプル1」等の連番は NG", () => {
    expect(isConcreteDifficulty("包丁を使うのが難しい（サンプル3）", KW)).toBe(false);
    expect(isConcreteDifficulty("テスト2 の困りごと", KW)).toBe(false);
  });

  it("空・短すぎる文字列は NG", () => {
    expect(isConcreteDifficulty("", KW)).toBe(false);
    expect(isConcreteDifficulty(null, KW)).toBe(false);
    expect(isConcreteDifficulty("難しい", KW)).toBe(false);
  });
});

describe("isConcreteDifficulty × キーワードを文へ無理やり差し込む形（キーワード変換ルール修正指示書）", () => {
  it("「キーワード」で、〜 の形は NG", () => {
    expect(isConcreteDifficulty("「手芸」で、細かい手先の作業を正確に行うのが難しい", "手芸")).toBe(false);
    expect(isConcreteDifficulty("「料理を作る」で、料理を作ることが難しい", "料理を作る")).toBe(false);
    expect(isConcreteDifficulty("『デスクワーク』で、長時間座るのが難しい", "デスクワーク")).toBe(false);
  });

  it("キーワードを動作の主語にしてそのまま「〜が難しい」に流し込む形は NG", () => {
    expect(isConcreteDifficulty("手芸することが難しい", "手芸")).toBe(false);
    expect(isConcreteDifficulty("手芸ができなくて困っている", "手芸")).toBe(false);
    expect(isConcreteDifficulty("デスクワークをすることが難しい", "デスクワーク")).toBe(false);
  });

  it("キーワードを文中に含まない自然な言い方は OK（指示書6：含める必要はない）", () => {
    expect(isConcreteDifficulty("細かい手作業が難しく、作業に時間がかかる", "手芸")).toBe(true);
    expect(isConcreteDifficulty("指先が思うように動かず、細かな作業が難しい", "手芸")).toBe(true);
    expect(isConcreteDifficulty("長時間座った姿勢を続けることが難しい", "デスクワーク")).toBe(true);
  });
});

describe("isConcreteDifficulty × 物・道具・設備はキーワードを主語にしてよい（「困ったこと」生成ルール修正指示書）", () => {
  it("「キーワードが使いにくい」等はそのまま OK", () => {
    expect(isConcreteDifficulty("爪切りが使いにくい", "爪切り")).toBe(true);
    expect(isConcreteDifficulty("箸を持ちにくい", "箸")).toBe(true);
    expect(isConcreteDifficulty("リモコンのボタンを押しにくい", "リモコン")).toBe(true);
    expect(isConcreteDifficulty("ハサミを握って開閉しにくい", "ハサミ")).toBe(true);
    expect(isConcreteDifficulty("ドアノブを握って回すのが難しい", "ドアノブ")).toBe(true);
    expect(isConcreteDifficulty("階段の上り下りが難しい", "階段")).toBe(true);
  });

  it("それでも「「キーワード」で、〜」のかっこ書き差し込みは NG のまま", () => {
    expect(isConcreteDifficulty("「爪切り」で、使いにくい", "爪切り")).toBe(false);
  });
});

describe("isConcreteDifficulty × 「ボタン」（キーワード理解・関連性を厳密化する修正指示）", () => {
  it("キーワードから直接言える操作（押す/つまむ/留める/操作する）を含む OK 例は、キーワードを含んでいる、というだけで不合格にしない", () => {
    // 指示書 15: 「キーワードが文章に含まれている」だけを理由に不合格にしてはいけない。
    expect(isConcreteDifficulty("ボタンを押す操作がしにくい", "ボタン")).toBe(true);
    expect(isConcreteDifficulty("小さなボタンを指先で操作しにくい", "ボタン")).toBe(true);
    expect(isConcreteDifficulty("ボタンをつまんで留めるのが難しい", "ボタン")).toBe(true);
    expect(isConcreteDifficulty("ボタンをつまんで操作するのが難しい", "ボタン")).toBe(true);
  });

  it("鍵（D の新しい例示語）も同じ扱いになる", () => {
    expect(isConcreteDifficulty("鍵を差し込んで回すのが難しい", "鍵")).toBe(true);
    expect(isConcreteDifficulty("鍵を持ちにくい", "鍵")).toBe(true);
  });

  it("「「ボタン」で、〜」「ボタンをすることが難しい」のような機械的差し込みは引き続き NG", () => {
    expect(isConcreteDifficulty("「ボタン」で、操作しにくい", "ボタン")).toBe(false);
    expect(isConcreteDifficulty("ボタンをすることが難しい", "ボタン")).toBe(false);
  });

  it("既知の限界: 意味的にキーワードから飛躍した創作（想像による文脈追加）は、コード側の検証だけでは検出できない", () => {
    // 「一度手を止めると、どこまで進めたか分からなくなって再開が難しい」は「ボタン」から
    // 根拠なく創作された別の文脈（キーワード理解・関連性を厳密化する修正指示 18）だが、
    // 形式面（連番でない・キーワードの機械的差し込みでない・「難しい」を含む）は満たしてしまうため、
    // isConcreteDifficulty だけでは弾けない。この種の意味的な関連性は SEED_SYSTEM_PROMPT
    // （AI 生成時のプロンプト）側で防ぐ役割分担であり、コード側は形式面の最終防御に徹する。
    expect(isConcreteDifficulty("一度手を止めると、どこまで進めたか分からなくなって再開が難しい", "ボタン")).toBe(
      true,
    );
  });
});

describe("parseSeedThemes（スペース区切り＝複数テーマ）", () => {
  it("半角スペースで複数テーマに分ける", () => {
    expect(parseSeedThemes("料理 掃除")).toEqual(["料理", "掃除"]);
  });
  it("全角スペース・タブ・連続スペースも区切りにする", () => {
    expect(parseSeedThemes("料理　掃除")).toEqual(["料理", "掃除"]);
    expect(parseSeedThemes("料理  \t 掃除 洗濯")).toEqual(["料理", "掃除", "洗濯"]);
  });
  it("単一テーマは 1 要素、前後の空白は落とす", () => {
    expect(parseSeedThemes("  料理を作る  ")).toEqual(["料理を作る"]);
  });
  it("同じテーマは重複排除する", () => {
    expect(parseSeedThemes("料理 料理 掃除")).toEqual(["料理", "掃除"]);
  });
});

describe("localStubDrafts × 複数テーマ", () => {
  it("スペース区切りのテーマを件ごとに割り当てる（situation に全テーマが現れる）", () => {
    const drafts = localStubDrafts("料理 掃除", 10);
    expect(drafts).toHaveLength(10);
    const sit = drafts.map((d) => d.situation ?? "");
    expect(sit.some((s) => s.includes("「料理」"))).toBe(true);
    expect(sit.some((s) => s.includes("「掃除」"))).toBe(true);
    // 困りごとは依然として 10 件それぞれ具体的
    for (const d of drafts) expect(isConcreteDifficulty(d.difficulty, "料理 掃除")).toBe(true);
    expect(new Set(drafts.map((d) => d.difficulty)).size).toBe(10);
  });

  it("テーマ配列でも文字列でも受け付ける", () => {
    const a = localStubDrafts(["料理", "掃除"], 4);
    const b = localStubDrafts("料理 掃除", 4);
    expect(a.map((d) => d.situation)).toEqual(b.map((d) => d.situation));
  });
});

describe("isConcreteDifficulty × 複数テーマ", () => {
  it("スペース区切りの各テーマそのままは NG", () => {
    expect(isConcreteDifficulty("掃除", "料理 掃除")).toBe(false);
    expect(isConcreteDifficulty("料理", "料理 掃除")).toBe(false);
  });
  it("いずれかのテーマについて具体的なら OK", () => {
    expect(isConcreteDifficulty("床にかがんで拭き掃除をするのが難しい", "料理 掃除")).toBe(true);
  });
});

describe("localStubDrafts（テーマ → 具体的な困りごとへ分解）", () => {
  const KW = "料理を作る";

  it("difficulty が入力キーワードそのままにならない", () => {
    for (const d of localStubDrafts(KW, 10)) {
      expect(d.difficulty).not.toBe(KW);
      expect(d.difficulty ?? "").not.toContain(KW);
    }
  });

  it("difficulty が「料理を作る（サンプル1）」のような連番にならない", () => {
    for (const d of localStubDrafts(KW, 10)) {
      expect(d.difficulty ?? "").not.toMatch(/(サンプル|テスト|例)\s*[0-9０-９]+/);
    }
  });

  it("すべての difficulty が具体的な困りごとになっている", () => {
    for (const d of localStubDrafts(KW, 20)) {
      expect(isConcreteDifficulty(d.difficulty, KW)).toBe(true);
    }
  });

  it("10 件の difficulty / method が十分に異なる", () => {
    const drafts = localStubDrafts(KW, 10);
    expect(new Set(drafts.map((d) => d.difficulty)).size).toBe(10);
    expect(new Set(drafts.map((d) => d.method)).size).toBe(10);
  });

  it("result は必ず 5 分類のいずれかで、複数種類が出る", () => {
    const drafts = localStubDrafts("外出", 12);
    for (const d of drafts) expect(ATTEMPT_RESULTS).toContain(d.result);
    expect(new Set(drafts.map((d) => d.result)).size).toBeGreaterThan(1);
  });

  it("テーマは situation に引用の形で残る（検索でたどれるように）", () => {
    for (const d of localStubDrafts(KW, 5)) {
      expect(d.situation ?? "").toContain(KW);
    }
  });

  it("架空の人物（名前・年齢・肩書き）を作らない", () => {
    const blob = JSON.stringify(localStubDrafts("料理を作る", 20));
    expect(blob).not.toMatch(/\d+\s*歳/);
    expect(blob).not.toMatch(/(会社員|主婦|さんは|君は)/);
  });

  it("goal がテーマの繰り返しにならない", () => {
    for (const d of localStubDrafts(KW, 10)) {
      expect(d.goal).not.toBe(KW);
    }
  });
});

describe("localStubDrafts × 分野の無いテーマ（キーワード変換ルール修正指示書）", () => {
  it("「手芸」のように分野が無い活動テーマでも、difficulty にキーワードを差し込まない", () => {
    const drafts = localStubDrafts("手芸", 10);
    expect(drafts).toHaveLength(10);
    for (const d of drafts) {
      expect(d.difficulty ?? "").not.toMatch(/^[「『]\s*手芸\s*[」』]/);
      expect(d.difficulty ?? "").not.toContain("手芸");
      expect(isConcreteDifficulty(d.difficulty, "手芸")).toBe(true);
    }
    // テーマとのつながりは situation 側で保つ
    expect(drafts.every((d) => (d.situation ?? "").includes("「手芸」"))).toBe(true);
  });
});

describe("localStubDrafts: 特定単語リストによる「物か」判定をしない（AI生成「物・道具」判定ロジックの修正指示書）", () => {
  it("以前コードに登録していた道具名（爪切り）も、登録したことのない道具名も、スタブでは同じ扱いになる", () => {
    // 特定の単語をコードへ登録して「これは物」と判定する実装は行わない。
    // その結果として、既知/未知どちらの道具名でも同じ汎用プール（NEUTRAL_ASPECTS）から生成される
    // ＝「爪切りだから」という特別扱いが存在しないことの確認。
    const a = localStubDrafts("爪切り", 5).map((d) => d.difficulty);
    const b = localStubDrafts("ホッチキス", 5).map((d) => d.difficulty);
    const c = localStubDrafts("耳かき", 5).map((d) => d.difficulty);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
    for (const d of [...a, ...b, ...c]) {
      expect(d).not.toContain("爪切り");
      expect(d).not.toContain("ホッチキス");
      expect(d).not.toContain("耳かき");
    }
  });

  it.each(["ホッチキス", "耳かき", "電気ケトル", "ファスナー", "杖", "電動歯ブラシ"])(
    "事前登録のない道具名「%s」でも、具体的な困りごととして成立する（汎用プールへフォールバック）",
    (kw) => {
      const drafts = localStubDrafts(kw, 5);
      expect(drafts).toHaveLength(5);
      for (const d of drafts) expect(isConcreteDifficulty(d.difficulty, kw)).toBe(true);
    },
  );

  it.each(["園芸", "読書", "料理を作る", "掃除", "洗濯", "階段", "ドアノブ", "浴槽"])(
    "活動・行動・設備のキーワード「%s」も引き続き自然な困りごとになる（既存の分野判定は維持）",
    (kw) => {
      const drafts = localStubDrafts(kw, 5);
      for (const d of drafts) expect(isConcreteDifficulty(d.difficulty, kw)).toBe(true);
    },
  );

  it("根拠のない身体症状（震え・麻痺など）は、未知のキーワードでも付け加えない", () => {
    const blob = JSON.stringify([
      ...localStubDrafts("ホッチキス", 5),
      ...localStubDrafts("電気ケトル", 5),
      ...localStubDrafts("耳かき", 5),
    ]);
    expect(blob).not.toMatch(/(震え|麻痺|筋力低下)/);
  });
});

describe("normalizeDrafts: 事前登録の無い道具キーワードでも AI 出力をそのまま検証できる（分類はコード側で行わない）", () => {
  // isConcreteDifficulty / normalizeDrafts はどの関数も特定の道具名リストを参照しない。
  // 「AI が意味を理解して出した」想定の difficulty を、コード側の辞書に登録せずそのまま受け入れられることを確認する。
  it.each([
    ["ホッチキス", "ホッチキスの針を入れ替えるのが難しい"],
    ["耳かき", "耳かきを持って細かく動かすのが難しい"],
    ["電気ケトル", "電気ケトルの蓋を開けるのが難しい"],
    ["ファスナー", "ファスナーの引き手をつまんで動かすのが難しい"],
    ["杖", "杖を握って体重をかけるのが難しい"],
    ["電動歯ブラシ", "電動歯ブラシのスイッチを押しにくい"],
    // 「キーワード理解・関連性を厳密化する修正指示」の最終テスト対象語
    ["ボタン", "ボタンを押す操作がしにくい"],
    ["鍵", "鍵を差し込んで回すのが難しい"],
    ["リモコン", "リモコンのボタンを押しにくい"],
  ])("キーワード「%s」の AI 出力例をコード側の辞書登録なしで受け入れる", (keyword, difficulty) => {
    const out = normalizeDrafts(
      [{ difficulty, method: "持ちやすい形に替えて練習した", result: "partial" }],
      keyword,
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].difficulty).toBe(difficulty);
  });
});

describe("テーマ逸脱防止（生成ルール修正指示書2）", () => {
  it("seedDomainKey: テーマ文字列と、その分野の困りごと語を拾う", () => {
    expect(seedDomainKey("デスクワーク　PC")).toBe("deskwork");
    expect(seedDomainKey("キーボードで文字を入力するのが難しい")).toBe("deskwork");
    expect(seedDomainKey("料理を作る")).toBe("cooking");
    expect(seedDomainKey("包丁で食材を切るのが難しい")).toBe("cooking");
    expect(seedDomainKey("外出")).toBe("outing");
    expect(seedDomainKey("階段を上るのが難しい")).toBe("outing");
    expect(seedDomainKey("盆栽の手入れ")).toBeNull();
  });

  // ケース1: デスクワーク PC
  it("「デスクワーク PC」→ PC の困りごとになり、料理・外出へ逸脱しない", () => {
    const drafts = localStubDrafts("デスクワーク PC", 10);
    expect(drafts).toHaveLength(10);
    for (const d of drafts) {
      const dom = seedDomainKey(d.difficulty ?? "");
      expect(dom === "deskwork" || dom === null).toBe(true);
      expect(dom).not.toBe("cooking");
      expect(dom).not.toBe("outing");
      expect(isConcreteDifficulty(d.difficulty, "デスクワーク PC")).toBe(true);
    }
    const blob = drafts.map((d) => d.difficulty).join("\n");
    expect(blob).toMatch(/(キーボード|マウス|画面|クリック)/);
    expect(blob).not.toMatch(/(包丁|階段|靴)/);
  });

  // ケース2: 料理を作る
  it("「料理を作る」→ 料理の困りごとになり、PC・階段へ逸脱しない", () => {
    const blob = localStubDrafts("料理を作る", 10)
      .map((d) => d.difficulty)
      .join("\n");
    expect(blob).toMatch(/(包丁|鍋|フライパン|調味料|コンロ|食器)/);
    expect(blob).not.toMatch(/(キーボード|マウス|階段|公共交通)/);
  });

  // ケース3: 外出
  it("「外出」→ 外出の困りごとになり、包丁・キーボードへ逸脱しない", () => {
    const blob = localStubDrafts("外出", 10)
      .map((d) => d.difficulty)
      .join("\n");
    expect(blob).toMatch(/(靴|歩|階段|段差|交通機関|荷物|道順)/);
    expect(blob).not.toMatch(/(包丁|キーボード|マウス)/);
  });

  it("normalizeDrafts: テーマと別分野の困りごと（AI逸脱）は捨てる", () => {
    const out = normalizeDrafts(
      [
        { difficulty: "キーボードで文字を入力するのが難しい", method: "キーを大きくした", result: "partial" },
        { difficulty: "包丁で食材を切るのが難しい", method: "まな板を替えた", result: "success" }, // 逸脱
        { difficulty: "階段を上り下りするのがこわい", method: "手すりを使った", result: "ongoing" }, // 逸脱
        { difficulty: "マウスを細かく操作するのが難しい", method: "感度を下げた", result: "partial" },
      ],
      "デスクワーク PC",
      10,
    );
    expect(out.map((d) => d.difficulty)).toEqual([
      "キーボードで文字を入力するのが難しい",
      "マウスを細かく操作するのが難しい",
    ]);
  });

  it("normalizeDrafts: テーマに分野が無いときは逸脱チェックをしない（落としすぎない）", () => {
    const out = normalizeDrafts(
      [
        { difficulty: "盆栽の枝を細かく切るのが難しい", method: "小さいはさみを使った", result: "partial" },
        { difficulty: "土を運ぶのが難しい", method: "小分けにした", result: "ongoing" },
      ],
      "盆栽",
      10,
    );
    expect(out).toHaveLength(2);
  });
});

describe("normalizeDrafts", () => {
  const KW = "料理を作る";

  it("壊れた入力でも throw せず配列を返す", () => {
    expect(normalizeDrafts("ゴミ", KW, 10)).toEqual([]);
    expect(normalizeDrafts(null, KW, 10)).toEqual([]);
    expect(normalizeDrafts(undefined, KW, 10)).toEqual([]);
    expect(normalizeDrafts(123, KW, 10)).toEqual([]);
    expect(normalizeDrafts([{}, { method: "" }, "x", 5], KW, 10)).toEqual([]);
  });

  it("difficulty が具体的でない要素は捨てる", () => {
    const out = normalizeDrafts(
      [
        { difficulty: "料理を作る", method: "何かする", result: "success" }, // キーワードそのまま
        { difficulty: "料理", method: "別のこと", result: "success" }, // テーマだけ
        { difficulty: "包丁で野菜を切るのが難しい", method: "座って切る", result: "partial" }, // OK
      ],
      KW,
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].difficulty).toBe("包丁で野菜を切るのが難しい");
  });

  it("AI が「キーワードを文へ差し込んだだけ」の候補を返しても捨てる（キーワード変換ルール修正指示書）", () => {
    const out = normalizeDrafts(
      [
        { difficulty: "「料理を作る」で、料理を作ることが難しい", method: "何かする", result: "success" },
        { difficulty: "料理を作ることが難しい", method: "別の何か", result: "success" },
        { difficulty: "包丁や調理器具を扱う細かい作業が難しい", method: "座って切る", result: "partial" }, // OK
      ],
      KW,
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].difficulty).toBe("包丁や調理器具を扱う細かい作業が難しい");
  });

  it("method が空/欠落の要素は捨てる", () => {
    const out = normalizeDrafts(
      [
        { difficulty: "立って作業を続けるのが難しい", method: "椅子に座る", result: "partial" },
        { difficulty: "ふたを開けるのが難しい", result: "success" },
        { difficulty: "字が見えにくく作業が難しい", method: "   " },
      ],
      KW,
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].method).toBe("椅子に座る");
  });

  it("result が 5 分類以外なら ongoing に矯正する", () => {
    const out = normalizeDrafts(
      [{ difficulty: "包丁を使うのが難しい", method: "何かする", result: "amazing" }],
      KW,
      10,
    );
    expect(out[0].result).toBe("ongoing");
  });

  it("method / difficulty が完全一致する要素は重複排除する", () => {
    const out = normalizeDrafts(
      [
        { difficulty: "包丁を使うのが難しい", method: "同じ方法", result: "success" },
        { difficulty: "別の作業が難しい", method: "同じ方法", result: "failed" }, // method 重複
        { difficulty: "包丁を使うのが難しい", method: "別の方法", result: "ongoing" }, // difficulty 重複
        { difficulty: "立ち続けるのが難しい", method: "また別の方法", result: "partial" },
      ],
      KW,
      10,
    );
    expect(out).toHaveLength(2);
  });

  it("count 件で打ち切る", () => {
    const difficulties = [
      "包丁で野菜を薄く切るのが難しい",
      "鍋のふたを持ち上げるのが難しい",
      "菜箸で小さな食材をつまむのが難しい",
      "計量カップの目盛りを読み取るのが難しい",
      "コンロの火をつけるのが難しい",
      "重い土鍋を流しまで運ぶのが難しい",
      "立ったまま炒めものを続けるのがつらい",
      "熱いフライパンを傾けて盛りつけるのがこわい",
      "洗った食器を高い棚に戻すのが難しい",
      "レシピの手順を覚えておくのが難しい",
      "水切りかごから食器を取り出すのが難しい",
      "野菜の皮を薄くむくのが難しい",
    ];
    const methods = [
      "道具を見直した", "姿勢を見直した", "手順を見直した", "環境を見直した",
      "配置を見直した", "時間帯を見直した", "力の入れ方を見直した", "分担を見直した",
      "休憩の取り方を見直した", "代わりの手段を試した", "照明を見直した", "動線を見直した",
    ];
    const raw = difficulties.map((difficulty, i) => ({
      difficulty,
      method: methods[i],
      result: "ongoing",
    }));
    expect(normalizeDrafts(raw, KW, 10)).toHaveLength(10);
  });

  it("長すぎる文字列はクランプする", () => {
    const long = "あ".repeat(5000);
    const out = normalizeDrafts(
      [{ difficulty: `包丁を使うのが難しい${long}`, method: long, result: "success" }],
      KW,
      10,
    );
    expect(out[0].method.length).toBeLessThanOrEqual(2000);
    expect((out[0].difficulty ?? "").length).toBeLessThanOrEqual(2000);
  });

  it("不正な日付は null にする", () => {
    const out = normalizeDrafts(
      [
        {
          difficulty: "包丁を使うのが難しい",
          method: "x",
          result: "success",
          triedAt: "きのう",
          startedAt: "2025-13-40",
        },
      ],
      KW,
      10,
    );
    expect(out[0].triedAt).toBeNull();
    expect(out[0].startedAt).toBeNull();
  });
});

describe("毎回結果を変える・重複を避ける（追加指示書）", () => {
  describe("nearDuplicate / meaningTokens", () => {
    it("言い換えを同じ内容と判定する（方法）", () => {
      expect(nearDuplicate("軽いマウスに変える", "軽量マウスに変更する")).toBe(true);
      expect(nearDuplicate("マウスを軽いものにする", "軽いマウスを使う")).toBe(true);
      expect(nearDuplicate("こまめに休憩する", "一定時間ごとに休憩する")).toBe(true);
      expect(nearDuplicate("休憩を増やす", "こまめに休憩する")).toBe(true);
    });
    it("別の内容は別と判定する", () => {
      expect(nearDuplicate("キーボードで入力するのが難しい", "画面の文字が読みにくい")).toBe(false);
      expect(
        nearDuplicate("包丁で野菜を切るのが難しい", "立ったまま料理を続けるのが難しい"),
      ).toBe(false);
    });
    it("空文字は完全一致のときだけ true", () => {
      expect(nearDuplicate("", "")).toBe(true);
      expect(nearDuplicate("", "何か")).toBe(false);
    });
    it("meaningTokens は同義語をまとめる", () => {
      expect([...meaningTokens("軽量マウスに変更する")].sort()).toEqual(
        [...meaningTokens("マウスを軽いものに変える")].sort(),
      );
    });
  });

  describe("localStubDrafts: 生成のたびに違う切り口（offset ローテーション）", () => {
    const KW = "デスクワーク PC"; // 分野あり → プール 32（3 周ぶん）

    it("offset をずらすと困りごとが重ならない（3 回ぶん）", () => {
      const r1 = localStubDrafts(KW, 10, { offset: 0 });
      const r2 = localStubDrafts(KW, 10, { offset: 10 });
      const r3 = localStubDrafts(KW, 10, { offset: 20 });
      const d1 = new Set(r1.map((d) => d.difficulty));
      const d2 = new Set(r2.map((d) => d.difficulty));
      const d3 = new Set(r3.map((d) => d.difficulty));
      expect(d1.size).toBe(10);
      expect([...d1].filter((x) => d2.has(x))).toHaveLength(0);
      expect([...d1].filter((x) => d3.has(x))).toHaveLength(0);
      expect([...d2].filter((x) => d3.has(x))).toHaveLength(0);
    });

    it("existing に渡した困りごと・方法は出さない", () => {
      const first = localStubDrafts(KW, 10, { offset: 0 });
      const second = localStubDrafts(KW, 10, {
        offset: 10,
        existing: first.map((d) => ({ difficulty: d.difficulty, method: d.method })),
      });
      const firstD = new Set(first.map((d) => d.difficulty));
      for (const d of second) {
        expect(firstD.has(d.difficulty)).toBe(false);
        expect(
          first.some((f) => nearDuplicate(f.difficulty, d.difficulty) || nearDuplicate(f.method, d.method)),
        ).toBe(false);
      }
    });
  });

  describe("normalizeDrafts: 過去データ・10件内の重複を捨てる", () => {
    it("過去データと実質的に重複する候補は捨てる", () => {
      const out = normalizeDrafts(
        [
          { difficulty: "画面の小さな文字を読み続けるのが難しい", method: "文字を大きくした", result: "partial" },
          { difficulty: "マウス操作を長く続けると手が疲れる", method: "軽いマウスに変える", result: "success" },
        ],
        "デスクワーク PC",
        10,
        {
          existing: [
            { difficulty: "マウス操作を長く続けると手が疲れる", method: "軽量マウスに変更する", result: "success" },
          ],
        },
      );
      expect(out.map((d) => d.difficulty)).toEqual(["画面の小さな文字を読み続けるのが難しい"]);
    });

    it("今回の候補どうしの言い換え重複は 1 件だけ残す", () => {
      const out = normalizeDrafts(
        [
          { difficulty: "マウスが重くて動かしにくい", method: "軽いマウスに変える", result: "success" },
          { difficulty: "マウスが重くて動かしづらい", method: "軽量マウスに変更する", result: "partial" },
          { difficulty: "マウスが重くて操作しにくい", method: "マウスを軽いものにする", result: "ongoing" },
        ],
        "デスクワーク PC",
        10,
      );
      expect(out).toHaveLength(1);
    });
  });

  describe("generateSeedDrafts: 同じテーマでも生成のたびに変わる（スタブ）", () => {
    it("1回目と2回目で実質的に同じ10件を返さない", async () => {
      const run1 = await generateSeedDrafts("デスクワーク PC", 10);
      const run2 = await generateSeedDrafts("デスクワーク PC", 10, {
        existing: run1.map((d) => ({ difficulty: d.difficulty, method: d.method, result: d.result })),
      });
      const d1 = run1.map((d) => d.difficulty);
      const d2 = run2.map((d) => d.difficulty);
      expect(new Set([...d1, ...d2]).size).toBe(20); // 完全に別
      for (const b of d2) {
        expect(d1.some((a) => nearDuplicate(a, b))).toBe(false);
      }
    });
  });
});
