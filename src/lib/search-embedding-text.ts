/**
 * 意味検索 (Embedding) に渡す「検索用テキスト」を、道 (Road) / 試したこと (Attempt) から組み立てる。
 *
 * Stage 1 の範囲: テキスト生成だけの純関数。DB アクセス・外部 API・モデルのロードはしない。
 * まだ検索処理からは呼ばない（通常検索 / AI 検索 / 表記ゆれ検索は変えない）。
 *
 * 方針:
 *   - 含める項目は現在の公開検索の対象と同じ（src/lib/search.ts）。
 *       道:          difficulty / situation / goal / previouslyAble / タグ名
 *       試したこと:  method / memo
 *   - 各項目は「ラベル：値」の 1 行にし、項目の意味がモデルに伝わるようにする。
 *     ラベルは画面・フォームで使っている表記に合わせる。
 *   - 値が無い項目（null / undefined / 空文字 / 空白のみ / 空配列）は行ごと出さない。
 *     「困っている場面：」のようなラベルだけの行や "null" / "undefined" の文字列は出さない。
 *   - 正規化は意味を変えない最小限だけ: Unicode NFC、制御文字の除去、改行・タブ・全角スペースを
 *     含む空白の連続を半角スペース 1 つに、前後の空白を除去。語句の削除・要約・言い換えはしない。
 *   - モデル固有の接頭辞（e5 の "passage: " など）はここでは付けない（モデル導入時に決める）。
 */

/** Embedding テキストの行ラベル（画面・フォームの表記に合わせる）。 */
export const EMBEDDING_LABEL = {
  difficulty: "できなくなったこと",
  situation: "困っている場面",
  goal: "できるようになりたいこと",
  previouslyAble: "以前できていたこと",
  tags: "タグ",
  method: "試したこと",
  memo: "メモ・気づき",
} as const;

/** 行の区切り（ラベルと値の区切りは全角コロン）。 */
const LINE_SEPARATOR = "\n";
const LABEL_SEPARATOR = "：";
const TAG_SEPARATOR = "、";

type TextValue = string | null | undefined;

export interface RoadEmbeddingInput {
  difficulty?: TextValue;
  situation?: TextValue;
  goal?: TextValue;
  previouslyAble?: TextValue;
  tags?: readonly TextValue[] | null;
}

export interface AttemptEmbeddingInput {
  method?: TextValue;
  memo?: TextValue;
}

// C0/C1 制御文字（改行・タブは空白扱いにするので別途処理）。
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
/** 半角/全角スペース・改行・タブなどの空白の連続。 */
const WHITESPACE_RUN = /\s+/gu;

/**
 * 1 つの値を Embedding 用に正規化する。空になれば ""。
 * 文字列以外（null / undefined など）は "" として扱う。
 */
export function normalizeEmbeddingValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.normalize("NFC").replace(CONTROL_CHARS, "").replace(WHITESPACE_RUN, " ").trim();
}

function line(label: string, value: string): string | null {
  return value ? `${label}${LABEL_SEPARATOR}${value}` : null;
}

/** タグ名を正規化 → 空を除去 → 重複除去 → 並び順を固定（DB の取得順に左右されないように）。 */
function normalizeTags(tags: RoadEmbeddingInput["tags"]): string[] {
  if (!Array.isArray(tags)) return [];
  const names = new Set(tags.map(normalizeEmbeddingValue).filter((t) => t.length > 0));
  return [...names].sort((a, b) => a.localeCompare(b, "ja"));
}

function joinLines(lines: (string | null)[]): string {
  return lines.filter((l): l is string => l !== null).join(LINE_SEPARATOR);
}

/**
 * 道 (Road) の Embedding 用テキスト。すべて空なら ""（呼び出し側で Embedding 対象外にする想定）。
 *
 * 例:
 *   できなくなったこと：ボタンがとめにくい
 *   困っている場面：シャツを着るとき
 *   できるようになりたいこと：一人で着替えたい
 *   以前できていたこと：朝の着替えは自分でしていた
 *   タグ：衣服、着替え
 */
export function buildRoadEmbeddingText(road: RoadEmbeddingInput): string {
  const tags = normalizeTags(road.tags);
  return joinLines([
    line(EMBEDDING_LABEL.difficulty, normalizeEmbeddingValue(road.difficulty)),
    line(EMBEDDING_LABEL.situation, normalizeEmbeddingValue(road.situation)),
    line(EMBEDDING_LABEL.goal, normalizeEmbeddingValue(road.goal)),
    line(EMBEDDING_LABEL.previouslyAble, normalizeEmbeddingValue(road.previouslyAble)),
    line(EMBEDDING_LABEL.tags, tags.join(TAG_SEPARATOR)),
  ]);
}

/**
 * 試したこと (Attempt) の Embedding 用テキスト。すべて空なら ""。
 *
 * 例:
 *   試したこと：ボタンエイドを使った
 *   メモ・気づき：最初は慣れなかったが、1 週間で使えるようになった
 */
export function buildAttemptEmbeddingText(attempt: AttemptEmbeddingInput): string {
  return joinLines([
    line(EMBEDDING_LABEL.method, normalizeEmbeddingValue(attempt.method)),
    line(EMBEDDING_LABEL.memo, normalizeEmbeddingValue(attempt.memo)),
  ]);
}
