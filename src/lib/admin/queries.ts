import { ModerationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { publicAttemptSql } from "@/lib/search";

/**
 * 管理画面の読み取りクエリ。すべて呼び出し側で requireAdmin 済みの前提。
 */

const PAGE_SIZE = 20;

export async function dashboardStats() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [pendingActive, pendingHeld, approved, rejected, users, roads, publishedAttempts, recentApproved] =
    await Promise.all([
      prisma.attempt.count({
        where: { isPublished: true, moderationStatus: ModerationStatus.pending, moderationHeld: false },
      }),
      prisma.attempt.count({
        where: { isPublished: true, moderationStatus: ModerationStatus.pending, moderationHeld: true },
      }),
      prisma.attempt.count({
        where: { isPublished: true, moderationStatus: ModerationStatus.approved },
      }),
      prisma.attempt.count({
        where: { isPublished: true, moderationStatus: ModerationStatus.rejected },
      }),
      prisma.user.count(),
      // 実データの「道」だけを数える。仮データ (管理者が作ったサンプル) は含めない。
      prisma.road.count({ where: { isSeedData: false } }),
      prisma.attempt.count({ where: { isPublished: true } }),
      prisma.attempt.count({
        where: {
          isPublished: true,
          moderationStatus: ModerationStatus.approved,
          updatedAt: { gte: weekAgo },
        },
      }),
    ]);
  // 承認後に道が編集された公開中の経験 (道は審査しないので運営が見つけて AI 再チェックする)。
  const roadEditedAfterApproval = (await roadEditedAfterReview()).length;
  return {
    // 確認が必要な経験のうち「保留していない」件数と「保留している」件数。
    pendingActive,
    roadEditedAfterApproval,
    pendingHeld,
    approved,
    rejected,
    users,
    roads,
    publishedAttempts,
    recentApproved,
  };
}

/**
 * 「最近の動き」。実データのみ (道の作成 / 経験の公開・停止判断) を時系列でまとめる。
 * 架空のイベントは作らない。
 */
export async function recentActivity(limit = 8) {
  const [roads, attempts] = await Promise.all([
    prisma.road.findMany({
      // 仮データの作成は「最近の動き」に出さない (10 件生成で埋まらないように)。
      where: { isSeedData: false },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: { id: true, difficulty: true, createdAt: true },
    }),
    prisma.attempt.findMany({
      where: { isPublished: true },
      orderBy: { updatedAt: "desc" },
      take: limit + 5,
      select: {
        id: true,
        method: true,
        updatedAt: true,
        aiCheckedAt: true,
        moderatedAt: true,
        moderationStatus: true,
        road: { select: { difficulty: true } },
      },
    }),
  ]);

  const clip = (s: string, max = 28) =>
    s.length > max ? `${s.slice(0, max)}…` : s;

  type Activity = { kind: "road_created" | "experience"; at: Date; text: string; href: string };
  const items: Activity[] = [
    ...roads.map((r) => ({
      kind: "road_created" as const,
      at: r.createdAt,
      text: `道が作られました：${clip(r.difficulty ?? "（無題の道）")}`,
      href: `/admin/posts?q=${encodeURIComponent(r.difficulty ?? "")}`,
    })),
    ...attempts.map((a) => {
      const at = a.moderatedAt ?? a.aiCheckedAt ?? a.updatedAt;
      const name = clip(a.road.difficulty ?? a.method);
      const text =
        a.moderationStatus === ModerationStatus.approved
          ? `経験が公開されました：${name}`
          : a.moderationStatus === ModerationStatus.rejected
            ? `経験の公開を停止しました：${name}`
            : `経験が確認待ちになりました：${name}`;
      return { kind: "experience" as const, at, text, href: `/admin/posts/${a.id}` };
    }),
  ];
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  return items.slice(0, limit);
}

const attemptCardSelect = {
  id: true,
  method: true,
  memo: true,
  result: true,
  isPublished: true,
  moderationStatus: true,
  aiVerdict: true,
  aiReason: true,
  aiCategories: true,
  aiCheckedAt: true,
  moderatedAt: true,
  moderationNote: true,
  moderationHeld: true,
  createdAt: true,
  updatedAt: true,
  road: { select: { id: true, difficulty: true, goal: true } },
} satisfies Prisma.AttemptSelect;

export async function moderationQueue(
  opts: { verdict?: "ng" | "unknown"; page?: number; held?: boolean } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.AttemptWhereInput = {
    isPublished: true,
    moderationStatus: ModerationStatus.pending,
    // 既定は「保留していない」= moderationHeld:false。held:true で「保留している」一覧。
    moderationHeld: opts.held ?? false,
    ...(opts.verdict ? { aiVerdict: opts.verdict } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      select: attemptCardSelect,
      orderBy: { updatedAt: "desc" }, // 新しい順
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total };
}

const STATUS_VALUES = new Set<string>(Object.values(ModerationStatus));

/** 経験一覧の「承認後に道が編集された」絞り込みの status 値 (ModerationStatus とは別の擬似値)。 */
export const ROAD_EDITED_FILTER = "road-edited";

export async function postList(opts: { status?: string; q?: string; page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const and: Prisma.AttemptWhereInput[] = [{ isPublished: true }];
  if (opts.status === ROAD_EDITED_FILTER) {
    const edited = await roadEditedAfterReview();
    and.push({ id: { in: edited.map((e) => e.attemptId) } });
  } else if (opts.status && STATUS_VALUES.has(opts.status)) {
    and.push({ moderationStatus: opts.status as ModerationStatus });
  }
  const term = opts.q?.trim();
  if (term) {
    const contains = { contains: term, mode: "insensitive" as const };
    and.push({
      OR: [
        { method: contains },
        { memo: contains },
        { road: { is: { difficulty: contains } } },
        { road: { is: { goal: contains } } },
      ],
    });
  }
  const where: Prisma.AttemptWhereInput = { AND: and };
  const [total, items] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      select: attemptCardSelect,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total };
}

export async function postDetail(attemptId: string) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      road: { include: { roadTags: { include: { tag: true } } } },
      moderatedByAdmin: { select: { id: true, email: true, displayName: true } },
    },
  });
  if (!attempt) return null;
  const [audit, [roadEdited = null]] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where: { attemptId },
      orderBy: { createdAt: "desc" },
      include: { admin: { select: { email: true, displayName: true } } },
    }),
    roadEditedAfterReview({ attemptId }),
  ]);
  return { attempt, audit, roadEdited };
}

/**
 * 承認後の道の編集とみなさない猶予 (秒)。経験が承認されると `bumpRoadUpdatedAt` が道の
 * `updatedAt` を進めるので、承認 (AI 判定・運営判断) からこの秒数以内の道の更新は編集として扱わない。
 */
export const ROAD_EDIT_GRACE_SECONDS = 5;

/** 経験を最後に確認した時刻 (AI 判定・運営判断の新しい方。どちらも無い AI 無効時の承認は updated_at)。 */
const reviewedAtSql = (alias: "a" | "s") =>
  Prisma.raw(
    `COALESCE(GREATEST(${alias}.ai_checked_at, ${alias}.moderated_at), ${alias}.updated_at)`,
  );

export interface RoadEditedAfterReview {
  attemptId: string;
  roadUpdatedAt: Date;
  reviewedAt: Date;
}

/**
 * 「承認後に道が編集された」公開中・承認済みの経験 (2026-10-08 H-2 の見直し)。
 * 道は審査しないので、運営が見つけて AI 再チェックできるようにするための一覧。DB 変更なしで
 * `roads.updated_at` と経験の最終確認時刻を比べる近似:
 *   - 道の updated_at が、その経験の最終確認時刻より猶予以上あと
 *   - かつ、その更新が同じ道のいずれかの公開中・承認済み経験の承認時刻 ± 猶予に重ならない
 *     (= 承認に伴う `bumpRoadUpdatedAt` ではない)
 *   - 仮データの道は対象外
 * 誤検知: memo / status / startedAt だけの編集や、値を変えない保存も「編集」として出る。
 * 見逃し: 道の編集後に同じ道の別の経験が承認されると updated_at が上書きされて消える
 * (その場合、編集後の道の記述はその経験の AI 審査本文で一度見られている)。
 * AI 再チェックや運営判断で最終確認時刻が進むと一覧から外れる。
 */
export async function roadEditedAfterReview(
  opts: { attemptId?: string } = {},
): Promise<RoadEditedAfterReview[]> {
  const grace = Prisma.raw(`interval '${ROAD_EDIT_GRACE_SECONDS} seconds'`);
  const onlyAttempt = opts.attemptId
    ? Prisma.sql`AND a.id = ${opts.attemptId}::uuid`
    : Prisma.empty;
  return prisma.$queryRaw<RoadEditedAfterReview[]>(Prisma.sql`
    SELECT a.id AS "attemptId", r.updated_at AS "roadUpdatedAt", ${reviewedAtSql("a")} AS "reviewedAt"
    FROM attempts a
    JOIN roads r ON r.id = a.road_id
    WHERE ${publicAttemptSql("a")}
      AND r.is_seed_data = false
      ${onlyAttempt}
      AND r.updated_at > ${reviewedAtSql("a")} + ${grace}
      AND NOT EXISTS (
        SELECT 1 FROM attempts s
        WHERE s.road_id = a.road_id
          AND ${publicAttemptSql("s")}
          AND r.updated_at BETWEEN ${reviewedAtSql("s")} - ${grace} AND ${reviewedAtSql("s")} + ${grace}
      )
    ORDER BY r.updated_at DESC
  `);
}

export async function auditLog(opts: { page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const [total, items] = await Promise.all([
    prisma.adminAuditLog.count(),
    prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      include: { admin: { select: { email: true, displayName: true } } },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total };
}
