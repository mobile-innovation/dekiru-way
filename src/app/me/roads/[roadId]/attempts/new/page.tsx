import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { AttemptForm } from "@/components/attempt-form";

export const metadata: Metadata = { title: "試したことを記録" };

export default async function NewAttemptPage({
  params,
}: {
  params: Promise<{ roadId: string }>;
}) {
  const { roadId } = await params;
  const userId = await requirePageUserId();
  const road = await getMyRoad(userId, roadId);
  if (!road) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <p className="text-sm">
        <Link href={`/me/roads/${roadId}`}>← {road.title ?? road.difficulty ?? "道"} へ戻る</Link>
      </p>
      <h1 className="text-xl font-bold">試したことを記録</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        うまくいったことも、いかなかったことも記録できます。どちらも次の誰かの役に立ちます。
      </p>
      <AttemptForm
        roadId={roadId}
        initialTags={road.tags}
        siblingAttempts={road.attempts.map((a) => ({
          id: a.id,
          method: a.method,
          triedAt: a.triedAt,
        }))}
      />
    </div>
  );
}
