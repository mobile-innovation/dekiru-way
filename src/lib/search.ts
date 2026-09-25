import { Prisma, ModerationStatus } from "@prisma/client";
import type { ExperienceQuery } from "@/lib/validation";

/**
 * 経験検索クエリの組み立て (指示書 13)。
 * 検索対象:
 *   roads.difficulty / roads.situation / roads.goal / roads.previously_able
 *   attempts.method / attempts.memo
 *   tags.name
 * 「経験」= 公開され (is_published = true)、かつ Attempt が
 * モデレーション承認済み (moderation_status = approved) のものだけ。
 * 道 (Road) 自体はモデレーション状態を持たない。道が公開面に出るかは
 * 「承認済みの公開 Attempt を 1 つ以上持つか」だけで決まる。
 *
 * MVP はキーワード (部分一致) + タグ + 結果。
 * 検索AI Phase 1 では、AI が展開した複数語 (`opts.terms`) を受け取り、
 * 同じ対象カラムに対する OR を語ごとに増やす（1 語のときは従来と完全に同じ where）。
 * 将来 (Phase 2) は pg_trgm / ベクトル類似検索へ差し替えられるよう、
 * where 生成をこの関数に閉じ込めておく。
 */

/**
 * 公開面 (検索・経験詳細・タグ・道の見える化) に出してよい Attempt の条件。
 * 本人ビュー (/me/*, 自分の道) には使わない。
 * この 1 箇所を直せば公開ゲートが全経路で変わる。
 */
export const PUBLIC_ATTEMPT_WHERE = {
  isPublished: true,
  moderationStatus: ModerationStatus.approved,
} satisfies Prisma.AttemptWhereInput;

type SearchQ = Pick<ExperienceQuery, "q" | "result" | "tag" | "read">;

/**
 * 検索AI Phase 1: AI が展開した検索語。未指定なら `q.q` 単独で従来どおり。
 * `ids`: 表記ゆれ検索 (pg_trgm) で既に絞り込んだ id 一覧。指定時は `terms`/`q.q` による
 * ILIKE 条件を使わず、この id 一覧への絞り込みだけを行う（呼び出し側が候補を確定済みのため）。
 */
export type TermOpts = { terms?: string[]; ids?: string[] };

const WHITESPACE_SPLIT = /[\s　]+/u;

/**
 * 実際に部分一致で使う語の一覧。
 *   - `opts.terms` があればそれ（trim 済み・空語除去）
 *   - なければ `q.q`。空白（半角/全角）を含む場合は単語ごとにも割り、フレーズ全体 ＋
 *     各単語を OR で照合する（「つめ　切り」のように利用者が単語のつもりで空白区切りに
 *     した入力が、フレーズ全体の完全一致でしか照合されず 0 件になっていた不具合の修正）。
 *     単語を含まない（空白の無い）1 語だけの入力は従来と完全に同じ挙動。
 *   - どちらも無ければ空（キーワード条件を足さない）
 */
function resolveTerms(q: SearchQ, opts?: TermOpts): string[] {
  const fromOpts = (opts?.terms ?? []).map((t) => t.trim()).filter((t) => t.length > 0);
  if (fromOpts.length > 0) return fromOpts;
  const phrase = q.q?.trim();
  if (!phrase) return [];
  const words = phrase.split(WHITESPACE_SPLIT).filter((w) => w.length > 0);
  if (words.length <= 1) return [phrase];
  return Array.from(new Set([phrase, ...words]));
}

const ilike = (term: string) => ({ contains: term, mode: "insensitive" as const });

/**
 * 既読 / 未読での Attempt レベルの絞り込み条件（ログイン中 viewer のみ）。
 * `read` 未指定 or 未ログインなら null（絞り込まない）。
 */
export function readFilterWhere(
  read: ExperienceQuery["read"],
  viewerUserId: string | null | undefined,
): Prisma.AttemptWhereInput | null {
  if (!read || !viewerUserId) return null;
  const readByViewer: Prisma.AttemptWhereInput = { reads: { some: { userId: viewerUserId } } };
  return read === "read" ? readByViewer : { NOT: readByViewer };
}

export function buildExperienceWhere(
  q: SearchQ,
  viewerUserId?: string | null,
  opts?: TermOpts,
): Prisma.AttemptWhereInput {
  const and: Prisma.AttemptWhereInput[] = [{ ...PUBLIC_ATTEMPT_WHERE }];

  if (q.result) {
    and.push({ result: q.result });
  }

  const readWhere = readFilterWhere(q.read, viewerUserId);
  if (readWhere) and.push(readWhere);

  if (q.tag) {
    and.push({
      road: { roadTags: { some: { tag: { name: { equals: q.tag, mode: "insensitive" } } } } },
    });
  }

  if (opts?.ids) {
    and.push({ id: { in: opts.ids } });
  } else {
    const terms = resolveTerms(q, opts);
    if (terms.length > 0) {
      and.push({
        OR: terms.flatMap((term) => {
          const contains = ilike(term);
          return [
            { method: contains },
            { memo: contains },
            { road: { is: { difficulty: contains } } },
            { road: { is: { situation: contains } } },
            { road: { is: { goal: contains } } },
            { road: { is: { previouslyAble: contains } } },
            { road: { is: { roadTags: { some: { tag: { name: contains } } } } } },
          ];
        }),
      });
    }
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
  road: { include: { roadTags: { include: { tag: true } } } },
} satisfies Prisma.AttemptInclude;

/**
 * 検索語が「ページ（Road）側の内容」= できなくなった / やりたいこと / 場面 / 以前できていた /
 * タグ に当たる道だけ (指示「ワードがページの内容なら、ページ内容をカードで表示」)。
 * 検索語が無いときは（ふつうの一覧）「公開 Attempt を 1 つ以上持つ道」全部。
 */
export function buildRoadLevelSearchWhere(
  q: SearchQ,
  viewerUserId?: string | null,
  opts?: TermOpts,
): Prisma.RoadWhereInput {
  const publishedAttempt: Prisma.AttemptWhereInput = { ...PUBLIC_ATTEMPT_WHERE };
  if (q.result) publishedAttempt.result = q.result;

  const and: Prisma.RoadWhereInput[] = [{ attempts: { some: publishedAttempt } }];

  // 既読 / 未読の道の絞り込み: 道が「viewer が読んだ公開経験を持つか / 全く持たないか」。
  if (q.read && viewerUserId) {
    const readPublished: Prisma.AttemptWhereInput = {
      ...publishedAttempt,
      reads: { some: { userId: viewerUserId } },
    };
    and.push(
      q.read === "read"
        ? { attempts: { some: readPublished } }
        : { attempts: { none: readPublished } },
    );
  }

  if (q.tag) {
    and.push({
      roadTags: { some: { tag: { name: { equals: q.tag, mode: "insensitive" } } } },
    });
  }

  if (opts?.ids) {
    and.push({ id: { in: opts.ids } });
  } else {
    const terms = resolveTerms(q, opts);
    if (terms.length > 0) {
      and.push({
        OR: terms.flatMap((term) => {
          const contains = ilike(term);
          return [
            { difficulty: contains },
            { situation: contains },
            { goal: contains },
            { previouslyAble: contains },
            { roadTags: { some: { tag: { name: contains } } } },
          ];
        }),
      });
    }
  }

  return { AND: and };
}

/**
 * 検索語が「方法（Attempt）の中」= 試したこと本文 / 気づき に当たる公開 Attempt だけ
 * (指示「方法内で見つかった場合、方法の内容をカードで表示」)。
 * 検索語が無ければ空条件では返さない前提（呼び出し側で q 有無を判定）。
 */
export function buildMethodSearchWhere(
  q: SearchQ,
  viewerUserId?: string | null,
  opts?: TermOpts,
): Prisma.AttemptWhereInput {
  const and: Prisma.AttemptWhereInput[] = [{ ...PUBLIC_ATTEMPT_WHERE }];

  if (q.result) and.push({ result: q.result });

  const readWhere = readFilterWhere(q.read, viewerUserId);
  if (readWhere) and.push(readWhere);
  if (q.tag) {
    and.push({
      road: { roadTags: { some: { tag: { name: { equals: q.tag, mode: "insensitive" } } } } },
    });
  }

  if (opts?.ids) {
    and.push({ id: { in: opts.ids } });
  } else {
    const terms = resolveTerms(q, opts);
    if (terms.length > 0) {
      and.push({
        OR: terms.flatMap((term) => {
          const contains = ilike(term);
          return [{ method: contains }, { memo: contains }];
        }),
      });
    }
  }

  return { AND: and };
}
