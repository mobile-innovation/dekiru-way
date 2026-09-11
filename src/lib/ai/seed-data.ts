import { callJsonArray } from "@/lib/ai/client";
import { env } from "@/lib/env";
import { ATTEMPT_RESULTS, FIELD_MAX, type AttemptResultValue } from "@/lib/constants";

/**
 * 管理画面「仮データ管理」の AI 生成。
 *
 * 方針 (実装指示書 7 / 18 / 19 ＋ 生成ルール修正指示書):
 *   - これは「実在人物の体験談」ではなく、検索・表示確認のための *サンプル(仮データ)* を作る作業。
 *   - 入力キーワードは「テーマ」。そのまま difficulty にコピーしない。
 *     テーマ (活動・場面) の中で「何ができなくて困っているのか」= 具体的な行動・作業が
 *     「難しい/できない」形の困りごとを、件数分だけ別々に作る。抽象語だけの difficulty は不可。
 *   - テーマから離れた別の活動へ広げない (料理→PC、PC→階段 など)。AI 出力は分野が別へ寄ったら捨てる。
 *   - 「サンプル1」等の連番タイトルにしない。架空の人物の体験談にしない。
 *   - 診断・治療の断定、「必ず改善する」等の保証表現、危険行為の推奨は生成しない。
 *   - 1 件 = 一つの困りごと(Road 相当) + それに対して試した一つの方法・結果(Attempt 相当)。
 *   - 件数分が似通わないよう、困りごと (SEED_DOMAINS / NEUTRAL_ASPECTS) と方法 (SEED_METHOD_ANGLES) を大きく変える。
 *   - AI キー未設定時 (dev / E2E / テスト) は決定的なスタブを返す。アプリは動く。
 *   - 生成物は必ず呼び出し側で確認・編集し、非公開で保存される (API から公開=true では作らせない)。
 *
 * ※ Road に「title」列は無い (削除済み)。見出しは difficulty がそのまま担うため、
 *   difficulty を具体的な一文にすることが「タイトルが連番にならない」ことも兼ねる。
 */

export const SEED_COUNT_DEFAULT = 10;
export const SEED_COUNT_MIN = 5;
export const SEED_COUNT_MAX = 20;

/** 生成される仮データ 1 件 = Road 相当 1 件 + Attempt 相当 1 件。 */
export interface SeedExperienceDraft {
  // Road 相当
  difficulty: string | null;
  previouslyAble: string | null;
  goal: string | null;
  situation: string | null;
  /** YYYY-MM-DD */
  startedAt: string | null;
  memo: string | null;
  status: string | null;
  progress: string | null;
  nextAction: string | null;
  // Attempt 相当
  method: string;
  result: AttemptResultValue;
  /** YYYY-MM-DD */
  triedAt: string | null;
  attemptMemo: string | null;
}

/**
 * 件数分の方法が似通わないように持たせる切り口 (実装指示書 7)。
 * プロンプトに渡してバリエーションを促し、スタブ生成でも循環して使う。
 */
export const SEED_METHOD_ANGLES = [
  "道具を使う",
  "姿勢や体の向きを変える",
  "手順を分ける・順番を変える",
  "環境や場所を整える",
  "別の道具に置きかえる",
  "やり方を少し工夫する",
  "うまくいかなかったやり方",
  "部分的に楽になったやり方",
  "いま続けている途中のやり方",
  "周りの人に手伝ってもらう",
] as const;

interface Aspect {
  d: string;
  g: string;
  m: string;
}

/**
 * よくあるテーマ (活動・場面) ごとの、その中で起きる具体的な困りごと (生成ルール修正指示書 1 / 5 / 15)。
 * AI キー未設定時のスタブが「テーマから逸脱しない」困りごとを返すために使う。
 * `match` はテーマ文字列だけでなく、その分野の困りごとに出る語も拾う（AI 出力の逸脱検知にも使う）。
 */
const SEED_DOMAINS: { key: string; match: RegExp; aspects: Aspect[] }[] = [
  {
    key: "deskwork",
    match:
      /(デスクワーク|パソコン|ＰＣ|\bPC\b|キーボード|マウス|タイピング|クリック|ドラッグ|カーソル|画面の(小さ|細か)|表計算|エクセル|入力作業|事務作業)/i,
    aspects: [
      { d: "キーボードで文字を入力するのが難しい", g: "パソコンで必要な文字入力ができるようになりたい", m: "キーの大きいキーボードに替え、休憩をはさみながら入力した" },
      { d: "マウスを細かく動かして狙った位置に合わせるのが難しい", g: "マウスで細かい選択ができるようになりたい", m: "ポインタの速度を落とし、手首を台にのせて動かした" },
      { d: "画面の小さなボタンやリンクを正確にクリックするのが難しい", g: "画面の小さな対象を選べるようになりたい", m: "表示を拡大し、クリックできる範囲を大きくする設定に変えた" },
      { d: "パソコン画面の小さな文字を読み続けるのが難しい", g: "長い時間でも画面の文字を読めるようになりたい", m: "文字を大きくし、明るさとコントラストを調整して時々目を休めた" },
      { d: "ファイルをドラッグして移動する操作を続けるのが難しい", g: "ドラッグの操作を安定してできるようになりたい", m: "ドラッグの代わりに切り取り・貼り付けの操作に替えた" },
      { d: "長い時間座ってパソコン作業を続けるのが難しい", g: "必要な時間だけ座って作業を続けられるようになりたい", m: "高さの合う椅子に替え、30分ごとに立って体を伸ばした" },
      { d: "複数のキーを同時に押すショートカット操作がうまくできない", g: "よく使う操作を無理なく実行できるようになりたい", m: "同時押しを1キーずつ押せる設定にし、よく使う操作を登録した" },
      { d: "表計算の細かいセル移動や範囲選択が難しい", g: "表の入力や編集を落ち着いてできるようになりたい", m: "行と列に色をつけ、拡大表示で1セルずつ確認しながら入力した" },
    ],
  },
  {
    key: "cooking",
    match:
      /(料理|調理|台所|キッチン|炊事|自炊|献立|包丁|まな板|フライパン|鍋を|食材|調味料|コンロ|火加減|食器)/,
    aspects: [
      { d: "包丁で食材を切るのが難しい", g: "食材を自分で安全に切れるようになりたい", m: "滑りにくいまな板と握りやすい包丁に替え、座って切った" },
      { d: "鍋やフライパンを持ち上げて移動させるのが難しい", g: "鍋を無理なく扱えるようになりたい", m: "軽い調理器具に替え、短い距離で少しずつ動かした" },
      { d: "調味料のびんや袋を開けるのが難しい", g: "調味料を自分で開けられるようになりたい", m: "オープナー器具と滑り止めを使って開けた" },
      { d: "立ったまま料理を続けるのが難しい", g: "座ったままでも一通りの調理ができるようになりたい", m: "調理台の前に椅子を置き、座ってできる作業から進めた" },
      { d: "コンロの火加減つまみの操作や確認が難しい", g: "火加減を安心して調整できるようになりたい", m: "目盛りの見やすいカバーをつけ、点火と消火を声に出して確認した" },
      { d: "熱い鍋に食材を入れるときに手元が定まらず、こわい", g: "熱い鍋への出し入れを落ち着いてできるようになりたい", m: "トングと耐熱手袋を使い、食材を器に用意してから入れた" },
      { d: "料理の手順を覚えて複数を同時に進めるのが難しい", g: "手順を確認しながら順番に作れるようになりたい", m: "作る順番を紙に書き、1品ずつ仕上げるようにした" },
      { d: "食器や鍋を運ぶのが難しい", g: "配膳や片づけを自分でできるようになりたい", m: "滑り止めのトレイを使い、一度に運ぶ量を減らした" },
    ],
  },
  {
    key: "outing",
    match:
      /(外出|お出かけ|買い物|買物|通院|散歩|外を歩|交通機関|電車|バス|階段|段差|靴を履|歩き続け|長い距離を歩|道順)/,
    aspects: [
      { d: "玄関で靴を履くのが難しい", g: "出かける前に自分で靴を履けるようになりたい", m: "靴べらと椅子を玄関に置き、座って履いた" },
      { d: "長い距離を歩き続けるのが難しい", g: "目的地まで休みながら歩けるようになりたい", m: "途中に座れる場所を決め、歩く距離を分けて計画した" },
      { d: "段差や階段を上り下りするのがこわい", g: "段差を不安なく越えられるようになりたい", m: "手すりのある側を歩き、片足ずつゆっくり下りた" },
      { d: "公共交通機関の乗り降りが難しい", g: "電車やバスを一人で利用できるようになりたい", m: "すいている時間帯を選び、乗る位置と降り方を前もって確認した" },
      { d: "荷物を持って移動するのが難しい", g: "買い物の荷物を無理なく持ち帰れるようになりたい", m: "キャリーカートを使い、買う量を分けて何回かに分けた" },
      { d: "外で立ったまま順番を待つのがつらい", g: "待ち時間を体に負担なく過ごせるようになりたい", m: "折りたたみの杖椅子を持ち歩き、待つ場所を決めておいた" },
      { d: "知らない場所で道順を覚えて進むのが難しい", g: "目的地まで迷わず行けるようになりたい", m: "目印と曲がる場所をメモにして、順を追って確認した" },
      { d: "外出の準備に時間がかかって大変で、出かける前に疲れてしまう", g: "準備を手早く整えられるようになりたい", m: "持ち物リストを玄関に貼り、前日にかばんへ入れた" },
    ],
  },
  {
    key: "cleaning",
    match: /(掃除|清掃|片づけ|片付け|そうじ|拭き掃除|掃除機|雑巾|ほこり|ゴミ出し|ゴミを)/,
    aspects: [
      { d: "掃除機をかけながら家の中を動き回るのが難しい", g: "必要な範囲に掃除機をかけられるようになりたい", m: "軽いコードレス掃除機に替え、部屋ごとに分けてかけた" },
      { d: "床にかがんで拭き掃除をするのが難しい", g: "かがまずに床の掃除ができるようになりたい", m: "柄の長いモップを使い、立ったまま拭いた" },
      { d: "高い所のほこりを取るのが難しい", g: "手の届かない所も掃除できるようになりたい", m: "伸縮する柄のはたきを使い、安定した場所に立って作業した" },
      { d: "雑巾を固く絞るのが難しい", g: "雑巾を使った拭き掃除ができるようになりたい", m: "絞り器と使い捨てシートを使い、力の要らない方法に替えた" },
      { d: "重い物をどかして掃除するのが難しい", g: "家具の周りも掃除できるようになりたい", m: "家具の下に滑らせるマットを敷き、少しずつ動かした" },
      { d: "ゴミをまとめて出す一連の作業が難しい", g: "ゴミ出しを自分でできるようになりたい", m: "小さめの袋に分け、玄関近くに一時置き場を作った" },
      { d: "立ったりしゃがんだりを繰り返す片づけがつらい", g: "体に負担をかけずに片づけられるようになりたい", m: "片づける物を一度机に集め、座って仕分けした" },
      { d: "掃除を最後まで続けるのが難しく、途中で疲れてしまう", g: "休みながら一通り掃除できるようになりたい", m: "場所を3つに分け、1か所ごとに休憩を入れた" },
    ],
  },
  {
    key: "laundry",
    match: /(洗濯|洗たく|物干し|干す|取り込み|アイロン|洗濯ばさみ|洗濯物)/,
    aspects: [
      { d: "洗濯物を干すために腕を上げ続けるのが難しい", g: "洗濯物を自分で干せるようになりたい", m: "低い位置の物干しを使い、座ってピンチハンガーに留めた" },
      { d: "洗濯ばさみをつまんで開くのが難しい", g: "洗濯ばさみを使えるようになりたい", m: "弱い力でも開くばさみに替え、留める数を減らして干した" },
      { d: "濡れて重くなった洗濯物を持ち上げるのが難しい", g: "洗濯物の出し入れを自分でできるようになりたい", m: "小分けにして脱水を長めにかけ、かごを台の上に置いた" },
      { d: "洗濯物をたたむ細かい手作業が難しい", g: "洗濯物をたためるようになりたい", m: "たたむ回数を減らせる干し方にし、机の上で作業した" },
      { d: "洗濯機の細かいボタン操作や表示の確認が難しい", g: "洗濯機を自分で操作できるようになりたい", m: "よく使うコースに印をつけ、手順をメモにして貼った" },
      { d: "高い物干しざおに手が届かず干すのが難しい", g: "無理なく手の届く高さで干せるようになりたい", m: "昇降式の物干しを使い、低くしてから干した" },
      { d: "取り込んだ洗濯物を運ぶのが難しい", g: "洗濯物を部屋まで運べるようになりたい", m: "キャスター付きのかごを使い、一度に運ぶ量を減らした" },
      { d: "アイロンをかけるために立って腕を動かし続けるのが難しい", g: "必要な物だけアイロンをかけられるようになりたい", m: "座ってできる小型アイロンを使い、かける枚数を絞った" },
    ],
  },
];

/**
 * どの分野にも当てはまる、作業のつまずき。テーマに専用の分野がないときのスタブに使う。
 * テーマとのつながりは `situation`（「<テーマ>」に取り組むときの場面）で保ち、
 * difficulty 文自体にはテーマを差し込まない（キーワード変換ルール修正指示書 2 / 6:
 * 「「手芸」で、〜」のようにテーマを主語・原因として文へ無理やり入れるのは不自然で禁止）。
 */
const NEUTRAL_ASPECTS: Aspect[] = [
  { d: "細かい手先の作業を正確に行うのが難しい", g: "細かい作業を自分でできるようになりたい", m: "持ちやすい道具に替え、手元を安定させて行った" },
  { d: "長い時間、同じ作業を続けるのがつらい", g: "必要な時間だけ作業を続けられるようになりたい", m: "作業を短く区切り、こまめに休憩を入れた" },
  { d: "手順を覚えて順番どおり進めるのが難しい", g: "手順を確認しながら落ち着いて進められるようになりたい", m: "手順を1枚のメモに書き出し、終わった所にチェックを入れた" },
  { d: "同じ姿勢を保ち続けるのがつらい", g: "楽な姿勢で作業を続けられるようになりたい", m: "支えになる物のそばで行い、時々姿勢を変えた" },
  { d: "力の加減がわからず、道具や物をうまく扱うのが難しい", g: "ちょうどよい力かげんで扱えるようになりたい", m: "軽い力で使えるものに替え、ゆっくり動かした" },
  { d: "重い物や大きい物を持ち上げて動かすのが難しい", g: "重い物を無理なく動かせるようになりたい", m: "小分けにして運び、台やカートを使った" },
  { d: "固いふたや留め具を開けたり回したりするのが難しい", g: "固いものを自分で開けられるようになりたい", m: "滑り止めとオープナー器具を使った" },
  { d: "小さな部品やボタンをつまんで扱うのが難しい", g: "小さいものを自分で扱えるようになりたい", m: "先の細い道具を使い、明るい場所で作業した" },
  { d: "一連の作業を最後まで一人で続けるのが難しい", g: "休みながら一人で最後までできるようになりたい", m: "作業を3つに分け、区切りごとに短い休憩を入れた" },
  { d: "細かい文字や表示を見ながら作業を進めるのが難しい", g: "表示を確認しながら安心して進められるようになりたい", m: "手元ライトと拡大鏡を使い、表示を大きくした" },
  { d: "準備や片づけに時間がかかって大変で、それだけで疲れてしまう", g: "準備を手早く整えられるようになりたい", m: "よく使う物を1か所にまとめ、始める前に用意した" },
  { d: "作業に集中し続けるのが難しく、途中で分からなくなる", g: "最後まで落ち着いて進められるようになりたい", m: "静かな時間帯を選び、一度に扱う物を減らした" },
  { d: "朝と夕方で体の動かしやすさが違い、時間帯によって同じ作業でも難しい", g: "調子の良い時間帯に作業をまとめられるようになりたい", m: "動きやすい時間帯を記録し、その時間に予定を寄せた" },
  { d: "前の日の疲れが残っていると、その日の作業に取りかかるのがつらい", g: "疲れをためずに毎日の作業を続けられるようになりたい", m: "前日の作業量を控えめにし、朝はゆっくり始めた" },
  { d: "暑い日や寒い日は、いつもの作業を続けるのがつらい", g: "気温に左右されずに作業できるようになりたい", m: "室温を整え、こまめに水分をとって短く区切った" },
  { d: "まぶしさや明るさの変化が気になって、作業に集中するのが難しい", g: "明るさが変わっても落ち着いて作業できるようになりたい", m: "手元だけを一定の明るさにし、直射光を避ける位置に変えた" },
  { d: "近くで物音が続くと気がそれて、作業を進めるのが難しい", g: "音があっても作業を続けられるようになりたい", m: "耳栓や静かな時間帯を使い、区切りを短くした" },
  { d: "立ち上がった直後にふらついて、動き出すのがこわい", g: "動き始めをふらつかずにできるようになりたい", m: "立ってから一呼吸おき、支えに手を添えてから歩き出した" },
  { d: "手の動かしやすさが日によって大きく変わり、予定を立てるのが難しい", g: "体調に合わせて予定を調整できるようになりたい", m: "作業を「必ず」と「できれば」に分け、当日に選べるようにした" },
  { d: "同じ場所を何度も行き来する動きが多く、途中で疲れてしまってつらい", g: "行き来を減らして体力を保てるようになりたい", m: "必要な物を先にまとめて運び、往復の回数を減らした" },
  { d: "細かい判断を続けると頭が疲れて、作業の続きが難しい", g: "頭の疲れをためずに判断を続けられるようになりたい", m: "判断のいる作業を午前に寄せ、合間に短い休憩を入れた" },
  { d: "一度手を止めると、どこまで進めたか分からなくなって再開が難しい", g: "中断しても続きからすぐ再開できるようになりたい", m: "止めるときに「次の一手」を1行書いて見える所に貼った" },
  { d: "早くしなければと気持ちが焦って、かえって手を動かしづらい", g: "焦らず自分のペースで進められるようになりたい", m: "時間に余裕をもたせ、終わりの時刻ではなく手順で区切った" },
  { d: "予定外のことが起きると立て直すのが難しく、作業が止まってしまう", g: "予定が乱れても作業に戻れるようになりたい", m: "作業の区切りをこまめにし、戻る場所を決めておいた" },
  { d: "必要な物を目で探すのに時間がかかり、なかなか見つからず作業が滞って大変", g: "必要な物をすぐ手に取れるようになりたい", m: "置き場所を決めてラベルを貼り、使ったら戻すようにした" },
  { d: "同じ動作を繰り返すと手首や指が痛くなって、続けるのが難しい", g: "痛みを出さずに繰り返し作業を続けられるようになりたい", m: "10分ごとに手を休め、負担の少ない持ち方に変えた" },
  { d: "椅子から立ち上がったり座ったりを繰り返すのがつらい", g: "立ち座りを負担なくできるようになりたい", m: "肘かけ付きの椅子にし、動きの回数を減らす配置にした" },
  { d: "手に持った物を落とさずに保つのが難しい", g: "物を落とさずに扱えるようになりたい", m: "滑り止め付きの手袋を使い、両手で支えて運んだ" },
  { d: "つまみやハンドルをひねって回す動作が難しい", g: "回す操作を自分でできるようになりたい", m: "太くて回しやすいグリップを取り付けた" },
  { d: "引いたり押したりして力を加える動作が難しい", g: "押し引きの操作を無理なくできるようになりたい", m: "軽い力で動くものに替え、体重をのせて押した" },
  { d: "説明を一度で聞き取って覚えておくのが難しい", g: "説明を確認しながら進められるようになりたい", m: "要点をメモに取り、あとで見返せるようにした" },
  { d: "二つのことを同時に進める「ながら作業」が難しい", g: "一つずつ落ち着いて進められるようになりたい", m: "作業を一つずつに分け、順番に片づけた" },
  { d: "見本や手元を見比べながら位置を合わせるのが難しい", g: "位置合わせを落ち着いてできるようになりたい", m: "目印を付け、拡大して一か所ずつ確認した" },
  { d: "手が冷えていると、指先を思うように動かすのが難しい", g: "手が冷えても作業を続けられるようになりたい", m: "作業前に手を温め、握りやすい道具に替えた" },
];

/** テーマ文字列 / 困りごと文が、どの分野に属するか (無ければ null)。 */
export function seedDomainKey(text: string): string | null {
  const s = text ?? "";
  for (const dom of SEED_DOMAINS) {
    if (dom.match.test(s)) return dom.key;
  }
  return null;
}

function domainFor(text: string): (typeof SEED_DOMAINS)[number] | null {
  const key = seedDomainKey(text);
  return key ? (SEED_DOMAINS.find((d) => d.key === key) ?? null) : null;
}

const SEED_SYSTEM_PROMPT = `あなたは「できる道」というサービスの、管理者向けのテスト用サンプルデータ作成ツールです。
これは実在する人物の体験談ではなく、検索や画面表示を確認するための「サンプル（仮データ）」を作る作業です。

■ 困りごと（difficulty）の作り方
- 入力キーワードは「テーマ」であり、必ずしも具体的な困りごとではありません。
- スペースで区切られている場合は複数のテーマです。全テーマを取り上げ、生成件数を各テーマにおおよそ均等に割り振ってください。
- 入力キーワードから「何ができなくて困っているのか」という具体的な困りごとを生成してください。
- difficulty は必ず「具体的な行動・作業が『難しい』『できない』」という形にしてください。
  良い例: 「包丁で食材を切るのが難しい」「立ったまま料理を続けるのが難しい」「ペットボトルのふたを開けるのが難しい」
  悪い例: 「料理」「料理を作る」「外出」「歩く」「生活」「料理について困っている」「料理（サンプル1）」
- 入力キーワードをそのまま difficulty にコピーしないでください。
- 「料理」「外出」「歩く」「生活」などの抽象的なテーマが入力された場合は、そこから具体的な困りごとを複数考えてください。
- 入力がすでに具体的な困りごとの場合は、意味を保ったまま自然な一文にしてください（例: 入力「靴下が履きにくい」→「靴下を一人で履くのが難しい」）。

■ キーワードの意味を正しく扱う（キーワード変換ルール修正指示書）
- 入力キーワードは「本人がしたいこと・していること・場面・活動」として扱ってください。
  キーワード自体を、困難の原因や身体症状のように扱わないでください。
- 次のような「キーワードを文にそのまま組み込むだけ」の生成は禁止します。
  禁止例: 「「手芸」で、細かい手先の作業を正確に行うのが難しい」
  禁止例: 「手芸することが難しい」「手芸ができなくて困っている」
  禁止例: 「「料理を作る」で、料理を作ることが難しい」
- difficulty の文中に入力キーワードをそのまま含める必要はありません。むしろ、自然な文にするために
  不要であれば省略してください（キーワードは「その活動をする場面で何に困っているか」を考えるための
  手がかりに過ぎません）。
  例: 入力「手芸」→「細かい手作業が難しく、作業に時間がかかる」（キーワードを含まなくてよい）
- 優先して考える要素: 具体的な動作／道具の操作／姿勢・移動／力加減／手先の操作／疲れやすさ／
  時間がかかること／安全面／一人で行う難しさ。ただし、キーワードだけからは分からない具体的な
  作業内容・症状を根拠なく断定しないでください。

■ テーマから離れない（最重要）
- 生成する困りごとは、必ず入力テーマの活動・場面の中で起きるものにしてください。
  入力を単なる連想の起点にして、別の活動へ広げないでください（例: 入力「デスクワーク PC」で「包丁を使うのが難しい」「階段を上るのが難しい」は不可）。
- 「大きなテーマ」でも、その範囲の中の具体的な作業に絞ってください
  （例: 入力「料理」→ 包丁・鍋・調味料のふた・立ち仕事 は可 / PC操作・階段・外出 は不可）。
- 複数テーマ（スペース区切り）のときは、どちらのテーマにも自然につながる内容を優先してください。
  片方だけに広げたり、両方から離れた作業へ広げたりしないでください。

■ 各候補の自己チェック（1つでも当てはまらなければ、その候補は捨てて作り直す）
1. 入力テーマの活動・場面に直接関係しているか
2. 入力から離れた別の活動になっていないか
3. 具体的に「できない・難しいこと」になっているか（テーマ・カテゴリ名だけになっていないか）
4. difficulty / goal / method（試したこと）が、同じ一つの困りごとについて一貫しているか
5. キーワードそのものを困難の原因や動作の主語として扱っていないか
   （「◯◯が難しい」の◯◯がキーワードそのものになっていないか）
6. キーワードを文へ無理やり差し込んでいないか（「「キーワード」で、〜」の形になっていないか）
7. 実際の動作・場面として一読して自然に理解できる文になっているか

■ そのほか
- goal は「何ができるようになりたいか」を、その困りごとに対応する具体的な形で書いてください（キーワードの繰り返しは禁止）。
- 「サンプル1」「サンプル2」「テスト1」などの連番・通し番号を文中に入れないでください。
- 架空の人物の名前・年齢・職業・経歴を出さず、実在者の体験談のように書かないでください。
- 生成データはテスト・サンプル用の仮データです。
- 指定件数どうしが似た言い換えにならないよう、困りごとと方法の両方を十分に変えてください。
- うまくいかなかった方法・変化がなかった方法・まだ試している途中の方法も混ぜてください。

■ 安全
- 診断・治療方針・薬の服用・医療行為を断定しないでください。「必ず治る」「必ず改善する」等の保証表現も使わないでください。
- 危険な行為・無理な動作を「試す方法」として書かないでください。
- 病名・障害名を推測して当てないでください。

出力は指定された JSON のみ。`;

/** キーワード欄の入力をテーマ配列にする。スペース (半角/全角/タブ) 区切り＝複数テーマ (AND)。 */
export function parseSeedThemes(keyword: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (keyword ?? "").split(/[\s　]+/)) {
    const t = part.trim();
    if (t.length === 0) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  if (out.length > 0) return out;
  const whole = (keyword ?? "").trim();
  return whole.length > 0 ? [whole] : [];
}

/** 過去データを、AI に渡す「これと重複させない」リストの文字列にする。多すぎると邪魔なので最新 60 件まで。 */
function priorBlock(existing: PriorSeedItem[], count: number): string {
  const items = existing.slice(-60);
  if (items.length === 0) return "";
  const lines = items
    .map((e, i) => `${i + 1}. 困りごと: ${e.difficulty ?? "(なし)"} / 方法: ${e.method} / 結果: ${e.result ?? "-"}`)
    .join("\n");
  return (
    `\n■ すでに出した仮データ（同じテーマ。保存済み＋今回の画面に表示中の分）。\n` +
    `  これは「再生成」です。同じ内容・実質的に同じ内容・単なる言い換えを絶対に出さないでください:\n` +
    `${lines}\n` +
    `上記で使われている観点・道具・場面は避け、まだ扱っていない別の観点の困りごとから ${count} 件を作ってください。\n` +
    `（例:「デスクワーク」なら 肩や首の負担 / マウス操作 / 画面の文字 / 座り姿勢 / タイピング / 休憩の取り方 … のように毎回ちがう観点で）\n`
  );
}

function buildUserPrompt(themes: string[], count: number, existing: PriorSeedItem[] = []): string {
  const themeLine = themes.map((t) => `「${t}」`).join(" ");
  const head =
    themes.length >= 2
      ? `テーマ（入力キーワード）: ${themeLine}\n\n` +
        `これは複数のテーマです。すべてのテーマを取り上げ、生成する ${count} 件を各テーマにおおよそ均等に割り振ってください。\n` +
        `各件の difficulty は、いずれか 1 つのテーマの活動・場面の中で起きる「具体的な行動・作業が難しい／できない」一文にしてください。\n` +
        `テーマから離れた別の活動の困りごとは作らないでください。\n\n`
      : `テーマ（入力キーワード）: ${themeLine}\n\n` +
        `このテーマの活動・場面の中で、何ができなくて困っているのかを具体的に ${count} 通り考え、\n` +
        `それぞれを 1 件の困りごと(difficulty)にしてください。テーマから離れた別の活動の困りごとは作らないでください。\n\n`;
  return (
    head +
    `方法(method)の切り口も 1 件ずつ変えてください（${SEED_METHOD_ANGLES.join(" / ")} など）。\n` +
    priorBlock(existing, count) +
    `\n■ 重複を避ける（優先順位: テーマ適合 ＞ 重複回避 ＞ 新しい切り口 ＞ バリエーション）:\n` +
    `- 過去データと同じ困りごと・同じ方法にしない。表現を変えただけの言い換えも禁止。\n` +
    `  （例: 「軽いマウスに変える」「軽量マウスに変更する」「マウスを軽くする」は同じ内容）\n` +
    `- 今回の ${count} 件どうしも、困りごと・方法が実質的に重ならないようにする。\n` +
    `- 「サンプル1」「サンプル2」のように番号だけで差をつけない。\n\n` +
    `■ ${count} 件を作ったら、次を自己チェックし、当てはまるものは作り直す:\n` +
    `  □ テーマから逸脱していない  □ 過去データと重複していない  □ ${count} 件どうしで重複していない\n` +
    `  □ 単なる言い換えになっていない  □ 困りごと・方法が具体的  □ 番号だけで差別化していない\n` +
    `  □ キーワードを主語・原因として扱っていない  □ 「「キーワード」で、〜」の形になっていない\n` +
    `新しい内容を出すためにテーマから外れることは絶対にしないでください。\n\n` +
    `各件は次のキーを持つオブジェクトにしてください（不要な項目は null）:\n` +
    `- difficulty: 具体的な行動・作業が「難しい／できない」という一文（必須。キーワードのコピー禁止。\n` +
    `  「「キーワード」で、〜」「キーワードすることが難しい」のようにキーワードを主語・原因として\n` +
    `  文へ差し込むのも禁止。文中にキーワードを含める必要はない）\n` +
    `- previouslyAble: 以前はできていたこと\n` +
    `- goal: その困りごとに対して「何ができるようになりたいか」\n` +
    `- situation: 困る場面\n` +
    `- startedAt: 難しくなった時期（"YYYY-MM-DD" もしくは null）\n` +
    `- memo: 困りごとの補足メモ\n` +
    `- status: 状態のラベル（例: 継続中 / 一区切り）\n` +
    `- progress: いまの進み具合\n` +
    `- nextAction: 次に試そうと思っていること\n` +
    `- method: 試した一つの方法（必須）\n` +
    `- result: 結果。必ず "success" | "partial" | "no_change" | "failed" | "ongoing" のいずれか\n` +
    `- triedAt: 試した時期（"YYYY-MM-DD" もしくは null）\n` +
    `- attemptMemo: その方法で気づいたこと\n\n` +
    `出力はこの形の JSON のみ: {"items": [ { ...上のキー... } ]}`
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clampText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function isoDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!ISO_DATE.test(t)) return null;
  const d = new Date(`${t}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // ロールオーバー ("2025-13-40" → 別の日付) を弾く。
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/** 5 分類以外は必ず "ongoing" に寄せる (実装指示書 6 / 22)。日本語で返ってきた場合もゆるく対応。 */
export function coerceResult(v: unknown): AttemptResultValue {
  const s = String(v ?? "").trim().toLowerCase();
  if ((ATTEMPT_RESULTS as readonly string[]).includes(s)) return s as AttemptResultValue;
  // 「少しできた」が「できた」で success に落ちないよう partial を先に見る。
  if (/(少し|部分)/.test(s)) return "partial";
  if (/(できるように|できた|成功)/.test(s)) return "success";
  if (/(変化|変わらな|かわらな)/.test(s)) return "no_change";
  if (/(失敗|うまくいか|だめ|ダメ)/.test(s)) return "failed";
  return "ongoing";
}

function normalizeOne(raw: unknown): SeedExperienceDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const method = clampText(o.method, FIELD_MAX.text);
  if (!method) return null;
  return {
    difficulty: clampText(o.difficulty, FIELD_MAX.text),
    previouslyAble: clampText(o.previouslyAble, FIELD_MAX.text),
    goal: clampText(o.goal, FIELD_MAX.text),
    situation: clampText(o.situation, FIELD_MAX.text),
    startedAt: isoDateOrNull(o.startedAt),
    memo: clampText(o.memo, FIELD_MAX.longText),
    status: clampText(o.status, FIELD_MAX.statusLabel),
    progress: clampText(o.progress, FIELD_MAX.text),
    nextAction: clampText(o.nextAction, FIELD_MAX.text),
    method,
    result: coerceResult(o.result),
    triedAt: isoDateOrNull(o.triedAt),
    attemptMemo: clampText(o.attemptMemo, FIELD_MAX.longText),
  };
}

const SAMPLE_NUMBERING = /(サンプル|テスト|例|no\.?|＃|#)\s*[0-9０-９]+/i;
const DIFFICULTY_MARKER = /(難し|むずかし|つら|辛|こわ|怖|大変|しんど|にくい|づらい|できな|できず|苦労)/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 「手芸」で、〜 のように、テーマ(キーワード)をかっこ／引用符で囲んで文頭に置き、
 * 助詞で文へ接続する不自然な形（キーワード変換ルール修正指示書 2・9 チェック1〜3）。
 */
function startsWithBracketedThemeClause(d: string, themes: string[]): boolean {
  for (const t of themes) {
    if (!t) continue;
    const esc = escapeRegExp(t);
    const re = new RegExp(`^[「『"'（(]\\s*${esc}\\s*[」』"'）)]\\s*(で|は|が|の|を|に|、|,)`);
    if (re.test(d)) return true;
  }
  return false;
}

/**
 * 手芸することが難しい／手芸ができなくて困っている のように、テーマ(キーワード)そのものを
 * 動作の主語として文頭に置き、そのまま「〜が難しい／できない」に流し込んだ不自然な形。
 */
function isThemeAsSubjectClause(d: string, themes: string[]): boolean {
  for (const t of themes) {
    if (!t) continue;
    const esc = escapeRegExp(t);
    const re = new RegExp(`^${esc}(を|が)?(する|できる)?(こと)?(が|は)?(難し|むずかし|できな|うまくいかな)`);
    if (re.test(d)) return true;
  }
  return false;
}

/**
 * difficulty が「具体的な行動・作業が難しい／できない」形になっているか
 * (生成ルール修正指示書 2 / 12、キーワード変換ルール修正指示書)。
 * 入力キーワード (スペース区切りの各テーマを含む) そのまま・抽象的なテーマだけ・
 * テーマを文頭に無理やり差し込んだ形・「サンプル1」等の連番は不可。
 */
export function isConcreteDifficulty(
  difficulty: string | null | undefined,
  keyword: string,
): boolean {
  const d = (difficulty ?? "").trim();
  if (d.length < 6) return false;
  if (SAMPLE_NUMBERING.test(d)) return false;
  // 末尾の「（…）」や「について / に関して / のこと」を外してテーマと突き合わせる。
  const core = d
    .replace(/[（(][^（(）)]*[）)]\s*$/g, "")
    .replace(/(について|に関して|のこと|の話|全般)\s*$/g, "")
    .trim();
  if (core.length < 6) return false;
  const themes = [keyword.trim(), ...parseSeedThemes(keyword)];
  if (themes.some((t) => t.length > 0 && (core === t || d === t))) return false;
  if (startsWithBracketedThemeClause(d, themes)) return false;
  if (isThemeAsSubjectClause(d, themes)) return false;
  return DIFFICULTY_MARKER.test(d);
}

// ---- 実質的な重複 (言い換え) の判定 (「毎回結果を変える」指示書 5 / 6 / 7) ----

/** 過去に生成済みの仮データ 1 件（重複回避の参照用）。 */
export interface PriorSeedItem {
  difficulty: string | null;
  method: string;
  result?: string | null;
}

// 置換結果を前後の文字とくっつけないよう、必ずスペースで囲む (漢字連結によるトークン化崩れを防ぐ)。
const SYNONYM_FOLDS: [RegExp, string][] = [
  // 「休憩」系はフレーズごとまとめて 1 トークンに (こまめに休憩 / 一定時間ごとに休憩 / 休憩を増やす … は同じ)。
  [
    /(こまめに|定期的に|一定時間ごとに?|一定の時間ごとに?|時間ごとに|頻繁に|ときどき|時々|適宜|よく)?\s*(休憩|休み|小休止|一休み)(を(増やす|多くする|多めに(する|とる)|とる|取る|入れる|はさむ|挟む))?/g,
    " 定期休憩 ",
  ],
  [/軽量|かるい|軽い|軽く|軽め/g, " 軽 "],
  [/小型|小さい|小さな|コンパクト|ちいさ/g, " 小 "],
  [/大型|大きい|大きな|おおき/g, " 大 "],
  [/変更|変える|替える|かえる|置きかえ|置き換え|切り替え|切りかえ|見直す|見直し/g, " 変 "],
  [/減らす|少なくする|抑える|へらす/g, " 減 "],
  [/増やす|多くする|ふやす/g, " 増 "],
  [/道具|器具|ツール|用具/g, " 道具 "],
  [/画面|ディスプレイ|モニター|モニタ/g, " 画面 "],
  [/椅子|いす|チェア/g, " 椅子 "],
];

const MEANING_STOP = new Set([
  "作業", "方法", "場合", "場面", "時間", "自分", "一連", "一人", "必要", "内容",
  "様子", "状態", "程度", "部分", "全体", "以前", "今回", "前回", "毎回", "一つ",
  "一件", "使用", "利用", "実施", "とき",
]);

/**
 * 「実質的に同じ内容か」を判定するための意味トークン集合。
 * 助詞・言い換え・記号を落とし、カタカナ語 (2 字以上) と漢字の連なりだけを残す。
 */
export function meaningTokens(text: string | null | undefined): Set<string> {
  let s = (text ?? "").toLowerCase().replace(/（[^）]*）|\([^)]*\)/g, "");
  for (const [re, to] of SYNONYM_FOLDS) s = s.replace(re, to);
  const toks = s.match(/[ぁ-ん]*[ァ-ヴ][ァ-ヴー]+|[一-龠々]+/g) ?? [];
  const out = new Set<string>();
  for (const t of toks) {
    const k = t.replace(/^[ぁ-ん]+/, "");
    if (k.length === 0 || MEANING_STOP.has(k)) continue;
    out.add(k);
  }
  return out;
}

/**
 * 2 つの文が「実質的に同じ内容」(単なる言い換え) か。
 * 意味トークンの重なりが大きい / 小さい側が丸ごと含まれるときに true。
 */
export function nearDuplicate(a: string | null | undefined, b: string | null | undefined): boolean {
  const at = (a ?? "").trim();
  const bt = (b ?? "").trim();
  if (at.length === 0 || bt.length === 0) return at === bt;
  if (at === bt) return true;
  const A = meaningTokens(a);
  const B = meaningTokens(b);
  if (A.size === 0 || B.size === 0) return at === bt;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  const minSize = Math.min(A.size, B.size);
  if (inter / union >= 0.6) return true;
  // 小さい側 (2 語以下) が大きい側に丸ごと含まれる = 言い換え
  if (minSize <= 2 && inter >= minSize) return true;
  return false;
}

/** draft が、すでに採用済み / 過去データ のどれかと実質的に重複しているか。 */
function isDraftDuplicate(
  draft: { difficulty: string | null; method: string },
  priorDifficulties: string[],
  priorMethods: string[],
): boolean {
  for (const pd of priorDifficulties) {
    if (nearDuplicate(draft.difficulty, pd)) return true;
  }
  for (const pm of priorMethods) {
    if (nearDuplicate(draft.method, pm)) return true;
  }
  return false;
}

/**
 * AI レスポンス (unknown[]) を安全な draft 配列へ。
 *   - 不正な要素・method 欠落は捨てる
 *   - difficulty が具体的な困りごとになっていない要素は捨てる (isConcreteDifficulty)
 *   - テーマに分野がある場合、その困りごと・試したことが *別の分野* に属する要素は
 *     テーマ逸脱として捨てる（例: テーマ「デスクワーク PC」で「包丁で食材を切る」）
 *   - 過去に生成済み (opts.existing) と実質的に重複する要素は捨てる
 *   - 今回の 10 件どうしでも実質的に重複する要素は捨てる (単なる言い換えの水増し防止)
 *   - count 件に切り詰める
 * 入力がどれだけ壊れていても throw せず配列を返す。
 */
export function normalizeDrafts(
  rawItems: unknown,
  keyword: string,
  count: number,
  opts: { existing?: PriorSeedItem[] } = {},
): SeedExperienceDraft[] {
  const arr = Array.isArray(rawItems) ? rawItems : [];
  const themeDomain = seedDomainKey(keyword);
  const priorDifficulties = (opts.existing ?? [])
    .map((e) => e.difficulty)
    .filter((v): v is string => !!v && v.trim().length > 0);
  const priorMethods = (opts.existing ?? [])
    .map((e) => e.method)
    .filter((v) => !!v && v.trim().length > 0);
  const out: SeedExperienceDraft[] = [];
  for (const raw of arr) {
    const d = normalizeOne(raw);
    if (!d) continue;
    if (!isConcreteDifficulty(d.difficulty, keyword)) continue;
    // テーマ逸脱チェック: テーマが特定分野なら、困りごと/試したことが別分野に寄っていたら捨てる。
    if (themeDomain) {
      const other = seedDomainKey(`${d.difficulty ?? ""} ${d.method}`);
      if (other && other !== themeDomain) continue;
    }
    // 過去データ + すでに採用した今回分と、実質的に重複していたら捨てる。
    const acceptedDifficulties = out
      .map((o) => o.difficulty)
      .filter((v): v is string => !!v);
    const acceptedMethods = out.map((o) => o.method);
    if (
      isDraftDuplicate(d, [...priorDifficulties, ...acceptedDifficulties], [
        ...priorMethods,
        ...acceptedMethods,
      ])
    ) {
      continue;
    }
    out.push(d);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * result ごとの気づきメモ。医療的な断定はしない。
 * 一般公開面では通常の経験と同じ見た目で出るため、「サンプル」等の文言は本文に入れない
 * （仮データの判別は Road.isSeedData / dataOrigin と管理画面で行う）。
 */
function stubAttemptMemo(result: AttemptResultValue): string {
  switch (result) {
    case "success":
      return "この方法で、必要な作業がひととおりできるようになった";
    case "partial":
      return "作業はしやすくなったが、細かいところはまだ難しい";
    case "no_change":
      return "やり方を変えてみたが、難しさの感じ方は特に変わらなかった";
    case "failed":
      return "この方法は合わず、かえってやりにくく感じた";
    case "ongoing":
      return "いま試している途中で、少しずつ調整している";
  }
}

function stubPoolFor(theme: string, fullKeyword: string): Aspect[] {
  const domain = domainFor(theme) ?? domainFor(fullKeyword);
  // 分野が無いテーマでも NEUTRAL_ASPECTS はそのまま使う（テーマを文頭に差し込まない）。
  // NEUTRAL_ASPECTS 自体がどんな活動にも自然に当てはまる具体的な困りごとになっているため、
  // テーマとの関連づけは situation 側に任せてよい。
  return domain ? [...domain.aspects, ...NEUTRAL_ASPECTS] : NEUTRAL_ASPECTS;
}

/**
 * 1 件ぶんのスタブ。テーマに専用分野があればその分野の困りごとを、無ければ
 * テーマを頭につけた汎用の困りごとを使う（どちらもテーマから逸脱しない）。
 * `seq` は「今回の並び順」(result 循環などに使う)、`poolIndex` は使う困りごと。
 */
function stubDraftAt(theme: string, seq: number, poolIndex: number, fullKeyword: string): SeedExperienceDraft {
  const pool = stubPoolFor(theme, fullKeyword);
  const aspect = pool[((poolIndex % pool.length) + pool.length) % pool.length];
  const result = ATTEMPT_RESULTS[seq % ATTEMPT_RESULTS.length];
  return {
    // テーマの活動・場面の中で起きる具体的な困りごと。キーワードそのまま・「（サンプルN）」にはしない。
    difficulty: aspect.d,
    previouslyAble: seq % 3 === 0 ? "以前はとくに困らずにできていた" : null,
    goal: aspect.g,
    // テーマは「場面」に引用の形でも残す（検索で見つけられるように）。
    situation: `「${theme}」に取り組むときの場面`,
    startedAt: null,
    memo: null,
    status: result === "ongoing" ? "継続中" : null,
    progress: null,
    nextAction: null,
    method: aspect.m,
    result,
    triedAt: null,
    attemptMemo: stubAttemptMemo(result),
  };
}

/**
 * キー未設定時の決定的スタブ。
 * difficulty はテーマの活動・場面の中の別々の困りごと (件ごとに異なる)、method も件ごとに異なり、
 * result は 5 分類を循環する。複数テーマ (スペース区切り) は件ごとに順番に割り当てる。
 *
 * - `opts.offset`: 過去に同じテーマで生成した件数。困りごとプールの開始位置をずらし、
 *   生成のたびに違う切り口を返す (「毎回結果を変える」指示書 4 / 10)。
 * - `opts.existing`: 過去データ。実質的に重複する困りごと・方法はスキップする。
 * 引数はキーワード文字列でもテーマ配列でも受け付ける。
 */
export function localStubDrafts(
  keywordOrThemes: string | string[],
  count: number,
  opts: { offset?: number; existing?: PriorSeedItem[] } = {},
): SeedExperienceDraft[] {
  const themes = Array.isArray(keywordOrThemes)
    ? keywordOrThemes.filter((t) => t.trim().length > 0)
    : parseSeedThemes(keywordOrThemes);
  const list = themes.length > 0 ? themes : [""];
  const fullKeyword = list.join(" ");
  const offset = Math.max(0, Math.floor(opts.offset ?? 0));

  const priorDifficulties = (opts.existing ?? [])
    .map((e) => e.difficulty)
    .filter((v): v is string => !!v && v.trim().length > 0);
  const priorMethods = (opts.existing ?? [])
    .map((e) => e.method)
    .filter((v) => !!v && v.trim().length > 0);

  const out: SeedExperienceDraft[] = [];
  const maxPool = Math.max(...list.map((t) => stubPoolFor(t, fullKeyword).length));
  // プール 1 周ぶんまで走査して、重複しない困りごとを count 件集める。
  for (let step = 0; step < maxPool && out.length < count; step++) {
    const theme = list[out.length % list.length];
    const draft = stubDraftAt(theme, out.length, offset + step, fullKeyword);
    if (
      isDraftDuplicate(
        draft,
        [...priorDifficulties, ...out.map((o) => o.difficulty).filter((v): v is string => !!v)],
        [...priorMethods, ...out.map((o) => o.method)],
      )
    ) {
      continue;
    }
    out.push(draft);
  }
  // それでも足りなければ (プールを使い切った) 重複を許してでも件数を満たす。
  for (let step = 0; out.length < count; step++) {
    const theme = list[out.length % list.length];
    out.push(stubDraftAt(theme, out.length, offset + step, fullKeyword));
  }
  return out;
}

function clampCount(count: number): number {
  const n = Math.floor(count);
  if (!Number.isFinite(n)) return SEED_COUNT_DEFAULT;
  return Math.min(SEED_COUNT_MAX, Math.max(SEED_COUNT_MIN, n));
}

/**
 * テーマ (キーワード) から仮データ候補を生成する。保存はしない。
 * AI キー未設定・AI が空/不正/具体性なしを返した場合は、テーマを具体化した決定的スタブを返す
 * (管理者が確認・編集してから非公開で保存する前提)。
 *
 * `opts.existing`: 同じテーマで過去に生成済みの仮データ。これと実質的に重複しないよう、
 *   AI にはプロンプトで渡し、スタブでは困りごとプールの開始位置をずらして違う切り口を返す
 *   (「毎回結果を変える」指示書 2 / 4 / 9 / 10)。
 */
export async function generateSeedDrafts(
  keyword: string,
  count: number,
  opts: { existing?: PriorSeedItem[] } = {},
): Promise<SeedExperienceDraft[]> {
  const n = clampCount(count);
  const themes = parseSeedThemes(keyword);
  const existing = opts.existing ?? [];
  const stub = () => localStubDrafts(themes, n, { offset: existing.length, existing });
  if (!env.ai.configured) return stub();
  const items = await callJsonArray(buildUserPrompt(themes, n, existing), SEED_SYSTEM_PROMPT);
  const drafts = normalizeDrafts(items, keyword, n, { existing });
  return drafts.length > 0 ? drafts : stub();
}
