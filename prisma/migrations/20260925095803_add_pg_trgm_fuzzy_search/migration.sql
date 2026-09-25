-- 表記ゆれに強い検索 (pg_trgm、AI・外部サービス不使用)。
-- 公式 postgres イメージに標準同梱されているため、追加インストール不要。
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 通常のキーワード検索 (ILIKE) で 0 件のときだけ、類似度検索のフォールバックに使う。
-- GIN + gin_trgm_ops で similarity() / % 演算子を高速化する。
CREATE INDEX IF NOT EXISTS "roads_difficulty_trgm_idx" ON "roads" USING GIN ("difficulty" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "roads_situation_trgm_idx" ON "roads" USING GIN ("situation" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "roads_goal_trgm_idx" ON "roads" USING GIN ("goal" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "roads_previously_able_trgm_idx" ON "roads" USING GIN ("previously_able" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "attempts_method_trgm_idx" ON "attempts" USING GIN ("method" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "attempts_memo_trgm_idx" ON "attempts" USING GIN ("memo" gin_trgm_ops);
