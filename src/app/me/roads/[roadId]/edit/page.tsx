import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { RoadEditForm } from "@/components/road-edit-form";
import { IconSprout } from "@/components/icons";

export const metadata: Metadata = { title: "道を編集" };

export default async function EditRoadPage({
  params,
}: {
  params: Promise<{ roadId: string }>;
}) {
  const { roadId } = await params;
  const userId = await requirePageUserId();
  const road = await getMyRoad(userId, roadId);
  if (!road) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="space-y-3">
        <p className="text-sm">
          <Link href={`/me/roads/${roadId}`}>← 道へ戻る</Link>
        </p>
        <h1 className="flex items-start gap-2 text-xl font-bold">
          <IconSprout
            aria-hidden="true"
            className="mt-1 h-5 w-5 shrink-0 text-[var(--color-primary)]"
          />
          道を編集
        </h1>
      </div>
      <RoadEditForm road={road} />
    </div>
  );
}
