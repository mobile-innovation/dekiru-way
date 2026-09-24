import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { SeedMarkdownImporter } from "@/components/admin/seed-markdown-importer";

export const dynamic = "force-dynamic";

export default async function AdminSeedDataImportMarkdownPage() {
  await requireAdmin();
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/admin/seed-data" className="underline">
          ← 仮データ管理
        </Link>
      </p>
      <h1 className="text-lg font-bold">Markdownから仮データを取り込む</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        ChatGPT等で作成したMarkdownを貼り付けて、1つの道に複数の「試したこと」をまとめて取り込みます。
      </p>
      <SeedMarkdownImporter />
    </div>
  );
}
