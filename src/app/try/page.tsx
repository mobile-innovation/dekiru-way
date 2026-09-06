import type { Metadata } from "next";
import Link from "next/link";
import { QuickSubmitForm } from "@/components/quick-submit-form";
import { sanitizeProblemParam } from "@/lib/validation";

export const metadata: Metadata = {
  title: "あなたが試したことを教えてください",
  description:
    "困っていることに対して、試してみた方法を教えてください。うまくいかなかったことも、誰かの次の一歩につながります。",
  // 入力用のページなので検索エンジンには載せない (SNS から直接ひらく想定)。
  robots: { index: false, follow: false },
};

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function TryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  // SNS のリンクから「困っていたこと」を渡せる (?problem=...)。生の値は信用せず下ごしらえする。
  const initialProblem = sanitizeProblemParam(sp.problem);

  return (
    // PC でも左右余白が広くなりすぎないよう、フォームの最大幅は max-w-2xl (約 680px) までに留める。
    // スマホは main の px-4 で従来どおりの余白。
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <header className="space-y-2">
        <h1 className="text-xl font-bold">あなたが試したことを教えてください</h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          困っていることに対して、試してみた方法を教えてください。うまくいかなかったことも、
          誰かの次の一歩につながります。
        </p>
      </header>

      <QuickSubmitForm initialProblem={initialProblem} />

      <p className="text-xs text-[var(--color-ink-muted)]">
        氏名や連絡先など、個人が特定できる情報は書かないでください。くわしくは
        <Link href="/terms" className="underline">
          利用について
        </Link>
        をご覧ください。
      </p>
    </div>
  );
}
