import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { RoadGrowForm } from "@/components/road-grow-form";
import { IconSprout } from "@/components/icons";

export const metadata: Metadata = { title: "道を育てる" };

/**
 * 道を育てる（2026-10-01「道を編集」と分離）。見た目・幅は「道を編集」「自分の道を作る」と同じ。
 * 役割は「今の状態・次の一歩の整理」。実際に試したことと結果は、道の詳細の「試したことを記録」（Attempt）で残す。
 */
export default async function GrowRoadPage({ params }: { params: Promise<{ roadId: string }> }) {
  const { roadId } = await params;
  const userId = await requirePageUserId();
  const road = await getMyRoad(userId, roadId);
  if (!road) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <p className="text-sm">
        <Link href={`/me/roads/${roadId}`}>← 道へ戻る</Link>
      </p>
      <div className="space-y-1">
        <h1 className="flex items-start gap-2 text-xl font-bold">
          <IconSprout
            aria-hidden="true"
            className="mt-1 h-5 w-5 shrink-0 text-[var(--color-primary)]"
          />
          道を育てる
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          今の状態や、これからの一歩を整理します。分かるところだけで大丈夫です。
        </p>
      </div>
      <RoadGrowForm road={road} />
    </div>
  );
}
