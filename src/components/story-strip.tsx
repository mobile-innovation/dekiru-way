import Image from "next/image";
import { SwipeCarousel } from "@/components/swipe-carousel";

/**
 * トップページの「できる道って、こんな場所です」ストーリー。
 * 8 枚の連続した体験を ①→⑧ の順に並べる (指示書「幅比率・横並び枚数調整」)。
 *
 * - md 以上（PC・タブレット）: 2 列 × 4 行の固定グリッド（① ② / ③ ④ / ⑤ ⑥ / ⑦ ⑧）。
 * - md 未満（スマホ）: 横スクロールのカルーセル（2026-10-01「8枚の紹介画像」スマホ表示変更指示）。
 *   1 枚を幅の約 85% で大きく見せ、右に次の画像を少しのぞかせて「横に続く」ことを伝える。
 *   scroll-snap で 1 枚ずつ止まる。下に 8 個のドット（現在位置。押すとその画像へ）と、
 *   最初だけ小さな「横にスワイプして続きを見る →」。自動スクロールはしない（読んでいる途中で動かさない）。
 *   動き（①から開始・ドット追従など）は「いろいろな方法」と共通の SwipeCarousel。
 * - リストは 1 つで、レイアウトだけを画面幅で切り替える。HTML の並び順は ①〜⑧ 固定。
 * - 幅はこのコンポーネントでは決めず、ページ側の共通コンテナに従う
 *   (「試した結果の見かた」「いろいろな方法」と左右端を揃えるため)。
 * - 画像は加工・差し替え・順番変更・トリミングをしない。1254×1254 の縦横比を保つ。
 */

/** alt は画像に焼き込まれた見出し・本文に合わせる（画像は 2026-09 に現在の 8 枚へ差し替え済み）。 */
const SLIDES = [
  {
    src: "/comic1.png",
    title: "「困ったな…」から、はじめよう。",
    desc: "今までできていたことが難しくなることもあります。まずは「困っていること」に気づくことからはじめましょう。",
  },
  {
    src: "/comic2.png",
    title: "困っていることを、自分の「道」にしよう！",
    desc: "今困っていること、以前はどうしていたか、これからどうしたいかを書き出して、自分の「道」を作ります。",
  },
  {
    src: "/comic3.png",
    title: "できる方法を、いろいろ試してみよう！",
    desc: "一つの方法でできなくても、いろいろ試してみるとできる方法が見つかるかも。うまくいった方法も、うまくいかなかった方法も大切な経験です。",
  },
  {
    src: "/comic4.png",
    title: "同じような経験を、探してみよう！",
    desc: "同じようなことで困っている人の経験がきっと見つかります。他の人の経験は、あなたの新しい一歩のヒントになります。",
  },
  {
    src: "/comic5.png",
    title: "少しずつ、できることを増やしていこう！",
    desc: "いきなりうまくいかなくても大丈夫。小さな「できた！」を積み重ねることが大切です。",
  },
  {
    src: "/comic6.png",
    title: "やってみたことを、残しておこう！",
    desc: "うまくいったことも、うまくいかなかったことも、どちらも大切な経験です。あなたの経験が、誰かの次の一歩につながります。",
  },
  {
    src: "/comic7.png",
    title: "経験を重ねて、自分の「道」を育てよう！",
    desc: "試してみたことを重ねていくと、自分に合った方法が見えてきます。それが、あなただけの「道」になります。",
  },
  {
    src: "/comic8.png",
    title: "あなたの次の一歩へ！",
    desc: "できないことがあっても、そこで終わりじゃない。試して、見つけて、記録して、きっと次の一歩につながります。",
  },
] as const;

export function StoryStrip() {
  return (
    <section aria-labelledby="story-heading" className="space-y-4">
      <div className="space-y-1.5">
        <h2 id="story-heading" className="text-lg font-bold">
          できる道って、こんな場所です
        </h2>
        <p className="text-sm text-[var(--color-ink-muted)]">
          「できない」から始まったことも、試して、見つけて、残すことで次の一歩につながります。
        </p>
      </div>

      {/* md 以上: 2 列グリッド。読み順どおりに流し込まれる (① ② / ③ ④ / ⑤ ⑥ / ⑦ ⑧)。 */}
      <SwipeCarousel
        label="できる道の紹介（8枚）"
        desktopListClassName="md:grid md:grid-cols-2 md:gap-4"
        dotLabelSuffix="枚目を表示"
        hint="横にスワイプして続きを見る →"
        items={SLIDES.map((s, i) => ({
          key: s.src,
          node: (
            <Image
              src={s.src}
              alt={`${i + 1}枚目：${s.title} ${s.desc}`}
              width={1254}
              height={1254}
              sizes="(min-width: 48rem) 45vw, 85vw"
              className="h-auto w-full rounded-[var(--radius-lg)] border border-[var(--color-border)]"
            />
          ),
        }))}
      />
    </section>
  );
}
