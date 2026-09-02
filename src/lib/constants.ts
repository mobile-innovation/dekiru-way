/**
 * 結果 5 分類のメタデータ (指示書 4)。
 * 色だけで状態を伝えないため、必ず label / icon / description をセットで使う (指示書 8/9)。
 * icon は絵文字 (追加ライブラリ不要・スクリーンリーダーは aria-hidden で無視させる)。
 */

export const ATTEMPT_RESULTS = ["success", "partial", "no_change", "failed", "ongoing"] as const;
export type AttemptResultValue = (typeof ATTEMPT_RESULTS)[number];

export interface ResultMeta {
  value: AttemptResultValue;
  label: string;
  short: string;
  description: string;
  icon: string;
  /** CSS 変数名のサフィックス (globals: --color-result-*) */
  tokenKey: string;
}

export const RESULT_META: Record<AttemptResultValue, ResultMeta> = {
  success: {
    value: "success",
    label: "できるようになった",
    short: "できた",
    description: "試した結果、できるようになった",
    icon: "🌱",
    tokenKey: "success",
  },
  partial: {
    value: "partial",
    label: "少しできた",
    short: "少し",
    description: "完全ではないが、前より少しできるようになった",
    icon: "🌤️",
    tokenKey: "partial",
  },
  no_change: {
    value: "no_change",
    label: "変化はなかった",
    short: "変化なし",
    description: "試したが、特に変化はなかった",
    icon: "➖",
    tokenKey: "no_change",
  },
  failed: {
    value: "failed",
    label: "うまくいかなかった",
    short: "うまくいかず",
    description: "試したが、うまくいかなかった（これも大切な経験）",
    icon: "🍂",
    tokenKey: "failed",
  },
  ongoing: {
    value: "ongoing",
    label: "まだ試している",
    short: "継続中",
    description: "いま試している途中",
    icon: "🚶",
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
 * 「経験を探す」で表示する結果の種類（検索語がどこに当たったか）。
 * 既定は "road"（道のみ）。方法カードは検索語を入れて種類を切り替えたときだけ出す。
 */
export const EXPERIENCE_KINDS = ["road", "both", "method"] as const;
export type ExperienceKind = (typeof EXPERIENCE_KINDS)[number];
export const EXPERIENCE_KIND_DEFAULT: ExperienceKind = "road";
export const EXPERIENCE_KIND_LABEL: Record<ExperienceKind, string> = {
  road: "道（困りごと・目標に一致）だけ",
  both: "道と方法の両方",
  method: "方法（試したこと・気づきに一致）だけ",
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
