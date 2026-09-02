-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('success', 'partial', 'no_change', 'failed', 'ongoing');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "google_sub" TEXT NOT NULL,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT,
    "previously_able" TEXT,
    "difficulty" TEXT,
    "goal" TEXT,
    "started_at" DATE,
    "situation" TEXT,
    "memo" TEXT,
    "status" TEXT,
    "progress" TEXT,
    "next_action" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "road_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "result" "AttemptResult" NOT NULL,
    "tried_at" DATE,
    "memo" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_photos" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "storage_url" TEXT NOT NULL,
    "caption" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_tags" (
    "road_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "road_tags_pkey" PRIMARY KEY ("road_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "roads_user_id_idx" ON "roads"("user_id");

-- CreateIndex
CREATE INDEX "roads_visibility_idx" ON "roads"("visibility");

-- CreateIndex
CREATE INDEX "roads_created_at_idx" ON "roads"("created_at");

-- CreateIndex
CREATE INDEX "roads_updated_at_idx" ON "roads"("updated_at");

-- CreateIndex
CREATE INDEX "attempts_road_id_idx" ON "attempts"("road_id");

-- CreateIndex
CREATE INDEX "attempts_result_idx" ON "attempts"("result");

-- CreateIndex
CREATE INDEX "attempts_is_published_idx" ON "attempts"("is_published");

-- CreateIndex
CREATE INDEX "attempts_tried_at_idx" ON "attempts"("tried_at");

-- CreateIndex
CREATE INDEX "attempt_photos_attempt_id_idx" ON "attempt_photos"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "tags_name_idx" ON "tags"("name");

-- CreateIndex
CREATE INDEX "road_tags_tag_id_idx" ON "road_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "roads" ADD CONSTRAINT "roads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_road_id_fkey" FOREIGN KEY ("road_id") REFERENCES "roads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_photos" ADD CONSTRAINT "attempt_photos_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_tags" ADD CONSTRAINT "road_tags_road_id_fkey" FOREIGN KEY ("road_id") REFERENCES "roads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_tags" ADD CONSTRAINT "road_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
