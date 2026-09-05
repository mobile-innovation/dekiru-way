import { ModerationStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * 管理画面の読み取りクエリ。すべて呼び出し側で requireAdmin 済みの前提。
 */

const PAGE_SIZE = 20;

export async function dashboardStats() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [
    pending,
    approved,
    rejected,
    roadPending,
    roadRejected,
    users,
    roads,
    publishedAttempts,
    recentApproved,
  ] = await Promise.all([
    prisma.attempt.count({ where: { isPublished: true, moderationStatus: ModerationStatus.pending } }),
    prisma.attempt.count({ where: { isPublished: true, moderationStatus: ModerationStatus.approved } }),
    prisma.attempt.count({ where: { isPublished: true, moderationStatus: ModerationStatus.rejected } }),
    prisma.road.count({ where: { moderationStatus: ModerationStatus.pending } }),
    prisma.road.count({ where: { moderationStatus: ModerationStatus.rejected } }),
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
    pending,
    approved,
    rejected,
    roadPending,
    roadRejected,
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
      select: { id: true, title: true, difficulty: true, createdAt: true },
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
        road: { select: { title: true, difficulty: true } },
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
      text: `道が作られました：${clip(r.title ?? r.difficulty ?? "（無題の道）")}`,
      href: `/admin/roads/${r.id}`,
    })),
    ...attempts.map((a) => {
      const at = a.moderatedAt ?? a.aiCheckedAt ?? a.updatedAt;
      const name = clip(a.road.title ?? a.road.difficulty ?? a.method);
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
  createdAt: true,
  updatedAt: true,
  road: { select: { id: true, title: true, difficulty: true, goal: true } },
} satisfies Prisma.AttemptSelect;

export async function moderationQueue(opts: { verdict?: "ng" | "unknown"; page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.AttemptWhereInput = {
    isPublished: true,
    moderationStatus: ModerationStatus.pending,
    ...(opts.verdict ? { aiVerdict: opts.verdict } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.attempt.count({ where }),
    prisma.attempt.findMany({
      where,
      select: attemptCardSelect,
      orderBy: { updatedAt: "asc" }, // 古い (待たせている) ものから
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
      photos: { orderBy: { sortOrder: "asc" } },
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

// ---- 道 (Road) のモデレーション ----

const roadCardSelect = {
  id: true,
  title: true,
  difficulty: true,
  goal: true,
  situation: true,
  moderationStatus: true,
  aiVerdict: true,
  aiReason: true,
  aiCategories: true,
  aiCheckedAt: true,
  moderatedAt: true,
  moderationNote: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { attempts: { where: { isPublished: true } } } },
} satisfies Prisma.RoadSelect;

export async function roadModerationQueue(
  opts: { verdict?: "ng" | "unknown"; page?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.RoadWhereInput = {
    moderationStatus: ModerationStatus.pending,
    ...(opts.verdict ? { aiVerdict: opts.verdict } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.road.count({ where }),
    prisma.road.findMany({
      where,
      select: roadCardSelect,
      orderBy: { updatedAt: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total };
}

export async function roadList(opts: { status?: string; q?: string; page?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const and: Prisma.RoadWhereInput[] = [];
  if (opts.status && STATUS_VALUES.has(opts.status)) {
    and.push({ moderationStatus: opts.status as ModerationStatus });
  }
  const term = opts.q?.trim();
  if (term) {
    const contains = { contains: term, mode: "insensitive" as const };
    and.push({
      OR: [{ title: contains }, { difficulty: contains }, { goal: contains }, { situation: contains }],
    });
  }
  const where: Prisma.RoadWhereInput = and.length ? { AND: and } : {};
  const [total, items] = await Promise.all([
    prisma.road.count({ where }),
    prisma.road.findMany({
      where,
      select: roadCardSelect,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { items, total, page, pageSize: PAGE_SIZE, hasMore: page * PAGE_SIZE < total };
}

export async function roadDetail(roadId: string) {
  const road = await prisma.road.findUnique({
    where: { id: roadId },
    include: {
      roadTags: { include: { tag: true } },
      attempts: {
        select: { id: true, method: true, result: true, isPublished: true, moderationStatus: true },
        orderBy: { createdAt: "asc" },
      },
      moderatedByAdmin: { select: { id: true, email: true, displayName: true } },
    },
  });
  if (!road) return null;
  const audit = await prisma.adminAuditLog.findMany({
    where: { roadId },
    orderBy: { createdAt: "desc" },
    include: { admin: { select: { email: true, displayName: true } } },
  });
  return { road, audit };
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
