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
  // roads.status（「道を育てる」の「今の状態」）。もとは「継続中／一区切り」程度の短いラベル想定で 60。
  // 「どの程度できるか・何が難しいか・道具でどう変わったか」を短く書く欄になったため 300 に（2026-10-06）。
  // DB は長さ制限の無い text。バッジ等の短い表示には使っていない（入力欄と管理画面の編集欄のみ）。
  statusLabel: 300,
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
    description: "試したことで、できるようになった",
    tokenKey: "success",
  },
  partial: {
    value: "partial",
    label: "少しできた",
    short: "少し",
    description: "完全ではないけれど、前よりできるようになった",
    tokenKey: "partial",
  },
  no_change: {
    value: "no_change",
    label: "変化はなかった",
    short: "変化なし",
    description: "試してみたが、あまり変わらなかった",
    tokenKey: "no_change",
  },
  failed: {
    value: "failed",
    label: "うまくいかなかった",
    short: "うまくいかず",
    description: "試したが、目的を達成できなかった",
    tokenKey: "failed",
  },
  ongoing: {
    value: "ongoing",
    label: "まだ試している",
    short: "継続中",
    description: "まだ途中なので、結果はこれから",
    tokenKey: "ongoing",
  },
};

export function resultMeta(value: string): ResultMeta {
  return RESULT_META[value as AttemptResultValue] ?? RESULT_META.ongoing;
}

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

/**
 * 既読 / 未読での絞り込み（ログイン中のみ意味がある）。
 * "" = すべて。URL には既定 "" と異なるときだけ `read` を付ける。
 */
export const EXPERIENCE_READ_VALUES = ["read", "unread"] as const;
export type ExperienceReadFilter = (typeof EXPERIENCE_READ_VALUES)[number];
export const EXPERIENCE_READ_OPTIONS = ["", "read", "unread"] as const;
export const EXPERIENCE_READ_LABEL: Record<string, string> = {
  "": "既読・未読すべて",
  read: "既読だけ",
  unread: "未読だけ",
};

/**
 * 既読引き継ぎ (指示書「既読引き継ぎ」)。未ログイン時にブラウザへ保存する既読 ID の上限と、
 * ログイン⇄未ログイン間で一度に統合する件数の上限。クライアントの localStorage 側とサーバー側の
 * 統合 API (`mergeReadsSchema`) で同じ値を使い、上限の食い違いを避ける。
 */
export const MAX_LOCAL_READ_IDS = 500;

/** トップページの検索例 (指示書 6-①) */
export const SEARCH_EXAMPLES = [
  "ボタンがとめにくい",
  "つめが切りにくい",
  "階段の上り下りがこわい",
  "ペットボトルのふたが開けにくい",
  "字が読みづらくなった",
  "料理の火加減がわからない",
];
