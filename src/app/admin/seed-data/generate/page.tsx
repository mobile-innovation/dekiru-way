import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { SeedDataGenerator } from "@/components/admin/seed-data-generator";

export const dynamic = "force-dynamic";

export default async function AdminSeedDataGeneratePage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/admin/seed-data" className="underline">
          ← 仮データ管理
        </Link>
      </p>
      <h1 className="text-lg font-bold">AIで仮データを生成</h1>
      <SeedDataGenerator />
    </div>
  );
}
