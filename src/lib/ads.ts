/**
 * 広告カテゴリの推定（広告表示方針 v1 §5）。
 *
 * 方針:
 *   - 広告システムへ「ユーザーの検索文字列そのもの」や個人を特定できる情報を渡さない。
 *   - 病名・障害名・健康状態はターゲティングに使わない。
 *   - ここでは検索語 / 道の記述を、**非個人的な「動作カテゴリ」** にだけ変換する。
 *     対応するキーワードが無ければ何も返さない（生テキストは絶対に返さない）。
 *   - 実際のカテゴリ体系は利用する広告サービスの仕様に合わせて調整する。ここは実装例。
 */

export interface AdContext {
  /** 大分類（例: clothing / cooking / writing / mobility） */
  category: string;
  /** 小分類（例: dressing_support） */
  subCategory: string;
}

// キーワード（部分一致・ひらがな/カタカナ/漢字の表記ゆれを最小限カバー）→ カテゴリ。
// 健康状態・診断名は含めない。日常動作の名詞のみ。
const RULES: { keywords: string[]; category: string; subCategory: string }[] = [
  { keywords: ["靴下", "くつ下", "ボタン", "着替え", "きがえ", "ファスナー", "シャツ", "服を"], category: "clothing", subCategory: "dressing_support" },
  { keywords: ["料理", "調理", "包丁", "火加減", "フライパン", "皮むき", "缶", "ふたが", "ペットボトル", "キャップ"], category: "cooking", subCategory: "kitchen_support" },
  { keywords: ["字", "文字", "書く", "ペン", "鉛筆", "筆記", "サイン"], category: "writing", subCategory: "writing_support" },
  { keywords: ["階段", "段差", "歩く", "歩行", "立ち上が", "つまず", "ふらつ", "杖"], category: "mobility", subCategory: "walking_support" },
  { keywords: ["つめ", "爪", "爪切", "つめ切"], category: "grooming", subCategory: "nail_care" },
  { keywords: ["食事", "スプーン", "フォーク", "箸", "はし", "食べこぼ", "こぼす"], category: "eating", subCategory: "eating_support" },
  { keywords: ["入浴", "お風呂", "浴槽", "シャワー", "体を洗", "洗髪"], category: "bathing", subCategory: "bathing_support" },
  { keywords: ["トイレ", "排せつ", "おむつ"], category: "toileting", subCategory: "toileting_support" },
  { keywords: ["開けにくい", "開かない", "つかむ", "握", "にぎ", "回しにくい", "回らない", "ひねる"], category: "grip", subCategory: "grip_support" },
  { keywords: ["読み", "見えにくい", "見えづら", "老眼", "拡大", "小さい字"], category: "reading", subCategory: "reading_support" },
];

/**
 * 検索語や道の記述から広告カテゴリを推定する。該当が無ければ null。
 * 返すのはカテゴリ ID のみ。入力テキストは一切含めない。
 */
export function adContextFromText(text: string | null | undefined): AdContext | null {
  if (!text) return null;
  const t = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((k) => t.includes(k.toLowerCase()))) {
      return { category: rule.category, subCategory: rule.subCategory };
    }
  }
  return null;
}
