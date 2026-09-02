import type { Attempt, AttemptPhoto, Road, RoadTag, Tag } from "@prisma/client";

/**
 * Prisma モデル → API DTO 変換。
 * - 日付は ISO 文字列 (DATE 型は YYYY-MM-DD)
 * - キーは camelCase
 */

function dateOnly(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export type PhotoDTO = ReturnType<typeof serializePhoto>;
export function serializePhoto(p: AttemptPhoto) {
  return {
    id: p.id,
    storageUrl: p.storageUrl,
    caption: p.caption,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
  };
}

type AttemptWithPhotos = Attempt & { photos?: AttemptPhoto[] };

export type AttemptDTO = ReturnType<typeof serializeAttempt>;
export function serializeAttempt(a: AttemptWithPhotos) {
  return {
    id: a.id,
    roadId: a.roadId,
    method: a.method,
    result: a.result,
    triedAt: dateOnly(a.triedAt),
    memo: a.memo,
    isPublished: a.isPublished,
    // v6: できた％ / 気持ち / その後 / 次に試すこと / 前の Attempt
    achievementPercent: a.achievementPercent,
    feeling: a.feeling,
    stateAfter: a.stateAfter,
    nextAction: a.nextAction,
    previousAttemptId: a.previousAttemptId,
    photos: (a.photos ?? [])
      .slice()
      .sort((x, y) => x.sortOrder - y.sortOrder || x.createdAt.getTime() - y.createdAt.getTime())
      .map(serializePhoto),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

type RoadFull = Road & {
  roadTags?: (RoadTag & { tag: Tag })[];
  attempts?: AttemptWithPhotos[];
};

export function roadTagNames(road: RoadFull): string[] {
  return (road.roadTags ?? []).map((rt) => rt.tag.name).sort((a, b) => a.localeCompare(b, "ja"));
}

export type RoadDTO = ReturnType<typeof serializeRoad>;
export function serializeRoad(road: RoadFull) {
  const attempts = (road.attempts ?? [])
    .slice()
    .sort(sortAttemptsChronologically)
    .map(serializeAttempt);
  return {
    id: road.id,
    title: road.title,
    previouslyAble: road.previouslyAble,
    difficulty: road.difficulty,
    goal: road.goal,
    startedAt: dateOnly(road.startedAt),
    situation: road.situation,
    memo: road.memo,
    status: road.status,
    progress: road.progress,
    nextAction: road.nextAction,
    visibility: road.visibility,
    tags: roadTagNames(road),
    attempts,
    attemptCount: road.attempts ? attempts.length : undefined,
    createdAt: road.createdAt.toISOString(),
    updatedAt: road.updatedAt.toISOString(),
  };
}

/** 時系列: tried_at (あれば) → created_at の昇順。「ここまで試した」が追える順 (指示書 7)。 */
type Chronological = { triedAt: Date | null; createdAt: Date };
export function sortAttemptsChronologically(a: Chronological, b: Chronological): number {
  const ax = a.triedAt?.getTime() ?? a.createdAt.getTime();
  const bx = b.triedAt?.getTime() ?? b.createdAt.getTime();
  return ax - bx || a.createdAt.getTime() - b.createdAt.getTime();
}

/**
 * 公開 Attempt を「経験」DTO に変換する。
 * 親 Road の記述フィールドは文脈として含めるが、
 * 同じ Road の非公開 Attempt は絶対に含めない (指示書 5/14)。
 */
type ExperienceRow = Attempt & {
  photos?: AttemptPhoto[];
  road: Road & { roadTags?: (RoadTag & { tag: Tag })[] };
};

export interface ExperienceSibling {
  id: string;
  method: string;
  result: string;
  triedAt: string | null;
  isCurrent: boolean;
  /** その方法での気づき (Attempt.memo)。全方法を詳細画面にそのまま表示するため siblings にも持たせる */
  note: string | null;
  achievementPercent: number | null;
  feeling: string | null;
  stateAfter: string | null;
  nextAction: string | null;
  /** 実際にこの方法の前に試した Attempt (同じ Road 内)。UI の因果表示に使う */
  previousAttemptId: string | null;
}

export interface ExperienceDTO {
  id: string;
  method: string;
  result: string;
  triedAt: string | null;
  memo: string | null;
  achievementPercent: number | null;
  feeling: string | null;
  stateAfter: string | null;
  nextAction: string | null;
  previousAttemptId: string | null;
  photos: PhotoDTO[];
  createdAt: string;
  road: {
    previouslyAble: string | null;
    difficulty: string | null;
    goal: string | null;
    situation: string | null;
    progress: string | null;
    nextAction: string | null;
    startedAt: string | null;
    tags: string[];
  };
  /** 「道の見える化」(指示書 6-④)。詳細取得時のみ入る。 */
  siblings?: ExperienceSibling[];
}

export function serializeExperience(
  row: ExperienceRow,
  opts?: { siblings?: ExperienceRow[] },
): ExperienceDTO {
  const dto: ExperienceDTO = {
    id: row.id,
    method: row.method,
    result: row.result,
    triedAt: dateOnly(row.triedAt),
    memo: row.memo,
    achievementPercent: row.achievementPercent,
    feeling: row.feeling,
    stateAfter: row.stateAfter,
    nextAction: row.nextAction,
    previousAttemptId: row.previousAttemptId,
    photos: (row.photos ?? [])
      .slice()
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map(serializePhoto),
    createdAt: row.createdAt.toISOString(),
    road: {
      // 本人特定につながる自由記述の生データは出すが、氏名等はスキーマ上そもそも持たない
      previouslyAble: row.road.previouslyAble,
      difficulty: row.road.difficulty,
      goal: row.road.goal,
      situation: row.road.situation,
      progress: row.road.progress,
      nextAction: row.road.nextAction,
      startedAt: dateOnly(row.road.startedAt),
      tags: (row.road.roadTags ?? [])
        .map((rt) => rt.tag.name)
        .sort((a, b) => a.localeCompare(b, "ja")),
    },
  };
  if (opts?.siblings) {
    dto.siblings = opts.siblings
      .slice()
      .sort(sortAttemptsChronologically)
      .map((s) => ({
        id: s.id,
        method: s.method,
        result: s.result,
        triedAt: dateOnly(s.triedAt),
        isCurrent: s.id === row.id,
        note: s.memo,
        achievementPercent: s.achievementPercent,
        feeling: s.feeling,
        stateAfter: s.stateAfter,
        nextAction: s.nextAction,
        previousAttemptId: s.previousAttemptId,
      }));
  }
  return dto;
}
