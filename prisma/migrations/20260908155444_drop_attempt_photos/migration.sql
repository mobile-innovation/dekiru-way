/*
  Warnings:

  - You are about to drop the `attempt_photos` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "attempt_photos" DROP CONSTRAINT "attempt_photos_attempt_id_fkey";

-- DropTable
DROP TABLE "attempt_photos";
