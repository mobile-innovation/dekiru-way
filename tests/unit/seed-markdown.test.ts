import { describe, it, expect } from "vitest";
import { parseSeedMarkdown } from "@/lib/admin/seed-markdown";

function road(n: number, attempts: string): string {
  return `# 道${n}

## 困っていたこと
困っていたこと${n}

## 以前できていたこと
以前できていたこと${n}

## 目標
目標${n}

## 状況
状況${n}

${attempts}

## 現在の状態
現在の状態${n}

## 次に試したいこと
次に試したいこと${n}
`;
}

function attempt(n: number, result: string): string {
  return `## 試したこと${n}

### 方法
方法${n}

### 試した理由
理由${n}

### 結果
${result}

### 結果の詳細
詳細${n}

### 次につながったこと
次につながったこと${n}
`;
}

describe("parseSeedMarkdown", () => {
  it("1 Road + 1 Attempt を解析できる", () => {
    const md = road(1, attempt(1, "success"));
    const { roads, errors } = parseSeedMarkdown(md);
    expect(errors).toEqual([]);
    expect(roads).toHaveLength(1);
    const r = roads[0];
    expect(r.title).toBe("道1");
    expect(r.difficulty).toBe("困っていたこと1");
    expect(r.previouslyAble).toBe("以前できていたこと1");
    expect(r.goal).toBe("目標1");
    expect(r.situation).toBe("状況1");
    expect(r.status).toBe("現在の状態1");
    expect(r.nextAction).toBe("次に試したいこと1");
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0].method).toBe("方法1");
    expect(r.attempts[0].result).toBe("success");
    expect(r.attempts[0].attemptMemo).toContain("詳細1");
    expect(r.attempts[0].attemptMemo).toContain("試した理由：理由1");
    expect(r.attempts[0].attemptMemo).toContain("次につながったこと：次につながったこと1");
  });

  it("1 Road + 3 Attempts を、Markdown の順番のまま解析できる", () => {
    const md = road(1, [attempt(1, "failed"), attempt(2, "partial"), attempt(3, "success")].join("\n"));
    const { roads, errors } = parseSeedMarkdown(md);
    expect(errors).toEqual([]);
    expect(roads[0].attempts.map((a) => a.method)).toEqual(["方法1", "方法2", "方法3"]);
    expect(roads[0].attempts.map((a) => a.result)).toEqual(["failed", "partial", "success"]);
  });

  it("1 Road + 6 Attempts を解析できる", () => {
    const attempts = Array.from({ length: 6 }, (_, i) => attempt(i + 1, "ongoing")).join("\n");
    const md = road(1, attempts);
    const { roads, errors } = parseSeedMarkdown(md);
    expect(errors).toEqual([]);
    expect(roads[0].attempts).toHaveLength(6);
  });

  it("道が複数あるMarkdownはエラーになる（1回の取り込みは道1件まで）", () => {
    const md = [
      road(1, attempt(1, "success")),
      road(2, [attempt(1, "failed"), attempt(2, "partial")].join("\n")),
      road(3, attempt(1, "no_change")),
    ].join("\n");
    const { roads, errors } = parseSeedMarkdown(md);
    expect(roads).toEqual([]);
    expect(errors.some((e) => e.includes("道は1件までです"))).toBe(true);
  });

  it("結果5分類すべてを認識する", () => {
    const results = ["success", "partial", "no_change", "failed", "ongoing"];
    const attempts = results.map((r, i) => attempt(i + 1, r)).join("\n");
    const md = road(1, attempts);
    const { roads, errors } = parseSeedMarkdown(md);
    expect(errors).toEqual([]);
    expect(roads[0].attempts.map((a) => a.result)).toEqual(results);
  });

  it("不正な結果はエラーになり、その Attempt は保存対象に含めない", () => {
    const md = road(1, attempt(1, "great"));
    const { roads, errors } = parseSeedMarkdown(md);
    expect(errors.some((e) => e.includes('結果「great」は対応していません'))).toBe(true);
    expect(roads[0].attempts).toHaveLength(0);
  });

  it("「方法」が無い試したことはエラーになる", () => {
    const md = `# 道1

## 困っていたこと
困っていたこと1

## 試したこと1

### 結果
success
`;
    const { errors } = parseSeedMarkdown(md);
    expect(errors.some((e) => e.includes("「方法」がありません"))).toBe(true);
  });

  it("「困っていたこと」が無い道はエラーになる", () => {
    const md = road(1, attempt(1, "success")).replace(/## 困っていたこと\n困っていたこと1\n\n/, "");
    const { errors } = parseSeedMarkdown(md);
    expect(errors.some((e) => e.includes("「困っていたこと」がありません"))).toBe(true);
  });

  it("試したことが1件も無い道はエラーになる", () => {
    const md = `# 道1

## 困っていたこと
困っていたこと1
`;
    const { errors } = parseSeedMarkdown(md);
    expect(errors.some((e) => e.includes("「試したこと」がありません"))).toBe(true);
  });

  it("空の Markdown はエラーになる", () => {
    const { roads, errors } = parseSeedMarkdown("");
    expect(roads).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("道の見出しが1つも無い Markdown はエラーになる", () => {
    const { roads, errors } = parseSeedMarkdown("## 困っていたこと\n困っていた\n");
    expect(roads).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("想定外の見出しはエラーとして報告する（無視して通さない）", () => {
    const md = `# 道1

## 困っていたこと
困っていたこと1

## 知らない見出し
本文

## 試したこと1

### 方法
方法1

### 知らない項目
本文

### 結果
success
`;
    const { errors } = parseSeedMarkdown(md);
    expect(errors.some((e) => e.includes("知らない見出し"))).toBe(true);
    expect(errors.some((e) => e.includes("知らない項目"))).toBe(true);
  });

  it("見出しの番号・空白のゆれを許容する（「試したこと 2」など）", () => {
    const md = `# 道1

## 困っていたこと
困っていたこと1

## 試したこと 1
### 方法
方法A
### 結果
success

## 試したこと　２
### 方法
方法B
### 結果
partial
`;
    const { roads, errors } = parseSeedMarkdown(md);
    expect(errors).toEqual([]);
    expect(roads[0].attempts.map((a) => a.method)).toEqual(["方法A", "方法B"]);
  });

  it("文書タイトル（# 見出し）でラップされ、道以下が1段深い実データ（ChatGPT実出力）を解析できる", () => {
    // 実際に ChatGPT が出した Markdown は「# 道1」ではなく「# できる道 仮データ」という
    // 文書タイトルの下に「## 道1」があり、以下 1 段ずつ深い（### 困っていたこと / #### 方法）。
    // 見出しレベルを固定していた実装では解析エラーになっていた回帰テスト。
    const md = `# できる道 仮データ

## 道1

### 困っていたこと
困っていたこと1

### 試したこと1

#### 方法
方法1

#### 結果
success

#### 結果の詳細
詳細1

### 試したこと2

#### 方法
方法1-2

#### 結果
partial

### 次に試したいこと
次に試したいこと1

---
`;
    const { roads, errors } = parseSeedMarkdown(md);
    expect(errors).toEqual([]);
    expect(roads).toHaveLength(1);
    expect(roads[0].title).toBe("道1");
    expect(roads[0].difficulty).toBe("困っていたこと1");
    expect(roads[0].attempts).toHaveLength(2);
    expect(roads[0].attempts[0]).toEqual({ method: "方法1", result: "success", attemptMemo: "詳細1" });
    expect(roads[0].attempts[1]).toEqual({ method: "方法1-2", result: "partial", attemptMemo: null });
    // 見出しの直前にある水平線 (---) が本文に混ざらない
    expect(roads[0].nextAction).toBe("次に試したいこと1");
  });

  it("「試したこと」見出しで試したこと1〜Nをまとめ、項目を箇条書きで持つ実データ（ユーザー提示フォーマット）を解析できる", () => {
    // ユーザーが実際に使う形式:
    //   ### 試したこと (番号なし。試したこと1〜Nをまとめるラッパー見出し)
    //     #### 試したこと1
    //     - 方法：〜
    //     - 試した理由：〜
    //     - 結果：partial
    //     - 結果の詳細：〜
    //     - 次につながったこと：〜
    // 見出しをこれ以上増やさず、項目を「- ラベル：値」の箇条書きで持つ。
    const md = `# できる道 仮データ

## 道1：自分でツメを切る

### 困っていたこと
ツメを切るとき、爪切りを持って操作するのが難しくなってきた。

### 以前できていたこと
以前は普通の爪切りを使って、自分でツメを切っていた。

### 目標
自分でツメを切れるようにする。

### 状況
ツメが伸びてくると切ろうとするが、爪切りの操作に時間がかかる。

### 試したこと

#### 試したこと1
- 方法：大きめの爪切りを使った。
- 試した理由：持つ部分が大きいほうが扱いやすそうだったため。
- 結果：partial
- 結果の詳細：持つことは少し楽になったが、細かい操作はまだ難しかった。
- 次につながったこと：爪切り以外の方法も試すことにした。

#### 試したこと2
- 方法：爪やすりで少しずつ整えた。
- 試した理由：爪切りで切る操作が難しいときでも使えそうだったため。
- 結果：partial
- 結果の詳細：少しずつ整えることはできたが、時間がかかった。
- 次につながったこと：時間に余裕があるときの方法として使うことにした。

#### 試したこと3
- 方法：一度に全部のツメを切らず、何回かに分けて行った。
- 試した理由：一回の作業量を減らしたかったため。
- 結果：success
- 結果の詳細：一度に行う負担が減り、自分で続けやすくなった。
- 次につながったこと：無理に一度で終わらせないようにした。

### 現在の状態
自分でできる範囲でツメを切り、難しいときは爪やすりも使っている。

### 次に試したいこと
今の方法で続けながら、さらに扱いやすい道具がないか探したい。
`;
    const { roads, errors } = parseSeedMarkdown(md);
    expect(errors).toEqual([]);
    expect(roads).toHaveLength(1);
    const r = roads[0];
    expect(r.title).toBe("道1：自分でツメを切る");
    expect(r.difficulty).toBe("ツメを切るとき、爪切りを持って操作するのが難しくなってきた。");
    expect(r.status).toBe("自分でできる範囲でツメを切り、難しいときは爪やすりも使っている。");
    expect(r.attempts).toHaveLength(3);
    expect(r.attempts.map((a) => a.method)).toEqual([
      "大きめの爪切りを使った。",
      "爪やすりで少しずつ整えた。",
      "一度に全部のツメを切らず、何回かに分けて行った。",
    ]);
    expect(r.attempts.map((a) => a.result)).toEqual(["partial", "partial", "success"]);
    expect(r.attempts[0].attemptMemo).toContain("持つことは少し楽になったが、細かい操作はまだ難しかった。");
    expect(r.attempts[0].attemptMemo).toContain("試した理由：持つ部分が大きいほうが扱いやすそうだったため。");
    expect(r.attempts[0].attemptMemo).toContain("次につながったこと：爪切り以外の方法も試すことにした。");
  });

  it("箇条書き形式の試したことで、対応していない項目名はエラーとして報告する", () => {
    const md = `# 道1

## 困っていたこと
困っていたこと1

## 試したこと

### 試したこと1
- 方法：方法1
- 結果：success
- 謎の項目：本文
`;
    const { errors } = parseSeedMarkdown(md);
    expect(errors.some((e) => e.includes("謎の項目"))).toBe(true);
  });
});
