import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

/**
 * AI は補助レイヤー (指示書 12)。
 *   - 診断・治療・医療上の正解・「必ず成功する」といった断定を禁止
 *   - 経験の整理と、次の一歩を考える材料の提示に限定
 *   - API キー未設定時は決め打ちのスタブを返す (アプリは動く)
 */

const DISCLAIMER =
  "これは経験を整理するための参考情報です。診断や治療の答えではありません。心配なときは専門職に相談してください。";

const SYSTEM_PROMPT = `あなたは「できる道」というサービスの補助AIです。
利用者が「できなくなったこと」に対して他の人の試行錯誤を活かせるよう支援します。

必ず守ること:
- 診断・治療方針・医療上の正解を断定しない
- 「必ずできるようになる」「絶対に効く」などの断定をしない
- 他人の経験を「正解」として提示しない。「こういう方法が試されています」という形にする
- 病名・障害名を推測して当てにいかない
- やさしく、短く、専門用語を避ける
- 出力は必ず指定されたJSON形式のみ`;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ai.apiKey });
  return _client;
}

export async function callJson<T>(
  userPrompt: string,
  fallback: T,
  system: string = SYSTEM_PROMPT,
): Promise<T> {
  if (!env.ai.configured) return fallback;
  try {
    const res = await client().messages.create({
      model: env.ai.model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return fallback;
    return { ...fallback, ...JSON.parse(text.slice(jsonStart, jsonEnd + 1)) };
  } catch (err) {
    console.warn("[ai] call failed, using fallback:", err instanceof Error ? err.message : "unknown");
    return fallback;
  }
}

/**
 * 配列を返す JSON を AI に生成させる補助。`{"items": [...]}` を期待し、
 * パースできない・キー未設定・items が配列でない場合は空配列を返す。
 * 返り値の要素は未検証の unknown。呼び出し側で必ず正規化・検証すること。
 */
export async function callJsonArray(
  userPrompt: string,
  system: string = SYSTEM_PROMPT,
  maxTokens = 4096,
): Promise<unknown[]> {
  if (!env.ai.configured) return [];
  try {
    const res = await client().messages.create({
      model: env.ai.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return [];
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { items?: unknown };
    return Array.isArray(parsed?.items) ? parsed.items : [];
  } catch (err) {
    console.warn(
      "[ai] callJsonArray failed, using []:",
      err instanceof Error ? err.message : "unknown",
    );
    return [];
  }
}

export interface ExperienceSearchAssist {
  keywords: string[];
  rephrased: string;
  disclaimer: string;
}

export async function assistExperienceSearch(situation: string): Promise<ExperienceSearchAssist> {
  const naive = situation
    .replace(/[。、,.!?！？\n]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 5);
  return callJson<ExperienceSearchAssist>(
    `利用者の状況: "${situation}"\n\nこの状況で他の人の経験を探すための検索キーワード候補(2〜5個, 日本語, 一般語)と、` +
      `困りごとを一文で言い換えたものを返してください。\n` +
      `JSON形式: {"keywords": string[], "rephrased": string}`,
    { keywords: naive, rephrased: situation.trim(), disclaimer: DISCLAIMER },
  );
}

export interface ExperienceSummary {
  triedMethods: string[];
  patterns: string[];
  disclaimer: string;
}

export async function summarizeExperiences(
  experiences: { method: string; result: string; memo: string | null }[],
): Promise<ExperienceSummary> {
  const triedMethods = Array.from(new Set(experiences.map((e) => e.method.slice(0, 60))));
  return callJson<ExperienceSummary>(
    `次は同じような困りごとに対して他の人が試した記録です:\n` +
      experiences.map((e, i) => `${i + 1}. 方法:${e.method} / 結果:${e.result} / メモ:${e.memo ?? "なし"}`).join("\n") +
      `\n\nどんな方法が試されているか(triedMethods)と、読み取れる傾向(patterns, 2〜4個, 断定しない)を返してください。\n` +
      `JSON形式: {"triedMethods": string[], "patterns": string[]}`,
    { triedMethods, patterns: [], disclaimer: DISCLAIMER },
  );
}

export { DISCLAIMER };
