"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md card space-y-3 p-8 text-center">
      <p className="text-3xl" aria-hidden="true">
        🌧️
      </p>
      <h1 className="text-lg font-bold">うまく表示できませんでした</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        少し時間をおいて、もう一度試してください。
      </p>
      <button
        type="button"
        onClick={reset}
        className="tap-target mx-auto rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--color-primary-ink)]"
      >
        もう一度読み込む
      </button>
    </div>
  );
}
