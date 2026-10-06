import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { QuickSubmitForm } from "@/components/quick-submit-form";
import { sanitizeProblemParam } from "@/lib/validation";
import { OGP_IMAGE } from "@/lib/ogp";

// SNS 共有時のタイトル・説明・画像。ページ本文の見た目は変えず、head の metadata だけ設定する。
const SHARE_TITLE = "あなたが試したことを教えてください｜できる道";
const SHARE_DESCRIPTION =
  "うまくいった方法だけでなく、うまくいかなかった方法も大切な経験です。あなたが試したことを教えてください。";
// 画像はサイト共通の OGP 画像（src/lib/ogp.ts）。このページは独自のタイトル・説明文を持つので openGraph を丸ごと定義する。
const SHARE_IMAGE = OGP_IMAGE.url;

export const metadata: Metadata = {
  // title.template ("%s | できる道") を通さず、SNS と完全一致の文字列にする。
  title: { absolute: SHARE_TITLE },
  description: SHARE_DESCRIPTION,
  alternates: { canonical: "/try" },
  openGraph: {
    type: "website",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    url: "/try",
    siteName: "できる道",
    locale: "ja_JP",
    images: [OGP_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    images: [SHARE_IMAGE],
  },
};

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function TryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  // SNS のリンクから「困っていたこと」を渡せる (?problem=...)。生の値は信用せず下ごしらえする。
  const initialProblem = sanitizeProblemParam(sp.problem);

  return (
    // PC でも左右余白が広くなりすぎないよう、フォームの最大幅は max-w-2xl (約 680px) までに留める。
    // スマホは main の px-4 で従来どおりの余白。
    <div className="mx-auto w-full max-w-2xl space-y-5">
      {/* タイトルより上に置く導入イラスト（try.png 画像追加指示書。2026-10-01 に try_image.png へ差し替え、
          サイズは同じ 1774×887）。加工・装飾（枠線・影・
          文字乗せ等）はしない。比率維持のため width/height を実寸で指定し、表示は w-full h-auto
          で縮小するだけ（引き伸ばし・トリミングをしない）。読み込めなくても下のタイトル以降は
          そのまま表示される。 */}
      <Image
        src="/try_image.png"
        alt="困ったことを工夫しながら試し、その経験を次の人へつなげるイメージ"
        width={1774}
        height={887}
        priority
        sizes="(min-width: 42rem) 42rem, 100vw"
        className="h-auto w-full"
      />

      <header className="space-y-2">
        <h1 className="text-xl font-bold">あなたの経験を教えてください</h1>
        {/* 本文は 14px・本文色（薄い補助色にしない。2026-10-01 最終UI調整） */}
        <p className="text-sm leading-relaxed text-[var(--color-ink)]">
          困っていたことと、試してみた方法を教えてください。うまくいかなかったことも、
          誰かの次の一歩につながります。
        </p>
      </header>

      <QuickSubmitForm initialProblem={initialProblem} />

      <p className="text-[0.8125rem] leading-relaxed text-[var(--color-ink-muted)]">
        氏名や連絡先など、個人が特定できる情報は書かないでください。くわしくは
        <Link href="/terms" className="underline">
          利用について
        </Link>
        をご覧ください。
      </p>
    </div>
  );
}
