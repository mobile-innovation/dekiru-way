import Image from "next/image";
import { SwipeCarousel } from "@/components/swipe-carousel";

/**
 * トップページの「できる道って、こんな場所です」ストーリー。
 * 6 枚の連続した体験を ①→⑥ の順に並べる (指示書「幅比率・横並び枚数調整」。2026-10-07 に 8 枚 → 6 枚)。
 *
 * - md 以上（PC・タブレット）: 2 列 × 3 行の固定グリッド（① ② / ③ ④ / ⑤ ⑥）。
 * - md 未満（スマホ）: 横スクロールのカルーセル（2026-10-01「8枚の紹介画像」スマホ表示変更指示）。
 *   1 枚を幅の約 85% で大きく見せ、右に次の画像を少しのぞかせて「横に続く」ことを伝える。
 *   scroll-snap で 1 枚ずつ止まる。下に 6 個のドット（現在位置。押すとその画像へ）と、
 *   最初だけ小さな「横にスワイプして続きを見る →」。自動スクロールはしない（読んでいる途中で動かさない）。
 *   動き（①から開始・ドット追従など）は「いろいろな方法」と共通の SwipeCarousel。
 * - リストは 1 つで、レイアウトだけを画面幅で切り替える。HTML の並び順は ①〜⑥ 固定。
 * - 幅はこのコンポーネントでは決めず、ページ側の共通コンテナに従う
 *   (「試した結果の見かた」「いろいろな方法」と左右端を揃えるため)。
 * - 画像は加工・差し替え・順番変更・トリミングをしない。1254×1254 の縦横比を保つ。
 */

/**
 * alt は画像に焼き込まれた見出し・吹き出しの文字に合わせる
 * （2026-10-07 に 8 枚 → 6 枚へ差し替え。「高い棚の物が取りにくい」1 つの困りごとを追う構成）。
 */
const SLIDES = [
  {
    src: "/comic1.png",
    title: "あれ…これ、取りにくいな…",
    desc: "キッチンの高い棚に手を伸ばしながら「よく使うのにこんなに高いと取りにくい…」と困っている。",
  },
  {
    src: "/comic2.png",
    title: "何に困ってるんだろう？",
    desc: "「高くて手が届きにくい？」「よく使うのに毎回面倒…」「奥のものが取りにくい？」「重くて持ちにくい？」と、困りごとを考えている。",
  },
  {
    src: "/comic3.png",
    title: "同じような経験を探してみよう！",
    desc: "「同じことで困った人いるかな？」とスマホのできる道で「棚 取りにくい」を検索。収納ボックス・吊り下げラック・踏み台など、いろいろな人の試したことが見られる。",
  },
  {
    src: "/comic4.png",
    title: "これなら私にもできそう！",
    desc: "吊り下げラックを使ってみた経験を見て「この方法なら私にもできそう！」。収納ボックス、踏み台、引き出せるラックなどの方法も考えている。",
  },
  {
    src: "/comic5.png",
    title: "やってみよう！",
    desc: "前は高くて取りにくかった棚に、吊り下げラックを付けて「これを試してみよう！」。",
  },
  {
    src: "/comic6.png",
    title: "どうだった？",
    desc: "「おっ！取りやすくなった！」。いろいろな結果があっていい：できるようになった、少しできた、変化はなかった、うまくいかなかった、まだ試している。",
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

      {/* md 以上: 2 列グリッド。読み順どおりに流し込まれる (① ② / ③ ④ / ⑤ ⑥)。 */}
      <SwipeCarousel
        label={`できる道の紹介（${SLIDES.length}枚）`}
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
