import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-md card space-y-3 p-8 text-center">
      <p className="text-3xl" aria-hidden="true">
        🧭
      </p>
      <h1 className="text-lg font-bold">ページが見つかりませんでした</h1>
      <p className="text-sm text-[var(--color-ink-muted)]">
        URL が変わったか、非公開になった可能性があります。
      </p>
      <p>
        <Link href="/">トップへ戻る</Link>
      </p>
    </div>
  );
}
