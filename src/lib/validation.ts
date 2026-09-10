import { z } from "zod";
import {
  ATTEMPT_RESULTS,
  EXPERIENCE_KINDS,
  EXPERIENCE_KIND_DEFAULT,
  EXPERIENCE_READ_VALUES,
  EXPERIENCE_SORTS,
  FIELD_MAX,
} from "@/lib/constants";

/**
 * API 入力バリデーション (指示書 15: 全エンドポイントで入力値検証)。
 * 文字列は trim し、空文字は null 相当として扱う。
 */

const trimmedOptional = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length <= max, { message: `${max} 文字以内で入力してください` })
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

const trimmedRequired = (max: number, label: string) =>
  z
    .string({ required_error: `${label}を入力してください` })
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, { message: `${label}を入力してください` })
    .refine((s) => s.length <= max, { message: `${max} 文字以内で入力してください` });

// 日付は "YYYY-MM-DD" もしくは null
const isoDateOptional = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "YYYY-MM-DD 形式で入力してください" })
  .nullable()
  .optional();

const tagNameList = z
  .array(z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(FIELD_MAX.tagName)))
  .max(10, { message: "タグは 10 個までです" })
  .optional();

// ---- Road ----

export const roadCreateSchema = z.object({
  previouslyAble: trimmedOptional(FIELD_MAX.text),
  difficulty: trimmedOptional(FIELD_MAX.text),
  goal: trimmedOptional(FIELD_MAX.text),
  startedAt: isoDateOptional,
  situation: trimmedOptional(FIELD_MAX.text),
  memo: trimmedOptional(FIELD_MAX.longText),
  status: trimmedOptional(FIELD_MAX.statusLabel),
  progress: trimmedOptional(FIELD_MAX.text),
  nextAction: trimmedOptional(FIELD_MAX.text),
  tags: tagNameList,
});

export const roadUpdateSchema = roadCreateSchema.partial();

// ---- Attempt ----

export const attemptCreateSchema = z.object({
  method: trimmedRequired(FIELD_MAX.text, "試したこと"),
  result: z.enum(ATTEMPT_RESULTS, { required_error: "結果を選んでください" }),
  triedAt: isoDateOptional,
  memo: trimmedOptional(FIELD_MAX.longText),
  isPublished: z.boolean().optional(),
  // v6: 本人入力の「できた％」。AI は関与しない。result とは別情報。
  achievementPercent: z.coerce
    .number({ invalid_type_error: "0〜100 の数値で入力してください" })
    .int()
    .min(0, "0〜100 で入力してください")
    .max(100, "0〜100 で入力してください")
    .nullable()
    .optional(),
  feeling: trimmedOptional(FIELD_MAX.text),
  stateAfter: trimmedOptional(FIELD_MAX.text),
  nextAction: trimmedOptional(FIELD_MAX.text),
  // 実際にこの方法の前に試した Attempt (同じ Road 内)。日付/並びから推測して設定しない。
  previousAttemptId: z.string().uuid("不正な指定です").nullable().optional(),
});

export const attemptUpdateSchema = attemptCreateSchema.partial();

// ---- Experience 検索 ----

/**
 * 深いページングでの全件取得を容易にしない (追加指示書 v1 §4/§15)。
 * page * limit がこの窓を超える要求は 400 で拒否し、絞り込みを促す。
 */
export const MAX_RESULT_WINDOW = 500;

export const experienceQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  result: z.enum(ATTEMPT_RESULTS).optional(),
  tag: z.string().trim().max(30).optional(),
  // 1 回のレスポンス件数上限と、到達可能なページ深さの上限 (§3/§4)
  page: z.coerce.number().int().min(1).max(100).default(1),
  // 「経験を探す」SSR ページの「方法カード」用ページ番号（道カードの page とは独立）
  mp: z.coerce.number().int().min(1).max(100).default(1),
  // 表示する結果の種類: 道 / 方法 / 両方（検索語ありのときだけ効く）。既定は道のみ。
  kind: z.enum(EXPERIENCE_KINDS).default(EXPERIENCE_KIND_DEFAULT),
  // 既読 / 未読での絞り込み（ログイン中のみ効く。未指定 = すべて）。
  read: z.enum(EXPERIENCE_READ_VALUES).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(EXPERIENCE_SORTS).default("recent"),
});
export type ExperienceQuery = z.infer<typeof experienceQuerySchema>;

export const pathsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(30).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

// ---- AI ----

export const aiExperienceSearchSchema = z.object({
  situation: trimmedRequired(1000, "いまの状況"),
});

// ---- 仮データ (管理画面 AI 生成。実装指示書) ----

export const SEED_COUNT_MIN = 5;
export const SEED_COUNT_MAX = 20;
export const SEED_COUNT_DEFAULT = 10;

/** キーワードから候補を生成する入力。 */
export const seedGenerateSchema = z.object({
  keyword: trimmedRequired(200, "キーワード"),
  count: z.coerce
    .number()
    .int()
    .min(SEED_COUNT_MIN)
    .max(SEED_COUNT_MAX)
    .default(SEED_COUNT_DEFAULT),
  /**
   * 再生成時に「これは出さない」候補。画面に表示中の結果＋その回までに生成した分。
   * キーワードを変えずに再生成するたび内容を変えるために使う。保存済み仮データとは別。
   */
  exclude: z
    .array(
      z.object({
        difficulty: z.string().trim().max(FIELD_MAX.text).nullable().optional(),
        method: z.string().trim().max(FIELD_MAX.text).optional(),
        result: z.string().trim().max(20).optional(),
      }),
    )
    .max(200)
    .optional(),
});

/**
 * 困ったこと (difficulty)。仮データでは必須。「サンプル1」のような連番だけの困りごとは弾く
 * (具体化は生成側 isConcreteDifficulty で担保。ここは保存時の最終防御)。
 */
const seedDifficulty = trimmedRequired(FIELD_MAX.text, "困ったこと").refine(
  (v) => !/(サンプル|テスト|例)\s*[0-9０-９]+/.test(v),
  { message: "「サンプル1」のような番号だけの困りごとにしないでください" },
);

/** 仮データ 1 件 = Road 相当 + Attempt 相当。保存前の確認画面で編集された値もこれで検証する。 */
export const seedDraftSchema = z.object({
  difficulty: seedDifficulty,
  previouslyAble: trimmedOptional(FIELD_MAX.text),
  goal: trimmedOptional(FIELD_MAX.text),
  situation: trimmedOptional(FIELD_MAX.text),
  startedAt: isoDateOptional,
  memo: trimmedOptional(FIELD_MAX.longText),
  status: trimmedOptional(FIELD_MAX.statusLabel),
  progress: trimmedOptional(FIELD_MAX.text),
  nextAction: trimmedOptional(FIELD_MAX.text),
  method: trimmedRequired(FIELD_MAX.text, "試したこと"),
  result: z.enum(ATTEMPT_RESULTS, { required_error: "結果を選んでください" }),
  triedAt: isoDateOptional,
  attemptMemo: trimmedOptional(FIELD_MAX.longText),
});
export type SeedDraftInput = z.infer<typeof seedDraftSchema>;

/** 保存 (すべて非公開で作成)。件数は生成上限と同じに抑える。 */
export const seedCreateSchema = z.object({
  // 生成時のテーマ。同じテーマの再生成で重複を避けるため保存時に控える (任意)。
  keyword: trimmedOptional(200),
  items: z
    .array(seedDraftSchema)
    .min(1, "保存する仮データがありません")
    .max(SEED_COUNT_MAX, `一度に保存できるのは ${SEED_COUNT_MAX} 件までです`),
});

/** 1 件ずつの編集 (部分更新)。 */
export const seedUpdateSchema = seedDraftSchema.partial();
export type SeedUpdateInput = z.infer<typeof seedUpdateSchema>;

export const aiSummarizeSchema = z.object({
  experienceIds: z.array(z.string().uuid()).min(1).max(20),
});

// ---- SNS 簡易登録 (/try) ----

/**
 * ログイン不要の簡易登録用。1 画面・最小入力 (困っていたこと / 試したこと / 結果)。
 * 入力は「データ」として扱い、制御文字を除去し行内の連続空白を 1 つに畳んでから保存する。
 * HTML/スクリプトは保存後も常にテキストとして描画される (React が自動エスケープ) ため無害化される。
 */
// タブ (U+0009) と改行 (U+000A) を除く制御文字 (C0 / DEL / C1)。
// タブは空白として INLINE_SPACES 側で 1 つのスペースに畳む。
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// 改行を除く行内の連続空白
const INLINE_SPACES = /[^\S\n]+/g;

const quickField = (label: string) =>
  z
    .string({ required_error: `${label}を入力してください` })
    .transform((s) => s.replace(CONTROL_CHARS, "").replace(INLINE_SPACES, " ").trim())
    .refine((s) => s.length > 0, { message: `${label}を入力してください` })
    .refine((s) => s.length <= FIELD_MAX.quickText, {
      message: `${label}は ${FIELD_MAX.quickText} 文字以内で入力してください`,
    });

export const quickExperienceSchema = z.object({
  difficulty: quickField("困っていたこと"),
  method: quickField("試したこと"),
  result: z.enum(ATTEMPT_RESULTS, { required_error: "試した結果を選んでください" }),
});
export type QuickExperienceInput = z.infer<typeof quickExperienceSchema>;

/** URL パラメータ (?problem=...) の下ごしらえ。生の値は信用せず、長さと制御文字を落とす。 */
export function sanitizeProblemParam(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== "string") return "";
  return v
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FIELD_MAX.quickText);
}
