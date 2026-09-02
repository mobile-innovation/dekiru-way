import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 text-sm text-[var(--color-ink-muted)] sm:px-6">
        <p className="font-medium text-[var(--color-ink)]">
          「できない」を終点にしない。誰かの試行錯誤を、誰かの次の一歩へ。
        </p>
        <p className="mt-2">
          ここにある経験は「正解」ではありません。うまくいかなかった記録も、次の誰かの遠回りを減らす大切な経験です。
          健康や体のことで心配なときは、医療・介護の専門職にも相談してください。
        </p>
        <p className="mt-3">
          <Link href="/terms">利用について</Link>
          <span aria-hidden="true"> · </span>
          掲載内容の機械的な大量取得・外部AIの学習利用は禁止しています。
        </p>
      </div>
    </footer>
  );
}
