import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { AttemptForm } from "@/components/attempt-form";
import { IconNotebookPen } from "@/components/icons";

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
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="space-y-3">
        <p className="text-sm">
          <Link href={`/me/roads/${roadId}`}>
            ← {road.title ?? road.difficulty ?? "道"} へ戻る
          </Link>
        </p>
        <h1 className="flex items-start gap-2 text-xl font-bold">
          <IconNotebookPen
            aria-hidden="true"
            className="mt-1 h-5 w-5 shrink-0 text-[var(--color-primary)]"
          />
          記録を編集
        </h1>
      </div>

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
