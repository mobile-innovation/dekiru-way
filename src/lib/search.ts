import { Prisma, ModerationStatus } from "@prisma/client";
import type { ExperienceQuery } from "@/lib/validation";

/**
 * 経験検索クエリの組み立て (指示書 13)。
 * 検索対象:
 *   roads.difficulty / roads.situation / roads.goal / roads.previously_able
 *   attempts.method / attempts.memo
 *   tags.name
 * 「経験」= 公開され (is_published = true)、かつ Attempt も 親 Road も
 * モデレーション承認済み (moderation_status = approved) のものだけ。
 *
 * MVP はキーワード (部分一致) + タグ + 結果。
 * 将来は pg_trgm / ベクトル類似検索へ差し替えられるよう、
 * where 生成をこの関数に閉じ込めておく。
 */

/** 公開面に出してよい Road の条件 (道の内容が承認済み)。 */
export const PUBLIC_ROAD_WHERE = {
  moderationStatus: ModerationStatus.approved,
} satisfies Prisma.RoadWhereInput;

/**
 * 公開面 (検索・経験詳細・タグ・道の見える化) に出してよい Attempt の条件。
 * 本人ビュー (/me/*, 自分の道) には使わない。
 * この 1 箇所を直せば公開ゲートが全経路で変わる。
 * 「投稿が公開かつ承認済み」かつ「その道も承認済み」の両方を満たすこと。
 */
export const PUBLIC_ATTEMPT_WHERE = {
  isPublished: true,
  moderationStatus: ModerationStatus.approved,
  road: { is: PUBLIC_ROAD_WHERE },
} satisfies Prisma.AttemptWhereInput;

export function buildExperienceWhere(q: Pick<ExperienceQuery, "q" | "result" | "tag">): Prisma.AttemptWhereInput {
  const and: Prisma.AttemptWhereInput[] = [{ ...PUBLIC_ATTEMPT_WHERE }];

  if (q.result) {
    and.push({ result: q.result });
  }

  if (q.tag) {
    and.push({
      road: { roadTags: { some: { tag: { name: { equals: q.tag, mode: "insensitive" } } } } },
    });
  }

  const term = q.q?.trim();
  if (term) {
    const contains = { contains: term, mode: "insensitive" as const };
    and.push({
      OR: [
        { method: contains },
        { memo: contains },
        { road: { is: { difficulty: contains } } },
        { road: { is: { situation: contains } } },
        { road: { is: { goal: contains } } },
        { road: { is: { previouslyAble: contains } } },
        { road: { is: { roadTags: { some: { tag: { name: contains } } } } } },
      ],
    });
  }

  return { AND: and };
}

export function buildExperienceOrderBy(
  sort: ExperienceQuery["sort"],
): Prisma.AttemptOrderByWithRelationInput[] {
  switch (sort) {
    case "tried":
      return [{ triedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
    case "helpful":
      // 投票機能はない。enum 宣言順 (success, partial, ...) を「前向きな結果を先に」の近似として使う。
      return [{ result: "asc" }, { createdAt: "desc" }];
    case "recent":
    default:
      return [{ createdAt: "desc" }];
  }
}

/** 経験詳細/一覧で共通して読む関連 (非公開 Attempt は含めない)。 */
export const experienceInclude = {
  photos: true,
  road: { include: { roadTags: { include: { tag: true } } } },
} satisfies Prisma.AttemptInclude;

/**
 * 検索語が「ページ（Road）側の内容」= できなくなった / やりたいこと / 場面 / 以前できていた /
 * タグ に当たる道だけ (指示「ワードがページの内容なら、ページ内容をカードで表示」)。
 * 検索語が無いときは（ふつうの一覧）「公開 Attempt を 1 つ以上持つ道」全部。
 */
export function buildRoadLevelSearchWhere(
  q: Pick<ExperienceQuery, "q" | "result" | "tag">,
): Prisma.RoadWhereInput {
  const publishedAttempt: Prisma.AttemptWhereInput = { ...PUBLIC_ATTEMPT_WHERE };
  if (q.result) publishedAttempt.result = q.result;

  const and: Prisma.RoadWhereInput[] = [
    { ...PUBLIC_ROAD_WHERE },
    { attempts: { some: publishedAttempt } },
  ];

  if (q.tag) {
    and.push({
      roadTags: { some: { tag: { name: { equals: q.tag, mode: "insensitive" } } } },
    });
  }

  const term = q.q?.trim();
  if (term) {
    const contains = { contains: term, mode: "insensitive" as const };
    and.push({
      OR: [
        { difficulty: contains },
        { situation: contains },
        { goal: contains },
        { previouslyAble: contains },
        { roadTags: { some: { tag: { name: contains } } } },
      ],
    });
  }

  return { AND: and };
}

/**
 * 検索語が「方法（Attempt）の中」= 試したこと本文 / 気づき に当たる公開 Attempt だけ
 * (指示「方法内で見つかった場合、方法の内容をカードで表示」)。
 * 検索語が無ければ空条件では返さない前提（呼び出し側で q 有無を判定）。
 */
export function buildMethodSearchWhere(
  q: Pick<ExperienceQuery, "q" | "result" | "tag">,
): Prisma.AttemptWhereInput {
  const and: Prisma.AttemptWhereInput[] = [{ ...PUBLIC_ATTEMPT_WHERE }];

  if (q.result) and.push({ result: q.result });
  if (q.tag) {
    and.push({
      road: { roadTags: { some: { tag: { name: { equals: q.tag, mode: "insensitive" } } } } },
    });
  }

  const term = q.q?.trim();
  if (term) {
    const contains = { contains: term, mode: "insensitive" as const };
    and.push({ OR: [{ method: contains }, { memo: contains }] });
  }

  return { AND: and };
}
