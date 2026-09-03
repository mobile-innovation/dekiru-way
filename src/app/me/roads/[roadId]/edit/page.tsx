import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUserId } from "@/lib/session";
import { getMyRoad } from "@/lib/queries";
import { RoadEditForm } from "@/components/road-edit-form";

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
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <p className="text-sm">
        <Link href={`/me/roads/${roadId}`}>← 道へ戻る</Link>
      </p>
      <h1 className="text-xl font-bold">道を編集</h1>
      <RoadEditForm road={road} />
    </div>
  );
}
