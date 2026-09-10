-- AlterTable
ALTER TABLE "roads" ADD COLUMN     "data_origin" TEXT NOT NULL DEFAULT 'user',
ADD COLUMN     "is_seed_data" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "roads_is_seed_data_idx" ON "roads"("is_seed_data");
