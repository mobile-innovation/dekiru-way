import { describe, it, expect, beforeEach } from "vitest";
import {
  getLocalReadIds,
  hasAnyLocalRead,
  addLocalRead,
  mergeLocalReadIds,
  clearLocalReadIds,
} from "@/lib/client/local-reads";
import { MAX_LOCAL_READ_IDS } from "@/lib/constants";

/**
 * 未ログイン時の既読をブラウザに保存するヘルパ (既読引き継ぎ指示書)。
 *
 * 実行環境の Node に built-in `localStorage`（jsdom の Storage 実装ではない、
 * メソッドを持たない不完全なオブジェクト）が生えていて `window.localStorage` を
 * 覆ってしまうため、テストでは Storage 互換の簡易メモリ実装に差し替えて検証する。
 */
class MemoryStorage {
  private store = new Map<string, string>();
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
});

describe("getLocalReadIds / addLocalRead", () => {
  it("初期状態は空", () => {
    expect(getLocalReadIds()).toEqual([]);
  });

  it("既読を 1 件ずつ追加できる", () => {
    addLocalRead("a1");
    addLocalRead("a2");
    expect(getLocalReadIds()).toEqual(["a1", "a2"]);
  });

  it("同じ id を重複追加しない", () => {
    addLocalRead("a1");
    addLocalRead("a1");
    expect(getLocalReadIds()).toEqual(["a1"]);
  });
});

describe("hasAnyLocalRead", () => {
  it("指定した id のどれかが既読なら true", () => {
    addLocalRead("a1");
    expect(hasAnyLocalRead(["a2", "a1"])).toBe(true);
    expect(hasAnyLocalRead(["a2", "a3"])).toBe(false);
  });

  it("空配列や未保存では false", () => {
    expect(hasAnyLocalRead([])).toBe(false);
    expect(hasAnyLocalRead(["a1"])).toBe(false);
  });
});

describe("mergeLocalReadIds（ログアウト時の引き継ぎ）", () => {
  it("サーバー側の id をブラウザ側へ統合する（既存とは和集合、重複しない）", () => {
    addLocalRead("b"); // ブラウザ側にだけあるもの (指示書の例の D 相当)
    mergeLocalReadIds(["a", "b", "c"]); // サーバー側 (指示書の例の A/B/C 相当)
    expect(getLocalReadIds().sort()).toEqual(["a", "b", "c"]);
  });

  it("空配列を渡しても既存の記録は消えない", () => {
    addLocalRead("a1");
    mergeLocalReadIds([]);
    expect(getLocalReadIds()).toEqual(["a1"]);
  });
});

describe("clearLocalReadIds（再ログイン統合が済んだあと）", () => {
  it("記録を空にする", () => {
    addLocalRead("a1");
    clearLocalReadIds();
    expect(getLocalReadIds()).toEqual([]);
  });
});

describe("上限（MAX_LOCAL_READ_IDS）", () => {
  it("上限を超えたら古いものから捨てる", () => {
    for (let i = 0; i < MAX_LOCAL_READ_IDS + 10; i++) addLocalRead(`id-${i}`);
    const ids = getLocalReadIds();
    expect(ids.length).toBe(MAX_LOCAL_READ_IDS);
    expect(ids).not.toContain("id-0"); // 一番古いものは捨てられている
    expect(ids).toContain(`id-${MAX_LOCAL_READ_IDS + 9}`); // 最新は残る
  });
});

describe("壊れた window.localStorage 値でも落ちない", () => {
  it("JSON でない値・配列でない値は空扱い", () => {
    window.localStorage.setItem("dekiru:localReads", "not json");
    expect(getLocalReadIds()).toEqual([]);

    window.localStorage.setItem("dekiru:localReads", JSON.stringify({ not: "an array" }));
    expect(getLocalReadIds()).toEqual([]);

    window.localStorage.setItem("dekiru:localReads", JSON.stringify(["a", 1, null, "b"]));
    expect(getLocalReadIds()).toEqual(["a", "b"]); // 文字列以外は無視
  });
});
