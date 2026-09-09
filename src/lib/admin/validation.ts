import { z } from "zod";
import { ModerationStatus } from "@prisma/client";

export const adminLoginSchema = z.object({
  email: z.string().trim().email("メールアドレスを入力してください").max(200),
  password: z.string().min(1, "パスワードを入力してください").max(200),
});

export const moderationActionSchema = z.object({
  // approve / reject: 最終判断。hold / unhold: 「保留」= 公開できない記録として脇に置く / 戻す。
  action: z.enum(["approve", "reject", "hold", "unhold"]),
  note: z.string().trim().max(1000).optional(),
});

export const postStatusSchema = z.object({
  moderationStatus: z.nativeEnum(ModerationStatus),
  note: z.string().trim().max(1000).optional(),
});
