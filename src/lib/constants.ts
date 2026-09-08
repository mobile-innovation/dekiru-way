/**
 * 結果 5 分類のメタデータ (指示書 4)。
 * 色だけで状態を伝えないため、必ず label / description をセットで使う (指示書 8/9)。
 * アイコンは `resultIcon()` (src/components/icons.tsx) のラインアイコンに一本化 (指示書 §5)。
 */

export const ATTEMPT_RESULTS = ["success", "partial", "no_change", "failed", "ongoing"] as const;
export type AttemptResultValue = (typeof ATTEMPT_RESULTS)[number];

/**
 * テキスト入力の最大文字数。フォームの表示（残り文字数）と zod バリデーションで共有し、
 * 片方だけずれることを防ぐ。
 */
export const FIELD_MAX = {
  title: 120,
  statusLabel: 60,
  tagName: 30,
  text: 2000,
  longText: 4000,
  // SNS からの簡易登録 (/try)。ログイン不要・匿名なので、乱用の的を小さくするため
  // 通常のフォーム (text: 2000) より短く抑える。ひとことでも成立する項目向け。
  quickText: 400,
} as const;

export interface ResultMeta {
  value: AttemptResultValue;
  label: string;
  short: string;
  description: string;
  /** CSS 変数名のサフィックス (globals: --color-result-*) */
  tokenKey: string;
}

export const RESULT_META: Record<AttemptResultValue, ResultMeta> = {
  success: {
    value: "success",
    label: "できるようになった",
    short: "できた",
    description: "試した結果、できるようになった",
    tokenKey: "success",
  },
  partial: {
    value: "partial",
    label: "少しできた",
    short: "少し",
    description: "完全ではないが、前より少しできるようになった",
    tokenKey: "partial",
  },
  no_change: {
    value: "no_change",
    label: "変化はなかった",
    short: "変化なし",
    description: "試したが、特に変化はなかった",
    tokenKey: "no_change",
  },
  failed: {
    value: "failed",
    label: "うまくいかなかった",
    short: "うまくいかず",
    description: "試したが、うまくいかなかった（これも大切な経験）",
    tokenKey: "failed",
  },
  ongoing: {
    value: "ongoing",
    label: "まだ試している",
    short: "継続中",
    description: "いま試している途中",
    tokenKey: "ongoing",
  },
};

export function resultMeta(value: string): ResultMeta {
  return RESULT_META[value as AttemptResultValue] ?? RESULT_META.ongoing;
}

export const VISIBILITY = ["private", "public"] as const;
export type VisibilityValue = (typeof VISIBILITY)[number];

export const EXPERIENCE_SORTS = ["recent", "helpful", "tried"] as const;
export type ExperienceSort = (typeof EXPERIENCE_SORTS)[number];

/**
 * 「経験を探す」で表示する結果の種類。表示順は 道 → 方法 → 両方。
 * 既定は "road"（道だけ）。検索語の有無に関わらず種類は切り替えられる。
 */
export const EXPERIENCE_KINDS = ["road", "method", "both"] as const;
export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number];
export const EXPERIENCE_KIND_DEFAULT: ExperienceKind = "road";
export const EXPERIENCE_KIND_LABEL: Record<ExperienceKind, string> = {
  road: "道（困りごと・目標）だけ",
  both: "道と方法の両方",
  method: "方法（試したこと・気づき）だけ",
};

/** トップページの検索例 (指示書 6-①) */
export const SEARCH_EXAMPLES = [
  "ボタンがとめにくい",
  "つめが切りにくい",
  "階段の上り下りがこわい",
  "ペットボトルのふたが開けにくい",
  "字が読みづらくなった",
  "料理の火加減がわからない",
];
