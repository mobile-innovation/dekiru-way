-- AlterTable
ALTER TABLE "attempts" ADD COLUMN     "achievement_percent" INTEGER,
ADD COLUMN     "feeling" TEXT,
ADD COLUMN     "next_action" TEXT,
ADD COLUMN     "previous_attempt_id" UUID,
ADD COLUMN     "state_after" TEXT;

-- CreateIndex
CREATE INDEX "attempts_previous_attempt_id_idx" ON "attempts"("previous_attempt_id");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_previous_attempt_id_fkey" FOREIGN KEY ("previous_attempt_id") REFERENCES "attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: できた％ は 0〜100 (本人入力・任意)
ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_achievement_percent_range"
  CHECK ("achievement_percent" IS NULL OR ("achievement_percent" >= 0 AND "achievement_percent" <= 100));

-- CheckConstraint: 前の Attempt に自分自身は指定できない
ALTER TABLE "attempts"
  ADD CONSTRAINT "attempts_previous_attempt_not_self"
  CHECK ("previous_attempt_id" IS NULL OR "previous_attempt_id" <> "id");
