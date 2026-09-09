-- 経験の「保留」= 運営が「今は公開できない」として脇に置いた記録。却下ではない。
-- 確認待ちキューの既定表示から外し、「保留している」タブでのみ見える。公開ゲートには無関係。

ALTER TABLE "attempts" ADD COLUMN "moderation_held" BOOLEAN NOT NULL DEFAULT false;
