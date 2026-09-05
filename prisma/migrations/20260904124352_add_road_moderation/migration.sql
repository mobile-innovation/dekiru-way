-- AlterTable
ALTER TABLE "admin_audit_logs" ADD COLUMN     "road_id" UUID;

-- AlterTable
ALTER TABLE "roads" ADD COLUMN     "ai_categories" TEXT[],
ADD COLUMN     "ai_checked_at" TIMESTAMP(3),
ADD COLUMN     "ai_reason" TEXT,
ADD COLUMN     "ai_verdict" TEXT,
ADD COLUMN     "moderated_at" TIMESTAMP(3),
ADD COLUMN     "moderated_by_admin_id" UUID,
ADD COLUMN     "moderation_note" TEXT,
ADD COLUMN     "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending';

-- 既存の道はモデレーション導入前に作られたもの。今までどおり見え続けるよう approved にする。
-- 新規行の DB デフォルトは pending のまま。
UPDATE "roads" SET "moderation_status" = 'approved';

-- CreateIndex
CREATE INDEX "admin_audit_logs_road_id_idx" ON "admin_audit_logs"("road_id");

-- CreateIndex
CREATE INDEX "roads_moderation_status_idx" ON "roads"("moderation_status");

-- AddForeignKey
ALTER TABLE "roads" ADD CONSTRAINT "roads_moderated_by_admin_id_fkey" FOREIGN KEY ("moderated_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
