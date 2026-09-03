import { z } from "zod";
import {
  ATTEMPT_RESULTS,
  EXPERIENCE_KINDS,
  EXPERIENCE_KIND_DEFAULT,
  EXPERIENCE_SORTS,
  FIELD_MAX,
  VISIBILITY,
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
  title: trimmedOptional(FIELD_MAX.title),
  previouslyAble: trimmedOptional(FIELD_MAX.text),
  difficulty: trimmedOptional(FIELD_MAX.text),
  goal: trimmedOptional(FIELD_MAX.text),
  startedAt: isoDateOptional,
  situation: trimmedOptional(FIELD_MAX.text),
  memo: trimmedOptional(FIELD_MAX.longText),
  status: trimmedOptional(FIELD_MAX.statusLabel),
  progress: trimmedOptional(FIELD_MAX.text),
  nextAction: trimmedOptional(FIELD_MAX.text),
  visibility: z.enum(VISIBILITY).optional(),
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

// ---- Photo ----

export const photoMetaSchema = z.object({
  caption: trimmedOptional(FIELD_MAX.caption),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB

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

export const aiSummarizeSchema = z.object({
  experienceIds: z.array(z.string().uuid()).min(1).max(20),
});

export const aiNextStepSchema = z.object({
  roadId: z.string().uuid(),
});
