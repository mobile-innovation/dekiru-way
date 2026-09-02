import type { Metadata } from "next";
import Link from "next/link";
import { RoadForm } from "@/components/road-form";

export const metadata: Metadata = { title: "自分の道を作る" };

export default function NewRoadPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <p className="text-sm">
        <Link href="/me">← 自分の道の一覧へ戻る</Link>
      </p>
      <div className="space-y-1">
        <h1 className="text-xl font-bold">自分の道を作る</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          一度に全部書かなくて大丈夫です。あとから追加・修正できます。
        </p>
      </div>
      <RoadForm />
    </div>
  );
}
