-- 道 (Road) の title を廃止する。
-- 本人向けの一覧見出しも「できなくなったこと」(difficulty) に一本化した。
-- title 用のローカル AI 見出し生成サブシステムも撤去済み。

ALTER TABLE "roads" DROP COLUMN "title";
