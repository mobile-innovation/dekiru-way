import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "利用について",
  description:
    "できる道の利用にあたってのお願い。掲載された経験の機械的な大量取得・外部AIの学習利用は禁止です。",
};

export default function TermsPage() {
  return (
    <article className="mx-auto w-full max-w-3xl space-y-6">
      <h1 className="text-xl font-bold">利用について</h1>

      <Callout tone="warn">
        この文書は運用方針をわかりやすく示すものです。正式な法的文書としての公開時には専門家の確認を行います。
      </Callout>

      <section className="space-y-2">
        <h2 className="text-base font-bold">1. できる道の目的</h2>
        <p>
          できる道は、できなくなったことにぶつかった人が「どうやって前へ進もうとしたか」を持ち寄り、
          次の誰かの一歩に役立てるためのサービスです。ここにある経験は「正解」ではありません。
          うまくいかなかった記録も、次の人の遠回りを減らす大切な経験として扱います。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">2. 公開経験の閲覧</h2>
        <p>
          公開された経験は、ログインなしで検索・閲覧できます。個人を特定する情報（氏名など）は
          表示しません。公開するかどうかは、記録ごとに投稿者本人が決めます。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">3. 自動的な取得・収集の禁止</h2>
        <p>次の行為を禁止します。</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>公開経験の全件取得や、短時間での大量取得</li>
          <li>ページの自動巡回による継続的な取得</li>
          <li>API を用いた経験データのデータセット化</li>
          <li>スクレイピングその他、人の閲覧を目的としない機械的なアクセス</li>
        </ul>
        <p>
          「公開している」ことは「自由に大量取得してよい」ことを意味しません。異常なアクセスは
          検知し、制限・遮断することがあります。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">4. AI・機械学習目的での利用の禁止</h2>
        <p>
          できる道に掲載された経験・文章・画像等を、外部の AI モデルの学習、ファインチューニング、
          データセットの作成、その他の機械学習を目的として収集・利用することを禁止します。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">5. できる道自身の AI 機能について</h2>
        <p>
          できる道は、利用者の困りごとに対して公開経験を整理し「こんな方法が試されています」と
          提示する補助的な AI 機能を提供することがあります。これはサービス運営者が定めた目的の
          範囲内での利用であり、上記の「外部 AI による無断収集」とは区別します。この AI は
          診断や治療の答えを示すものではありません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">6. 健康・医療に関する注意</h2>
        <p>
          掲載されている経験は個人の体験であり、医療上の助言ではありません。体調や治療のことで
          心配なときは、医療・介護の専門職に相談してください。
        </p>
      </section>

      <p className="text-sm">
        <Link href="/">トップへ戻る</Link>
      </p>
    </article>
  );
}
