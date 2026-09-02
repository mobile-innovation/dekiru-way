import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { AttemptForm } from "@/components/attempt-form";
import { AttemptPhotos } from "@/components/attempt-photos";

export const metadata: Metadata = { title: "記録を編集" };

export default async function EditAttemptPage({
  params,
}: {
  params: Promise<{ roadId: string; attemptId: string }>;
}) {
  const { roadId, attemptId } = await params;
  const userId = await requirePageUserId();
  const road = await getMyRoad(userId, roadId);
  if (!road) notFound();
  const attempt = road.attempts.find((a) => a.id === attemptId);
  if (!attempt) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <p className="text-sm">
        <Link href={`/me/roads/${roadId}`}>← {road.title ?? road.difficulty ?? "道"} へ戻る</Link>
      </p>
      <h1 className="text-xl font-bold">記録を編集</h1>

      <AttemptPhotos attemptId={attempt.id} photos={attempt.photos} />
      <AttemptForm
        roadId={roadId}
        initialTags={road.tags}
        attempt={attempt}
        siblingAttempts={road.attempts.map((a) => ({
          id: a.id,
          method: a.method,
          triedAt: a.triedAt,
        }))}
      />
    </div>
  );
}
