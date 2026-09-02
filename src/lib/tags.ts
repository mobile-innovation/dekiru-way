import { prisma } from "@/lib/db";

/**
 * Road に付けるタグ名の配列を受け取り、Tag を upsert して RoadTag を同期する。
 * タグ名は正規化 (trim / 連続空白を1つ) してから扱う。
 */
export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 30);
}

export async function syncRoadTags(roadId: string, names: string[] | undefined): Promise<void> {
  if (names === undefined) return; // 指定なし = 変更しない

  const wanted = Array.from(
    new Set(names.map(normalizeTagName).filter((n) => n.length > 0)),
  );

  const tags = await Promise.all(
    wanted.map((name) =>
      prisma.tag.upsert({ where: { name }, create: { name }, update: {} }),
    ),
  );
  const wantedIds = new Set(tags.map((t) => t.id));

  const existing = await prisma.roadTag.findMany({ where: { roadId }, select: { tagId: true } });
  const existingIds = new Set(existing.map((e) => e.tagId));

  const toAdd = [...wantedIds].filter((id) => !existingIds.has(id));
  const toRemove = [...existingIds].filter((id) => !wantedIds.has(id));

  await prisma.$transaction([
    ...(toRemove.length
      ? [prisma.roadTag.deleteMany({ where: { roadId, tagId: { in: toRemove } } })]
      : []),
    ...toAdd.map((tagId) => prisma.roadTag.create({ data: { roadId, tagId } })),
  ]);
}
