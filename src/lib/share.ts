import { resultMeta } from "@/lib/constants";

/**
 * 経験詳細ページを SNS で紹介するときの共有文（SNS共有機能追加指示書）。
 *
 * - 材料は、その経験詳細ページで一般公開されている「困っていたこと」「試したこと」「結果」だけ。
 *   投稿者情報・メモ・気持ち・内部 ID などは受け取らない（型で入口を絞る）。
 * - SNS へは概要だけを出し、詳しい内容は「できる道」の経験ページで見てもらう。
 * - 結果は書き換えない。うまくいかなかった経験を成功例のように書かない。
 * - X の上限（重み付き 280。日本語 1 文字 = 2、URL = 23）に収まるよう、方法の件数・長さを段階的に削る。
 */

export interface ShareSource {
  difficulty: string | null;
  goal: string | null;
  /** その人が公開している試したこと（時系列） */
  methods: { method: string; result: string }[];
}

const X_MAX_WEIGHT = 280;
/** X は URL を長さに関わらず 23 として数える */
const X_URL_WEIGHT = 23;

/** 経験詳細の正規 URL。基点は既存の `env.site.url`（呼び出し側で渡す）。 */
export function experienceShareUrl(siteUrl: string, experienceId: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/experiences/${experienceId}`;
}

/** X の投稿画面（自動投稿はしない。利用者が X 側で確認して投稿する）。 */
export function xShareUrl(text: string, url: string): string {
  return `https://x.com/intent/post?${new URLSearchParams({ text, url }).toString()}`;
}

/** X の文字数の数え方（twitter-text の既定）。ラテン系・一部記号は 1、それ以外（日本語・絵文字）は 2。 */
export function xWeightedLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const light =
      c <= 0x10ff ||
      (c >= 0x2000 && c <= 0x200d) ||
      (c >= 0x2010 && c <= 0x201f) ||
      (c >= 0x2032 && c <= 0x2037);
    n += light ? 1 : 2;
  }
  return n;
}

/** 改行・連続空白を 1 つの空白にまとめ、max 文字を超えたら「…」で切る */
function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  const chars = [...t];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : t;
}

const isUnsuccessful = (r: string) => r === "failed" || r === "no_change";
const isPositive = (r: string) => r === "success" || r === "partial";

/** 「3つの方法」「12件の方法」。10 以上で「〜つ」は不自然なので件にする */
function methodCount(n: number): string {
  return n <= 9 ? `${n}つ` : `${n}件`;
}

/** 文末に句読点が無ければ「。」を足す（「…」で切ったものはそのまま） */
function asSentence(s: string): string {
  return /[。．.！!？?」』）)…]$/.test(s) ? s : `${s}。`;
}

/**
 * 結果をひとことで。事実に沿うときだけ書き、成功・効果を勝手に断定しない。
 *   - うまくいった（少しできた含む）とうまくいかなかった（変化なし含む）が両方ある → 試行錯誤が残っている
 *   - 全部うまくいかなかった/変化なし → 十分な改善にはつながらなかった
 *   - 全部継続中 → 途中
 *   - 方法が 1 件 → その結果のラベルをそのまま
 *   - それ以外（うまくいった＋継続中など）→ 書かない（詳細はページで見てもらう）
 */
function resultNote(results: string[]): string {
  if (results.length === 0) return "";
  if (results.some(isPositive) && results.some(isUnsuccessful)) {
    return "うまくいかなかった方法も含めて、実際の試行錯誤が残っています。";
  }
  if (results.length >= 2 && results.every(isUnsuccessful)) {
    return "どの方法も、十分な改善にはつながりませんでした。";
  }
  if (results.every((r) => r === "ongoing")) return "いまも試している途中です。";
  if (results.length === 1) return `結果は「${resultMeta(results[0]!).label}」でした。`;
  return "";
}

function compose(src: ShareSource, maxMethods: number, methodLen: number, withNote: boolean) {
  const problem = src.difficulty?.trim() || src.goal?.trim() || "";
  // 3 件までは全部、4 件以上は代表 2 件＋件数（SNS では概要だけ。デザイン改善指示書 §7・§8）
  const shown = src.methods.slice(
    0,
    src.methods.length <= 3 ? maxMethods : Math.min(maxMethods, 2),
  );
  const rest = src.methods.length - shown.length;
  const lines: string[] = [];
  if (problem) lines.push(asSentence(oneLine(problem, 40)), "");
  if (shown.length > 0) {
    lines.push("この人は、");
    for (const m of shown) lines.push(`・${oneLine(m.method, methodLen)}`);
    lines.push(
      rest > 0
        ? `など、${methodCount(src.methods.length)}の方法を試していました。`
        : "という方法を試していました。",
      "",
    );
    const note = withNote ? resultNote(src.methods.map((m) => m.result)) : "";
    if (note) lines.push(note, "");
  }
  lines.push("↓ この人がたどった道");
  return lines.join("\n");
}

/**
 * 共有文（URL は含めない。X は url パラメータ、コピー/OS 共有は呼び出し側で URL を添える）。
 * 情報の優先順位は 困っていたこと ＞ 試した方法 ＞ 結果。長いときは結果の一文 → 方法の長さ → 件数の順に削る。
 */
export function buildShareText(src: ShareSource): string {
  const fits = (t: string) => xWeightedLength(t) + 1 + X_URL_WEIGHT <= X_MAX_WEIGHT;
  for (const maxMethods of [3, 2, 1]) {
    for (const methodLen of [20, 14, 10]) {
      for (const withNote of [true, false]) {
        const t = compose(src, maxMethods, methodLen, withNote);
        if (fits(t)) return t;
      }
    }
  }
  return compose({ ...src, methods: src.methods.slice(0, 1) }, 1, 10, false);
}
