import { createHash, randomInt } from "node:crypto";

/**
 * Stage 3.1: 公開データの匿名化（純関数）と、評価用 DB まわりの安全装置。
 *
 * export ファイルに残すのは Embedding 評価に要る最小限だけ:
 *   Road:    評価用 ID / isSeedData / difficulty / situation / goal / previouslyAble / tags
 *   Attempt: 評価用 ID / 評価用 roadId / method / memo
 * 実 UUID・userId・日付・dataOrigin・seedKeyword・Embedding 用 text などは出さない。
 * 実 ID と評価用 ID の対応表は作らない（戻り値にも含めない）。
 */

export interface SourceRoad {
  id: string;
  isSeedData: boolean;
  difficulty: string | null;
  situation: string | null;
  goal: string | null;
  previouslyAble: string | null;
  tags: string[];
}
export interface SourceAttempt {
  id: string;
  roadId: string;
  method: string;
  memo: string | null;
}

export interface AnonRoad {
  id: string;
  isSeedData: boolean;
  difficulty: string | null;
  situation: string | null;
  goal: string | null;
  previouslyAble: string | null;
  tags: string[];
}
export interface AnonAttempt {
  id: string;
  roadId: string;
  method: string;
  memo: string | null;
}
export interface AnonSnapshot {
  label: string;
  roads: AnonRoad[];
  attempts: AnonAttempt[];
}

/** 0 以上 n 未満の整数を返す乱数。既定は crypto.randomInt（テストでは差し替え可能）。 */
export type RandomInt = (n: number) => number;

function shuffled<T>(xs: readonly T[], rand: RandomInt): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const seq = (prefix: string, i: number, total: number) =>
  `${prefix}-${String(i + 1).padStart(Math.max(3, String(total).length), "0")}`;

/**
 * 公開データを匿名化する。道・試したことをそれぞれランダムに並べ替えてから連番 ID を振る
 * （連番から投稿の新旧が分からないように）。タグは名前順に揃える（取得順を残さない）。
 * 道が見つからない試したこと（呼び出し側の取得条件がずれた場合）は例外にする。
 */
export function anonymizeSnapshot(
  label: string,
  roads: readonly SourceRoad[],
  attempts: readonly SourceAttempt[],
  rand: RandomInt = randomInt,
): AnonSnapshot {
  const roadOrder = shuffled(roads, rand);
  // 実 ID → 評価用 ID の対応はこの関数の中だけで使い、外へは出さない。
  const anonRoadId = new Map(roadOrder.map((r, i) => [r.id, seq("road", i, roadOrder.length)]));
  const anonRoads: AnonRoad[] = roadOrder.map((r) => ({
    id: anonRoadId.get(r.id)!,
    isSeedData: r.isSeedData,
    difficulty: r.difficulty,
    situation: r.situation,
    goal: r.goal,
    previouslyAble: r.previouslyAble,
    tags: [...r.tags].sort((a, b) => a.localeCompare(b, "ja")),
  }));
  const attemptOrder = shuffled(attempts, rand);
  const anonAttempts: AnonAttempt[] = attemptOrder.map((a, i) => {
    const roadId = anonRoadId.get(a.roadId);
    if (!roadId) throw new Error("公開 Attempt の道が export 対象の道に含まれていません（取得条件の不一致）");
    return { id: seq("attempt", i, attemptOrder.length), roadId, method: a.method, memo: a.memo };
  });
  return { label, roads: anonRoads, attempts: anonAttempts };
}

/**
 * 評価用 DB に投入するときの UUID。評価用 ID から決定的に作る（本番の UUID とは無関係）。
 * 決定的なので評価用 ID ↔ DB の UUID の対応表ファイルを持たずに済む。
 */
export function evalUuid(label: string, anonId: string): string {
  const h = createHash("sha256").update(`dekiru-eval:${label}:${anonId}`).digest("hex");
  // UUID v4 の形（version=4, variant=10xx）に揃える
  const v = `4${h.slice(13, 16)}`;
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}-${variant}-${h.slice(20, 32)}`;
}

function parseDbUrl(url: string | undefined): { host: string; db: string } {
  if (!url) throw new Error("DATABASE_URL が未設定です");
  const u = new URL(url);
  return { host: u.hostname, db: u.pathname.replace(/^\//, "") };
}

/** ローカル（localhost / 127.0.0.1）以外の DB を拒否する。 */
export function assertLocalDatabaseUrl(url = process.env.DATABASE_URL): void {
  const { host } = parseDbUrl(url);
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`ローカル以外の DB には接続しません（host=${host}）`);
  }
}

/** 評価専用 DB（ローカルかつ DB 名が *_eval）以外を拒否する。開発 DB・本番 DB への誤接続防止。 */
export function assertEvalDatabaseUrl(url = process.env.DATABASE_URL): void {
  assertLocalDatabaseUrl(url);
  const { db } = parseDbUrl(url);
  if (!db.endsWith("_eval")) {
    throw new Error(`評価専用 DB（名前が *_eval）以外には接続しません（db=${db}）`);
  }
}
