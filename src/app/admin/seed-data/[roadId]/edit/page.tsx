import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getSeedData } from "@/lib/admin/seed-data";
import { SeedDataEditForm } from "@/components/admin/seed-data-edit-form";
import type { SeedDraftValue } from "@/components/admin/seed-draft-fields";

export const dynamic = "force-dynamic";

export default async function AdminSeedDataEditPage({
  params,
}: {
  params: Promise<{ roadId: string }>;
}) {
  await requireAdmin();
  const { roadId } = await params;
  const data = await getSeedData(roadId);
  if (!data) notFound();

  const initial: SeedDraftValue = {
    difficulty: data.road.difficulty ?? "",
    previouslyAble: data.road.previouslyAble ?? "",
    goal: data.road.goal ?? "",
    situation: data.road.situation ?? "",
    startedAt: data.road.startedAt ?? "",
    memo: data.road.memo ?? "",
    status: data.road.status ?? "",
    progress: data.road.progress ?? "",
    nextAction: data.road.nextAction ?? "",
    method: data.attempt?.method ?? "",
    result: data.attempt?.result ?? "ongoing",
    triedAt: data.attempt?.triedAt ?? "",
    attemptMemo: data.attempt?.memo ?? "",
  };

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/admin/seed-data" className="underline">
          ← 仮データ管理
        </Link>
      </p>
      <h1 className="text-lg font-bold">仮データを編集</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        {data.publishState === "published"
          ? "この仮データは公開中です。編集内容はすぐに反映されます。"
          : "この仮データは非公開です。編集して保存できます。"}
      </p>
      <SeedDataEditForm roadId={roadId} initial={initial} />
    </div>
  );
}
