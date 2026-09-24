import { ATTEMPT_RESULTS, type AttemptResultValue } from "@/lib/constants";

/**
 * ChatGPT 等で作成した Markdown から「複数の試したことを持つ道」を解析する
 * (管理画面更新指示書「複数の試したことを持つ道」を登録できるようにする)。
 *
 * AI を呼ばない純粋な構文解析。指示書 §4 の例は
 *
 *   # 道1
 *   ## 困っていたこと
 *   ## 試したこと1
 *   ### 方法
 *   ### 結果
 *
 * だが、実際に ChatGPT が出す Markdown は「# できる道 仮データ」のような文書タイトルを
 * 一番外側に置き、道以下が 1 階層ずつ深くなる（`## 道1` → `### 困っていたこと` →
 * `#### 方法`）ことが多い。見出しレベルを固定 (`#`=道) にすると実データで解析エラーになったため、
 * **絶対的な見出しレベルではなく、見出しの親子構造（ネスト）から意味を判定する**方式にした:
 *
 *   1. Markdown 全体を見出しレベルに応じた木構造にする（レベルは何段でもよい）。
 *   2. 「困っていたこと」等の既知の道の項目名、または「試したこと」で始まる見出しを
 *      **直接の子に持つ見出し**を「道」と判定する（何 `#` でもよい）。
 *   3. 道の子のうち、既知の道の項目名に一致するものは道のフィールド、
 *      「試したこと」で始まるものは 1 つの Attempt とし、そのまた子を Attempt の項目とする。
 *
 * 「試した理由」「結果の詳細」「次につながったこと」は Attempt に対応する DB カラムが無いため
 * (previousAttemptId は復活させない指示書 §7)、既存の「気づき」欄 (`Attempt.memo`) へ
 * ラベル付きでまとめて格納する。この折りたたみは実装上の判断であり、完了報告で明記する。
 *
 * **追記（2026-09-25、ユーザー実データに合わせた拡張）**:
 * - 「試したこと」（番号なし）見出しの下に「試したこと1」「試したこと2」…をぶら下げる、
 *   ラッパー見出しの形式にも対応した（`collectAttemptLeaves`。何段ラップしてもよい）。
 * - Attempt の項目（方法・結果 等）は、見出しを増やさず「- 方法：〜」のような箇条書きで
 *   書いてもよい（`parseBulletFields`）。見出し形式・箇条書き形式のどちらでもよく、
 *   Attempt ノードが見出しの子を持つかどうかで自動判定する。
 * - **1 回の取り込みで受け付ける道（Road）は 1 件まで**にした（「道データは1件だけにする」指示。
 *   複数の道の見出しが見つかった場合は `parseSeedMarkdown` の時点でエラーにし、道ごとに
 *   Markdown を分けて取り込んでもらう）。1 つの道が複数の Attempt を持てる機能自体は変更していない。
 */

const ROAD_FIELD_MAP: Record<string, "difficulty" | "previouslyAble" | "goal" | "situation" | "status" | "nextAction"> = {
  困っていたこと: "difficulty",
  以前できていたこと: "previouslyAble",
  目標: "goal",
  状況: "situation",
  現在の状態: "status",
  次に試したいこと: "nextAction",
};

const ATTEMPT_FIELD_MAP: Record<string, "method" | "reason" | "result" | "detail" | "nextLink"> = {
  方法: "method",
  試した理由: "reason",
  結果: "result",
  結果の詳細: "detail",
  次につながったこと: "nextLink",
};

const ATTEMPT_HEADING = /^試したこと/;
const HORIZONTAL_RULE = /^(-{3,}|\*{3,}|_{3,})$/;
const RESULT_LABEL_BY_VALUE = new Map<string, AttemptResultValue>(
  ATTEMPT_RESULTS.map((r) => [r, r]),
);

export interface ParsedAttemptDraft {
  method: string;
  result: AttemptResultValue;
  attemptMemo: string | null;
}

export interface ParsedRoadDraft {
  /** 見出しの元テキスト (例: "道1")。エラーメッセージ表示にのみ使い、DB には保存しない。 */
  title: string;
  difficulty: string | null;
  previouslyAble: string | null;
  goal: string | null;
  situation: string | null;
  status: string | null;
  nextAction: string | null;
  attempts: ParsedAttemptDraft[];
}

export interface ParseSeedMarkdownResult {
  roads: ParsedRoadDraft[];
  /** 1 件でもあれば「解析エラー」として扱い、確認・編集画面へは進ませない。 */
  errors: string[];
}

interface HeadingNode {
  level: number;
  title: string;
  lines: string[];
  children: HeadingNode[];
}

/** 見出し行を階層構造（木）にする。レベルは 1〜6 のどれでもよい。 */
function buildHeadingTree(markdown: string): HeadingNode[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const root: HeadingNode = { level: 0, title: "", lines: [], children: [] };
  const stack: HeadingNode[] = [root];
  for (const raw of lines) {
    const m = /^(#{1,6})\s+(.+?)\s*$/.exec(raw);
    if (m) {
      const node: HeadingNode = { level: m[1].length, title: m[2].trim(), lines: [], children: [] };
      while (stack.length > 1 && stack[stack.length - 1].level >= node.level) stack.pop();
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      stack[stack.length - 1].lines.push(raw);
    }
  }
  return root.children;
}

function body(lines: string[]): string {
  return lines
    .filter((l) => !HORIZONTAL_RULE.test(l.trim()))
    .join("\n")
    .trim();
}

/** 見出し名の前後の全角/半角スペース・番号のゆれを許容して照合する。 */
function normalizeHeading(title: string): string {
  return title.replace(/[\s　]*[0-9０-９]*\s*$/u, "").trim();
}

function isRoadFieldTitle(title: string): boolean {
  return normalizeHeading(title) in ROAD_FIELD_MAP;
}
function isAttemptTitle(title: string): boolean {
  return ATTEMPT_HEADING.test(normalizeHeading(title));
}

/**
 * 「試したこと」見出しの下に、さらに「試したこと1」「試したこと2」…という
 * 見出しがぶら下がっている（番号なしの「試したこと」が個々の試したことをまとめる
 * ラッパーになっている）実データの形式に対応する。ラッパーでなければそのノード自身を
 * 1 件の Attempt として返す（何段ラップされていても再帰的に潜る）。
 */
function collectAttemptLeaves(node: HeadingNode): HeadingNode[] {
  const attemptChildren = node.children.filter((c) => isAttemptTitle(c.title));
  if (attemptChildren.length > 0) {
    return attemptChildren.flatMap((c) => collectAttemptLeaves(c));
  }
  return [node];
}

/**
 * 木構造から「道」に相当する見出しノードを見つける。
 * 直接の子に、道の項目 (困っていたこと 等) または「試したこと」見出しを持つノードを道とみなす。
 * 道より浅い階層（文書タイトルなど）は無視して、より深い階層を探しに行く。
 */
function findRoadNodes(nodes: HeadingNode[]): HeadingNode[] {
  const found: HeadingNode[] = [];
  for (const n of nodes) {
    const looksLikeRoad = n.children.some((c) => isRoadFieldTitle(c.title) || isAttemptTitle(c.title));
    if (looksLikeRoad) {
      found.push(n);
    } else {
      found.push(...findRoadNodes(n.children));
    }
  }
  return found;
}

const BULLET_FIELD_LINE = /^[-*・]\s*([^:：]+?)\s*[:：]\s*(.*)$/;

/**
 * 見出しを持たない Attempt ノード（実データでよく出る形式）の本文を、
 * 「- ラベル：値」の箇条書きとして項目に分解する。値が複数行にまたがる場合
 * （次の箇条書きが始まるまで）は同じ項目にまとめて追記する。
 */
function parseBulletFields(
  roadTitle: string,
  attemptLabel: string,
  lines: string[],
  errors: string[],
): Partial<Record<"method" | "reason" | "result" | "detail" | "nextLink", string>> {
  const fields: Partial<Record<"method" | "reason" | "result" | "detail" | "nextLink", string>> = {};
  let currentKey: "method" | "reason" | "result" | "detail" | "nextLink" | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0 || HORIZONTAL_RULE.test(line)) continue;
    const m = BULLET_FIELD_LINE.exec(line);
    if (m) {
      const label = m[1].trim();
      const key = ATTEMPT_FIELD_MAP[label];
      if (key) {
        fields[key] = m[2].trim();
        currentKey = key;
      } else {
        errors.push(`「${roadTitle}」の「${attemptLabel}」に、対応していない項目「${label}」があります。`);
        currentKey = null;
      }
      continue;
    }
    // 箇条書きの続き（改行で折り返された値）とみなし、直前の項目に足す。
    if (currentKey) {
      fields[currentKey] = `${fields[currentKey]}\n${line}`;
    } else {
      errors.push(`「${roadTitle}」の「${attemptLabel}」に、解釈できない内容「${line}」があります。`);
    }
  }
  return fields;
}

function parseAttemptNode(roadTitle: string, node: HeadingNode, errors: string[]): ParsedAttemptDraft | null {
  const attemptLabel = node.title;
  let fields: Partial<Record<"method" | "reason" | "result" | "detail" | "nextLink", string>>;
  if (node.children.length > 0) {
    // 従来形式: 項目ごとに見出しが分かれている（### 方法 / ### 結果 等）。
    fields = {};
    for (const sub of node.children) {
      const key = ATTEMPT_FIELD_MAP[normalizeHeading(sub.title)];
      if (key) {
        fields[key] = body(sub.lines);
      } else {
        errors.push(`「${roadTitle}」の「${attemptLabel}」に、対応していない見出し「${sub.title}」があります。`);
      }
    }
  } else {
    // 実データでよく出る形式: 見出しを増やさず「- 方法：〜」のような箇条書きで項目を持つ。
    fields = parseBulletFields(roadTitle, attemptLabel, node.lines, errors);
  }

  const method = (fields.method ?? "").trim();
  if (!method) {
    errors.push(`「${roadTitle}」の「${attemptLabel}」に「方法」がありません。`);
  }

  const resultRaw = (fields.result ?? "").trim();
  let result: AttemptResultValue | null = null;
  if (!resultRaw) {
    errors.push(`「${roadTitle}」の「${attemptLabel}」に「結果」がありません。`);
  } else {
    result = RESULT_LABEL_BY_VALUE.get(resultRaw.toLowerCase()) ?? null;
    if (!result) {
      errors.push(
        `「${roadTitle}」の「${attemptLabel}」: 結果「${resultRaw}」は対応していません` +
          `（success / partial / no_change / failed / ongoing のいずれかにしてください）。`,
      );
    }
  }

  if (!method || !result) return null;

  const memoParts = [
    fields.detail,
    fields.reason ? `試した理由：${fields.reason}` : null,
    fields.nextLink ? `次につながったこと：${fields.nextLink}` : null,
  ].filter((s): s is string => Boolean(s && s.trim().length > 0));

  return { method, result, attemptMemo: memoParts.length > 0 ? memoParts.join("\n\n") : null };
}

function parseRoadNode(node: HeadingNode, index: number, errors: string[]): ParsedRoadDraft {
  const roadTitle = node.title || `道${index}`;
  const road: ParsedRoadDraft = {
    title: roadTitle,
    difficulty: null,
    previouslyAble: null,
    goal: null,
    situation: null,
    status: null,
    nextAction: null,
    attempts: [],
  };

  for (const child of node.children) {
    if (isAttemptTitle(child.title)) {
      for (const leaf of collectAttemptLeaves(child)) {
        const attempt = parseAttemptNode(roadTitle, leaf, errors);
        if (attempt) road.attempts.push(attempt);
      }
      continue;
    }
    const key = ROAD_FIELD_MAP[normalizeHeading(child.title)];
    if (key) {
      const text = body(child.lines);
      road[key] = text.length > 0 ? text : null;
    } else {
      errors.push(`「${roadTitle}」に、対応していない見出し「${child.title}」があります。`);
    }
  }

  if (!road.difficulty) {
    errors.push(`「${roadTitle}」に「困っていたこと」がありません。`);
  }
  if (road.attempts.length === 0) {
    errors.push(`「${roadTitle}」に「試したこと」がありません。`);
  }
  return road;
}

export function parseSeedMarkdown(markdown: string): ParseSeedMarkdownResult {
  const errors: string[] = [];
  const tree = buildHeadingTree(markdown);

  if (tree.length === 0) {
    errors.push("見出し（# で始まる行）が見つかりません。Markdownの形式を確認してください。");
    return { roads: [], errors };
  }

  const roadNodes = findRoadNodes(tree);
  if (roadNodes.length === 0) {
    errors.push(
      "「道」の見出しが見つかりません。道の中に「困っていたこと」または「試したこと」の見出しが必要です。",
    );
    return { roads: [], errors };
  }
  // 1回の取り込みで登録できる道は1件まで（実装上の判断。「道データは1件だけにする」指示）。
  // 複数の道をまとめて取り込む用途は無くなったため、確認・編集画面を複雑にしないためにも制限する。
  if (roadNodes.length > 1) {
    errors.push(
      `Markdownで登録できる道は1件までです（見出しが${roadNodes.length}件見つかりました）。` +
        "道ごとにMarkdownを分けて、1件ずつ取り込んでください。",
    );
    return { roads: [], errors };
  }

  const roads = roadNodes.map((n, i) => parseRoadNode(n, i + 1, errors));
  return { roads, errors };
}
