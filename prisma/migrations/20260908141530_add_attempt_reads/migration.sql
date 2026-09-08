-- CreateTable
CREATE TABLE "attempt_reads" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_reads_attempt_id_idx" ON "attempt_reads"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_reads_user_id_attempt_id_key" ON "attempt_reads"("user_id", "attempt_id");

-- AddForeignKey
ALTER TABLE "attempt_reads" ADD CONSTRAINT "attempt_reads_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_reads" ADD CONSTRAINT "attempt_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
