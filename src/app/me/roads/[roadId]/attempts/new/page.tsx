import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { AttemptForm } from "@/components/attempt-form";
import { IconNotebookPen } from "@/components/icons";

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
    // コンテナ幅・余白は「自分の道」詳細画面に合わせる。
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="space-y-3">
        <p className="text-sm">
          <Link href={`/me/roads/${roadId}`}>
            ← {road.difficulty ?? "道"} へ戻る
          </Link>
        </p>
        <h1 className="flex items-start gap-2 text-xl font-bold">
          <IconNotebookPen
            aria-hidden="true"
            className="mt-1 h-5 w-5 shrink-0 text-[var(--color-primary)]"
          />
          試したことを記録
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          うまくいったことも、いかなかったことも記録できます。どちらも次の誰かの役に立ちます。
        </p>
      </div>
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
