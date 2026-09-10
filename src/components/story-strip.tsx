import Image from "next/image";

/**
 * トップページの「できる道って、こんな場所です」ストーリー。
 * 8 枚の連続した体験を ①→⑧ の順に並べる (指示書「幅比率・横並び枚数調整」)。
 *
 * - スライダーにしない。矢印・ドット・自動再生を持たない。固定グリッド。
 * - スクロールするだけで ①→⑧ が自然に読める。HTML の並び順は ①〜⑧ 固定。
 * - 1 行の枚数: スマホ 1 / タブレット以上 2。画像に文字が焼き込まれているので、
 *   日本語が読める大きさを優先し 3 列以上にはしない (指示書 §2 / §5 / §17)。
 * - 幅はこのコンポーネントでは決めず、ページ側の共通コンテナに従う
 *   (「試した結果の見かた」「いろいろな方法」と左右端を揃えるため)。
 * - 画像は加工・差し替え・順番変更・大きなトリミングをしない。縦横比を保つ。
 */

const SLIDES = [
  {
    src: "/comic1.png",
    title: "やりたいことがある…",
    desc: "やってみたいけれど、うまくできるか不安な最初の状態。",
  },
  {
    src: "/comic2.png",
    title: "調べてみるけど…",
    desc: "情報が多くて、自分に合う方法がなかなか見つからない。",
  },
  {
    src: "/comic3.png",
    title: "やってみたけど、うまくいかなかった…",
    desc: "実際に試したけれど、自分には合わなかった。",
  },
  {
    src: "/comic4.png",
    title: "他の人の経験を見つけた！",
    desc: "同じように悩んだ人の経験から、別の方法を知る。",
  },
  {
    src: "/comic5.png",
    title: "少しずつ、できるように！",
    desc: "いろいろ試すうちに、少しずつできることが増える。",
  },
  {
    src: "/comic6.png",
    title: "試してみたことを記録する",
    desc: "試した方法と結果を記録しておく。",
  },
  {
    src: "/comic7.png",
    title: "できる道で、もっと前に進もう！",
    desc: "試行錯誤が、自分の「道」として積み重なっていく。",
  },
  {
    src: "/comic8.png",
    title: "あなたの次の一歩へ！",
    desc: "自分の経験が、次の誰かの一歩にもつながる。",
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

      {/* スマホ 1 列 / md 以上 2 列。読み順どおりに流し込まれる (① ② / ③ ④ / ⑤ ⑥ / ⑦ ⑧)。 */}
      <ol className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SLIDES.map((s, i) => (
          <li key={s.src}>
            <Image
              src={s.src}
              alt={`${i + 1}枚目：${s.title} ${s.desc}`}
              width={1254}
              height={1254}
              sizes="(min-width: 48rem) 45vw, 92vw"
              className="h-auto w-full rounded-[var(--radius-lg)] border border-[var(--color-border)]"
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
