-- 道は公開前提。公開 / 非公開の設定（roads.visibility）を廃止する。
-- 公開面の出し分けはモデレーション状態 (moderation_status) が担っており、visibility は
-- どの公開ゲートにも使われていない（将来フラグとして保持していただけ）。

-- DropIndex
DROP INDEX IF EXISTS "roads_visibility_idx";

-- AlterTable
ALTER TABLE "roads" DROP COLUMN "visibility";

-- DropEnum
DROP TYPE "Visibility";
