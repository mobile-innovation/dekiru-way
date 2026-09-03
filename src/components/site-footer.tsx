import Image from "next/image";
import Link from "next/link";

/**
 * サイトフッター。文言・リンク（/terms のみ）は変更せず、見た目だけトップの世界観に寄せる
 * （指示書「フッターUI改善 v1」）: 白一色 → 本文より少し濃い生成り、中央寄せ、控えめなロゴ、
 * 読みやすい幅の注意書き。新しいリンク・ページ・画像は増やさない。
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface-sunken)]">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 text-center sm:px-6">
        <p className="flex items-center justify-center gap-1.5 text-base font-bold text-[var(--color-ink)]">
          <Image src="/brand-icon.png" alt="" width={20} height={20} className="h-5 w-5 shrink-0" />
          できる道
        </p>

        <p className="mt-2 text-sm text-[var(--color-ink)]">
          「できない」を終点にしない。誰かの試行錯誤を、誰かの次の一歩へ。
        </p>

        <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[var(--color-ink-muted)]">
          ここにある経験は「正解」ではありません。うまくいかなかった記録も、次の誰かの遠回りを減らす大切な経験です。
          健康や体のことで心配なときは、医療・介護の専門職にも相談してください。
        </p>

        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
          <Link href="/terms" className="inline-block px-1 py-1 font-medium">
            利用について
          </Link>
          <span aria-hidden="true"> · </span>
          掲載内容の機械的な大量取得・外部AIの学習利用は禁止しています。
        </p>

        <p className="mt-6 text-xs text-[var(--color-ink-muted)]">
          © {new Date().getFullYear()} できる道
        </p>
      </div>
    </footer>
  );
}
