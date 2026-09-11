import { callJson, DISCLAIMER } from "@/lib/ai/client";
import { env } from "@/lib/env";

/**
 * 検索意図の展開 (検索AI構築 v1 / Phase 1)。
 *
 * 役割は「利用者の言葉」と「誰かの実際の経験」をつなぐこと。
 *   - AI は経験・事実を生成しない。検索語(単語・短いフレーズ)を広げるだけ。
 *   - AI 未設定・AI 失敗時は決定的な localExpand にフォールバックし、
 *     戻り値の terms は決して空にしない（通常キーワード検索が必ず動く）。
 *   - AI 出力はここで厳格に正規化する（文字列のみ・長さ/件数クランプ）。
 *     呼び出し側は terms をそのまま Prisma の `contains`（パラメータ）に渡すだけで、
 *     SQL 連結も HTML 化もしない。
 */

const MAX_TERMS = 8;
const MIN_TERM_LEN = 2;
const MAX_TERM_LEN = 30;
const MAX_REPHRASED_LEN = 200;
/** 全角/半角スペース・主な区切り記号でざっくり分割する（形態素解析は持たない）。 */
const TOKEN_SPLIT = /[\s　、。,.!?！？・／/|｜「」『』（）()【】\[\]]+/u;

export interface SearchIntent {
  /** ハイブリッド検索に渡す検索語。先頭は必ず元フレーズ。空にならない。 */
  terms: string[];
  /** 困りごとの言い換え（表示用）。 */
  rephrased: string;
  disclaimer: string;
  /** "ai" = AI が展開 / "fallback" = ローカルの簡易展開 */
  source: "ai" | "fallback";
}

const INTENT_SYSTEM_PROMPT = `あなたは「できる道」というサービスの検索補助AIです。
利用者が書いた困りごとを、他の人の経験を探すための検索語に「広げる」役割です。

必ず守ること:
- 経験・事実・体験談を作り出さない。検索語(単語・短いフレーズ)だけを出す
- 日本語の一般語だけを使う。存在しない商品名・固有名詞・病名・障害名を作らない
- 診断・治療方針・医療上の正解を断定しない
- 関連語・言い換え・少し上位の言葉を 3〜8 個
- 各語は 1〜20 文字程度の短さにする
- 出力は次のJSONのみ: {"terms": string[], "rephrased": string}`;

function buildIntentPrompt(phrase: string): string {
  return (
    `利用者の困りごと: "${phrase}"\n\n` +
    `この困りごとで他の人の経験を探すための検索語(関連語・言い換え・上位語)を3〜8個と、` +
    `困りごとを1文で言い換えたもの(30〜60文字程度)を返してください。\n` +
    `JSON形式: {"terms": string[], "rephrased": string}`
  );
}

function dedupeTerms(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim();
    if (v.length < MIN_TERM_LEN || v.length > MAX_TERM_LEN) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= MAX_TERMS) break;
  }
  return out;
}

/** 決定的なローカル展開。AI を使わず、入力語を分割・整理するだけ。 */
export function localExpand(raw: string): { terms: string[]; rephrased: string } {
  const phrase = (raw ?? "").trim();
  const parts = phrase.split(TOKEN_SPLIT);
  const terms = dedupeTerms([phrase, ...parts]);
  return {
    terms: terms.length > 0 ? terms : [phrase.slice(0, MAX_TERM_LEN)],
    rephrased: phrase,
  };
}

/**
 * AI 応答（未検証 unknown）を安全な形へ。terms は先頭に元フレーズを必ず入れ、
 * 文字列以外・長すぎる語・重複を落とす。0 件なら localExpand に委ねる。
 */
export function normalizeIntent(
  raw: unknown,
  original: string,
): { terms: string[]; rephrased: string } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const aiTerms = Array.isArray(obj.terms)
    ? obj.terms.filter((t): t is string => typeof t === "string")
    : [];
  const phrase = (original ?? "").trim();
  const terms = dedupeTerms([phrase, ...aiTerms]);

  const rephrasedRaw = typeof obj.rephrased === "string" ? obj.rephrased.trim() : "";
  const rephrased =
    rephrasedRaw.length > 0 && rephrasedRaw.length <= MAX_REPHRASED_LEN ? rephrasedRaw : phrase;

  return {
    terms: terms.length > 0 ? terms : localExpand(original).terms,
    rephrased,
  };
}

/**
 * 困りごと文 → 検索意図。AI が使えないときも必ず結果を返す。
 */
export async function expandSearchIntent(rawQuery: string): Promise<SearchIntent> {
  const phrase = (rawQuery ?? "").trim();
  if (phrase.length < MIN_TERM_LEN) {
    return {
      terms: phrase ? [phrase] : [],
      rephrased: phrase,
      disclaimer: DISCLAIMER,
      source: "fallback",
    };
  }

  const fallback = localExpand(phrase);
  if (!env.ai.configured) {
    return { ...fallback, disclaimer: DISCLAIMER, source: "fallback" };
  }

  // callJson は未設定・失敗時に fallback の参照をそのまま返す。成功時は新しいオブジェクト。
  const raw = await callJson<{ terms: string[]; rephrased: string }>(
    buildIntentPrompt(phrase),
    fallback,
    INTENT_SYSTEM_PROMPT,
  );
  const source: SearchIntent["source"] = raw === fallback ? "fallback" : "ai";
  const norm = normalizeIntent(raw, phrase);
  return { ...norm, disclaimer: DISCLAIMER, source };
}
