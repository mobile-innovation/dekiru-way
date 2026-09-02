import Link from "next/link";

/**
 * 大量アクセス検知時に、データを出さずに表示する注意。
 * 人間の通常利用でここに到達することは想定していない (追加指示書 §19)。
 */
export function RateLimitedNotice({ retryAfter }: { retryAfter?: number }) {
  const mins = retryAfter ? Math.max(1, Math.round(retryAfter / 60)) : null;
  return (
    <div className="mx-auto w-full max-w-md card space-y-3 p-8 text-center">
      <p className="text-3xl" aria-hidden="true">
        ⏳
      </p>
      <h1 className="text-lg font-bold">アクセスが一時的に制限されています</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        短時間に多くのアクセスがあったため、一時的に制限しています。
        {mins ? `${mins} 分ほど` : "しばらく"}おいてから、もう一度お試しください。
      </p>
      <p className="text-sm text-[var(--color-ink-muted)]">
        経験の機械的な大量取得はご遠慮ください（<Link href="/terms">利用について</Link>）。
      </p>
      <p>
        <Link href="/">トップへ戻る</Link>
      </p>
    </div>
  );
}
