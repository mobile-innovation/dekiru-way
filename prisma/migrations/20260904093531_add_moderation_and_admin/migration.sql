-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "ai_categories" TEXT[],
ADD COLUMN     "ai_checked_at" TIMESTAMP(3),
ADD COLUMN     "ai_reason" TEXT,
ADD COLUMN     "ai_verdict" TEXT,
ADD COLUMN     "moderated_at" TIMESTAMP(3),
ADD COLUMN     "moderated_by_admin_id" UUID,
ADD COLUMN     "moderation_note" TEXT,
ADD COLUMN     "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending';

-- 既存の公開投稿はモデレーション導入前に公開されたもの。今までどおり見え続けるよう
-- approved にバックフィルする。新規行の DB デフォルトは pending のまま。
UPDATE "attempts" SET "moderation_status" = 'approved' WHERE "is_published" = true;

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "attempt_id" UUID,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "admin_audit_logs_attempt_id_idx" ON "admin_audit_logs"("attempt_id");

-- CreateIndex
CREATE INDEX "attempts_moderation_status_idx" ON "attempts"("moderation_status");

-- CreateIndex
CREATE INDEX "attempts_is_published_moderation_status_idx" ON "attempts"("is_published", "moderation_status");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_moderated_by_admin_id_fkey" FOREIGN KEY ("moderated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
