import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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
      prisma.road.count(),
      prisma.attempt.count({ where: { isPublished: true } }),
      prisma.attempt.count({
        where: {
          isPublished: true,
          moderationStatus: ModerationStatus.approved,
          updatedAt: { gte: weekAgo },
        },
      }),
    ]);
  return {
    // 確認が必要な経験のうち「保留していない」件数と「保留している」件数。
    pendingActive,
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

export async function postList(opts: { status?: string; q?: string; page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const and: Prisma.AttemptWhereInput[] = [{ isPublished: true }];
  if (opts.status && STATUS_VALUES.has(opts.status)) {
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
  const audit = await prisma.adminAuditLog.findMany({
    where: { attemptId },
    orderBy: { createdAt: "desc" },
    include: { admin: { select: { email: true, displayName: true } } },
  });
  return { attempt, audit };
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
