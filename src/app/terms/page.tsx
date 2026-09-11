import type { Metadata } from "next";
import Link from "next/link";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "利用について",
  description:
    "できる道の利用にあたっての基本的なルール。掲載された経験の機械的な大量取得・外部AIの学習利用は禁止です。",
};

/**
 * 「利用について」（2026-09-11・できる道「利用について」ページ更新指示書）。
 *
 * 法律文書そのものではなく、現在のサービスの実際の仕様・運用方針と矛盾しない範囲で
 * 利用上の考え方をまとめたページ。法的な断定が要る箇所は拡張せず、既存の仕様の範囲で書く。
 *
 * 6.「AI等により作成された仮データについて」は、指示書の原文（「仮データであることが
 * 分かる表示にする」）とは異なる書き方にしている。現在の実装は 2026-09-11 の別指示
 * （「AI作成データの表示ルール追加」）により、公開された仮データを検索結果・経験カード・
 * 経験詳細で通常の経験とまったく同じ見た目にし、「サンプル」等の表示を一切出さない方針
 * （docs/spec.md §5.10）。ページ記載を実装に合わせる方針をユーザーに確認済み。
 */
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
        <h2 className="text-base font-bold">2. 公開される経験について</h2>
        <p>
          公開するかどうかは、記録ごとに投稿者本人が決めます。公開された経験は、ログインの有無に
          かかわらず、参考情報として検索・閲覧できます。
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>公開された経験は、その方の「正解」や「推奨される方法」を意味しません</li>
          <li>同じ方法を試しても、人によって結果が異なる場合があります</li>
          <li>
            うまくいった経験だけでなく、部分的な改善・変化がなかったこと・うまくいかなかったこと・
            今も試している途中であることも、同じように大切な経験として扱います
          </li>
        </ul>
        <p>
          公開されていることは、その内容を自由に複製・転載・収集してよいという意味ではありません。
          機械的な取得については次の「3. 自動的な取得・大量取得の禁止」を、
          AI の学習利用については「4. AI・機械学習目的での利用禁止」をあわせて確認してください。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">3. 自動的な取得・大量取得の禁止</h2>
        <p>次の行為を禁止します。</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>公開されている経験の全件取得</li>
          <li>短時間での大量取得</li>
          <li>ページの自動巡回による継続的な取得</li>
          <li>API を利用した経験データの大量取得・データセット化</li>
          <li>スクレイピングその他、人による通常の閲覧を目的としない機械的なアクセス</li>
          <li>サービスの負荷を著しく高めるアクセス</li>
        </ul>
        <Callout tone="warn" title="「公開している」ことは、自由に大量取得してよいことを意味しません">
          異常なアクセスを確認した場合、アクセスの制限・遮断等を行うことがあります。
        </Callout>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">4. AI・機械学習目的での利用禁止</h2>
        <p>
          できる道に掲載された経験・文章その他の公開データを、第三者が次の目的で利用することを
          禁止します。
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>外部の AI モデルの学習</li>
          <li>ファインチューニング</li>
          <li>機械学習用データセットの作成</li>
          <li>AI モデル・検索モデル等の評価用データセットとしての大量利用</li>
          <li>その他、機械学習を目的とした収集・加工・蓄積</li>
        </ul>
        <p>
          通常の個人による閲覧や、できる道が提供する検索・閲覧機能の利用は、これに当たりません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">5. できる道自身の AI について</h2>
        <p>
          できる道では、利用者の困りごとや公開されている経験を整理し、
          「こんな方法が試されています」という形で、次の一歩を考えるための補助情報を提示する
          AI 機能を提供することがあります。このAIは、
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>診断を行うものではありません</li>
          <li>治療方針を決定するものではありません</li>
          <li>医療上の正解を断定するものではありません</li>
          <li>利用者に特定の方法を強制するものではありません</li>
        </ul>
        <p>
          AI の役割は、これまでに蓄積された経験を整理し、利用者が考えるための選択肢を増やす
          補助にとどまります。これはサービス自身が提供する機能であり、「4. AI・機械学習目的での
          利用禁止」で述べた第三者による無断の学習利用とは区別します。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">6. AI 等により作成された仮データについて</h2>
        <p>
          できる道では、検索や表示の動作確認のために、AI 等を使って仮の経験データを作成する
          場合があります。仮データも、他の経験と同じ公開のルールを経て公開されます。
        </p>
        <p>
          仮データは、実在の利用者の体験として案内することはありません。運営が仮データを
          実際の利用者の体験であるかのように偽って扱うことはありません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">7. 個人情報・プライバシーについて</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>公開する経験には、個人を特定できる情報をできるだけ含めないでください</li>
          <li>
            ご自身以外の方の氏名・住所・電話番号・メールアドレスなどの個人情報を、
            本人の同意なく掲載しないでください
          </li>
          <li>ご自身についても、公開したくない個人情報は入力しないでください</li>
          <li>
            公開した内容は他の利用者が閲覧できます。投稿前に、公開してよい内容かどうかを
            確認してください
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">8. 健康・医療に関する注意</h2>
        <p>
          掲載されている経験は、あくまで個人の体験であり、医療上の助言ではありません。
          体調や病気、治療のことで不安があるときは、医師・看護師・薬剤師・介護職など、
          適切な専門職に相談してください。ある方に効果があった方法が、ほかの方にも
          同じように効果があるとは限りません。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-bold">9. 投稿・公開内容について</h2>
        <Callout tone="warn" title="次のような内容は掲載できません">
          <ul className="list-disc space-y-1 pl-6">
            <li>他人の個人情報</li>
            <li>他人を特定できる情報</li>
            <li>他人を傷つけることを目的とした内容</li>
            <li>実際の経験であるかのように装った、虚偽の内容</li>
            <li>法令や公序良俗に反する内容</li>
            <li>サービスの運営を妨害する目的の内容</li>
            <li>宣伝・広告等を目的とした不適切な投稿</li>
          </ul>
        </Callout>
        <p>
          問題のある内容を確認した場合、削除・非公開化・利用制限等を行うことがあります。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold">10. できる道の考え方</h2>
        <div className="rounded-[var(--radius-md)] border-l-4 border-[var(--color-primary)] bg-[var(--color-primary-soft)] px-4 py-3">
          <p className="font-bold text-[var(--color-ink)]">
            「できない」を終点にしない。
            <br />
            誰かの試行錯誤を、誰かの次の一歩へ。
          </p>
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            ここにある経験は「正解」ではありません。
            <br />
            うまくいかなかった記録も、次の人の道を考えるための大切な経験です。
          </p>
        </div>
      </section>

      <p className="text-sm">
        <Link href="/">トップへ戻る</Link>
      </p>
    </article>
  );
}
