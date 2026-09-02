/** "YYYY-MM-DD" | null | undefined を Prisma の DATE 入力へ変換する。 */
export function toDbDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined; // フィールド未指定 = 変更しない
  if (value === null || value === "") return null;
  return new Date(`${value}T00:00:00.000Z`);
}
