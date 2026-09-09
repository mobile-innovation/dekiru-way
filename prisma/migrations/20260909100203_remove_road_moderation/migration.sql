-- 道 (Road) のモデレーションを廃止する。
-- 道が公開面に出るかは「承認済みの公開経験 (Attempt) を 1 つ以上持つか」だけで決まるようになった。

DROP INDEX IF EXISTS "roads_moderation_status_idx";
ALTER TABLE "roads" DROP CONSTRAINT IF EXISTS "roads_moderated_by_admin_id_fkey";

ALTER TABLE "roads"
  DROP COLUMN "moderation_status",
  DROP COLUMN "ai_verdict",
  DROP COLUMN "ai_reason",
  DROP COLUMN "ai_categories",
  DROP COLUMN "ai_checked_at",
  DROP COLUMN "moderated_by_admin_id",
  DROP COLUMN "moderated_at",
  DROP COLUMN "moderation_note";

-- 監査ログの道あて操作は今後発生しない。未リリース機能なので既存行も落とす。
DELETE FROM "admin_audit_logs" WHERE "road_id" IS NOT NULL;
DROP INDEX IF EXISTS "admin_audit_logs_road_id_idx";
ALTER TABLE "admin_audit_logs" DROP COLUMN "road_id";
