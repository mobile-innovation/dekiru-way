"use client";

import { MAX_LOCAL_READ_IDS } from "@/lib/constants";

/**
 * 未ログイン時の既読を、このブラウザだけに保存する (既読引き継ぎ指示書)。
 *   - 保存するのは既読にした Attempt の id (UUID) だけ。個人情報は持たない。
 *   - 「このブラウザで以前見た経験」の意味なので、端末・ブラウザをまたいだ同期はしない。
 *   - private mode 等で localStorage が使えなくても例外を投げない (既読は補助機能)。
 */

const KEY = "dekiru:localReads";

function readRaw(): string[] {
  try {
    // `window.` を明示する（bare な `localStorage` は環境によって別のグローバルを指すことがある）。
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeRaw(ids: string[]): void {
  try {
    // 上限を超えたら古いもの（先頭）から捨てる。追加順 ≒ 既読にした順。
    const trimmed = ids.length > MAX_LOCAL_READ_IDS ? ids.slice(ids.length - MAX_LOCAL_READ_IDS) : ids;
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* private mode などで書き込めなくても既読表示ができないだけ */
  }
}

/** このブラウザで既読にした Attempt id の一覧。 */
export function getLocalReadIds(): string[] {
  return readRaw();
}

/** 指定した id のどれかがこのブラウザで既読になっているか。 */
export function hasAnyLocalRead(attemptIds: string[]): boolean {
  if (attemptIds.length === 0) return false;
  const ids = readRaw();
  if (ids.length === 0) return false;
  const set = new Set(ids);
  return attemptIds.some((id) => set.has(id));
}

/** 経験詳細を開いたときに 1 件だけ既読へ追加する。 */
export function addLocalRead(attemptId: string): void {
  const ids = readRaw();
  if (ids.includes(attemptId)) return;
  writeRaw([...ids, attemptId]);
}

/** ログアウト時: サーバー側の既読 id をブラウザ側へ統合する（重複は作らない）。 */
export function mergeLocalReadIds(serverIds: string[]): void {
  if (serverIds.length === 0) return;
  const merged = new Set(readRaw());
  for (const id of serverIds) merged.add(id);
  writeRaw([...merged]);
}

/** 再ログイン時の統合が済んだら、ブラウザ側の記録は空にする（以後はアカウント側が正）。 */
export function clearLocalReadIds(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
