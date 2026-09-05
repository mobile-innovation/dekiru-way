import { z } from "zod";
import { ModerationStatus } from "@prisma/client";

export const adminLoginSchema = z.object({
  email: z.string().trim().email("メールアドレスを入力してください").max(200),
  password: z.string().min(1, "パスワードを入力してください").max(200),
});

export const moderationActionSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).optional(),
});

export const postStatusSchema = z.object({
  moderationStatus: z.nativeEnum(ModerationStatus),
  note: z.string().trim().max(1000).optional(),
});
