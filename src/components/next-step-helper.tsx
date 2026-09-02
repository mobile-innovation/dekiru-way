"use client";

import { useState } from "react";
import { api, ClientApiError } from "@/lib/client/api";

/**
 * 「次の一歩を考える材料」を出す補助 (指示書 12)。
 * AI は補助レイヤー。押したときだけ呼ぶ。断定しない文言で表示する。
 */
export function NextStepHelper({ roadId }: { roadId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [ideas, setIdeas] = useState<string[]>([]);
  const [disclaimer, setDisclaimer] = useState("");
  const [error, setError] = useState("");

  async function run() {
    setState("loading");
    setError("");
    try {
      const res = await api.post<{ ideas: string[]; disclaimer: string }>(
        "/api/v1/ai/suggest-next-step",
        { roadId },
      );
      setIdeas(res.ideas ?? []);
      setDisclaimer(res.disclaimer ?? "");
      setState("done");
    } catch (e) {
      setError(e instanceof ClientApiError ? e.message : "うまく取得できませんでした");
      setState("error");
    }
  }

  return (
    <section className="card p-5" aria-labelledby="nexthelp-heading">
      <h2 id="nexthelp-heading" className="text-base font-bold">
        次に試す材料を探す
      </h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        これまでの記録から、次に試せそうなことの候補を出します。答えではなく、考えるためのたたき台です。
      </p>
      <button
        type="button"
        onClick={run}
        disabled={state === "loading"}
        className="mt-3 tap-target rounded-[var(--radius-pill)] border border-[var(--color-border)] px-4 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {state === "loading" ? "考え中…" : "候補を出す"}
      </button>

      <div aria-live="polite" className="mt-3">
        {state === "error" && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        {state === "done" && (
          <>
            {ideas.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {ideas.map((idea, i) => (
                  <li key={i}>{idea}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--color-ink-muted)]">
                今回は候補を出せませんでした。経験を探すページも見てみてください。
              </p>
            )}
            {disclaimer && (
              <p className="mt-2 text-xs text-[var(--color-ink-muted)]">{disclaimer}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
