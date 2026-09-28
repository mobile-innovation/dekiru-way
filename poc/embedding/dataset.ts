import type { RoadEmbeddingInput, AttemptEmbeddingInput } from "../../src/lib/search-embedding-text.ts";

/**
 * Stage 2 PoC 用の固定データ（DB は読まない）。
 * 「できる道」の公開経験に相当する文面を、意味の異なる困りごとにまたがって用意する。
 * すべて「公開・承認済み」相当として扱う（非公開・pending・rejected は含めない）。
 * 似た話題（ボタン / 靴下 / 着替え、ふた / キャップ）をわざと混ぜ、意味の近さの差が見えるようにする。
 */

export interface PocRoad extends RoadEmbeddingInput {
  id: string;
}
export interface PocAttempt extends AttemptEmbeddingInput {
  id: string;
  roadId: string;
}

export const ROADS: PocRoad[] = [
  {
    id: "R01",
    difficulty: "シャツのボタンがとめにくい",
    situation: "朝、仕事に行く前に着替えるとき",
    goal: "一人でシャツを着られるようになりたい",
    previouslyAble: "以前は何も考えずにボタンをとめていた",
    tags: ["着替え", "手先"],
  },
  {
    id: "R02",
    difficulty: "つめが切りにくい",
    situation: "お風呂上がりに足のつめを切るとき",
    goal: "家族に頼まず自分でつめを切りたい",
    tags: ["身だしなみ", "手先"],
  },
  {
    id: "R03",
    difficulty: "階段の上り下りがこわい",
    situation: "駅の階段や家の2階へ上がるとき",
    goal: "手すりがあれば一人で階段を使いたい",
    previouslyAble: "通勤で毎日階段を使っていた",
    tags: ["移動", "足腰"],
  },
  {
    id: "R04",
    difficulty: "ペットボトルのふたが開けにくい",
    situation: "外出先で飲み物を買ったとき",
    goal: "人に頼まずにふたを開けたい",
    tags: ["握る力", "食事"],
  },
  {
    id: "R05",
    difficulty: "デスクワークで長時間パソコンを使うと目と肩がつらい",
    situation: "在宅勤務で一日中画面を見ているとき",
    goal: "休憩を取りながら仕事を続けたい",
    tags: ["仕事", "パソコン"],
  },
  {
    id: "R06",
    difficulty: "びんのふたが固くて開けられない",
    situation: "ジャムや調味料のびんを使うとき",
    goal: "料理のときに自分で開けたい",
    tags: ["握る力", "料理"],
  },
  {
    id: "R07",
    difficulty: "靴下をはくのがむずかしい",
    situation: "腰を曲げにくい朝",
    goal: "座ったまま靴下をはけるようになりたい",
    previouslyAble: "立ったままはけていた",
    tags: ["着替え", "足腰"],
  },
  {
    id: "R08",
    difficulty: "箸でおかずをつまみにくい",
    situation: "家族と食事をするとき",
    goal: "箸を使って食べ続けたい",
    tags: ["食事", "手先"],
  },
  {
    id: "R09",
    difficulty: "薬を飲んだかどうか忘れてしまう",
    situation: "朝と夜の薬を飲むとき",
    goal: "飲み忘れや二重に飲むのを防ぎたい",
    tags: ["もの忘れ", "薬"],
  },
  {
    id: "R10",
    difficulty: "電話の相手の声が聞き取りにくい",
    situation: "病院や役所から電話がかかってきたとき",
    goal: "聞き返さずに用件を理解したい",
    tags: ["聞こえ", "連絡"],
  },
  {
    id: "R11",
    difficulty: "小さい文字が読みにくい",
    situation: "薬の説明書やスーパーの値札を見るとき",
    goal: "買い物で困らないようにしたい",
    tags: ["見え方", "買い物"],
  },
  {
    id: "R12",
    difficulty: "浴槽をまたいで入るのがこわい",
    situation: "一人でお風呂に入るとき",
    goal: "転ばずに湯船につかりたい",
    tags: ["入浴", "足腰"],
  },
  {
    id: "R13",
    difficulty: "字を書くと手がふるえてしまう",
    situation: "役所の書類や宛名を書くとき",
    goal: "読める字で書類を書きたい",
    tags: ["書く", "手先"],
  },
  {
    id: "R14",
    difficulty: "重い買い物袋を持って帰れない",
    situation: "スーパーでまとめ買いをしたとき",
    goal: "週に一度の買い物を続けたい",
    tags: ["買い物", "握る力"],
  },
  {
    id: "R15",
    difficulty: "夜中に何度も目がさめて眠れない",
    situation: "寝る前に考えごとをしてしまう夜",
    goal: "朝まで眠れる日を増やしたい",
    tags: ["睡眠"],
  },
  {
    id: "R16",
    difficulty: "包丁で野菜を切るのがこわい",
    situation: "夕食の準備で固い野菜を切るとき",
    goal: "けがをせずに料理を続けたい",
    tags: ["料理", "手先"],
  },
  {
    id: "R17",
    difficulty: "キーボードを長く打つと手首が痛くなる",
    situation: "会社で資料を作るとき",
    goal: "痛みを気にせず入力作業をしたい",
    tags: ["仕事", "パソコン", "手先"],
  },
  {
    id: "R18",
    difficulty: "人の名前がすぐに出てこない",
    situation: "近所の人や職場の人と話すとき",
    goal: "会話の途中であわてないようにしたい",
    tags: ["もの忘れ", "会話"],
  },
];

export const ATTEMPTS: PocAttempt[] = [
  { id: "A01", roadId: "R01", method: "ボタンエイドという補助具を使った", memo: "最初は慣れなかったが、1週間で使えるようになった" },
  { id: "A02", roadId: "R01", method: "ボタンの穴を少し大きくしてもらった", memo: "とめやすくなったが、外れやすくなった" },
  { id: "A03", roadId: "R01", method: "マグネット式のボタンのシャツに替えた", memo: null },
  { id: "A04", roadId: "R02", method: "テコの原理で軽く切れる大きめのつめ切りを使った", memo: "力が弱くても切れた" },
  { id: "A05", roadId: "R02", method: "つめやすりで少しずつ削るようにした", memo: "時間はかかるが深づめしない" },
  { id: "A06", roadId: "R03", method: "階段に両側の手すりを付けた", memo: "上りは楽になったが、下りはまだこわい" },
  { id: "A07", roadId: "R03", method: "駅ではエレベーターの場所を先に調べておく", memo: "遠回りでも安心できた" },
  { id: "A08", roadId: "R04", method: "ゴムの滑り止めシートでキャップをつかんだ", memo: "軽い力で回せた" },
  { id: "A09", roadId: "R04", method: "ペットボトル用のオープナーを持ち歩いた", memo: "かばんの中でかさばる" },
  { id: "A10", roadId: "R05", method: "1時間ごとにタイマーを鳴らして休憩した", memo: "肩こりが少し軽くなった" },
  { id: "A11", roadId: "R05", method: "モニターの高さを目線に合わせた", memo: null },
  { id: "A12", roadId: "R06", method: "びんのふたをお湯で温めてから開けた", memo: "固いジャムのびんも開いた" },
  { id: "A13", roadId: "R06", method: "ゴム手袋をはめてふたを回した", memo: "滑らずに力が伝わった" },
  { id: "A14", roadId: "R07", method: "ソックスエイドを使って座ったままはいた", memo: "うまくいかなかった。かかとの位置がずれる" },
  { id: "A15", roadId: "R08", method: "バネ付きの箸に替えた", memo: "つまむ力が弱くても使えた" },
  { id: "A16", roadId: "R08", method: "スプーンとフォークも併用した", memo: null },
  { id: "A17", roadId: "R09", method: "曜日ごとに分かれたお薬カレンダーを壁に掛けた", memo: "飲んだかどうかが一目で分かる" },
  { id: "A18", roadId: "R09", method: "スマホのアラームで飲む時間を知らせた", memo: "アラームを止めて忘れることがあった" },
  { id: "A19", roadId: "R10", method: "電話の受話音量を最大にした", memo: null },
  { id: "A20", roadId: "R10", method: "大事な用件はメールで送ってもらうよう頼んだ", memo: "記録にも残って安心" },
  { id: "A21", roadId: "R11", method: "首から下げるルーペを持ち歩いた", memo: "値札がはっきり読めた" },
  { id: "A22", roadId: "R12", method: "浴槽の縁に手すりと台を付けた", memo: "またぐときの不安が減った" },
  { id: "A23", roadId: "R13", method: "太いグリップのペンに替えた", memo: "ふるえが少しおさまった" },
  { id: "A24", roadId: "R14", method: "キャリーカートを使って買い物に行った", memo: "坂道では押すのが大変" },
  { id: "A25", roadId: "R14", method: "ネットスーパーの配達を使った", memo: null },
  { id: "A26", roadId: "R15", method: "寝る前にスマホを見ないようにした", memo: "変化はなかった" },
  { id: "A27", roadId: "R16", method: "フードプロセッサーで野菜を切った", memo: "包丁を使う回数が減った" },
  { id: "A28", roadId: "R17", method: "リストレストを置いて手首を支えた", memo: "痛みが出るまでの時間がのびた" },
  { id: "A29", roadId: "R17", method: "音声入力で文章を入力した", memo: "変換ミスの修正に時間がかかる" },
  { id: "A30", roadId: "R18", method: "会った人の名前と特徴をメモ帳に書いておく", memo: null },
];

/**
 * 評価用クエリ。文字列一致ではなく言い換え・上位語・症状側からの表現を中心にする。
 * `relevantRoads` / `relevantAttempts` は「人が見て関連すると判断する正解」（先頭ほど重要）。
 */
export interface PocQuery {
  q: string;
  relevantRoads: string[];
  relevantAttempts?: string[];
}

export const QUERIES: PocQuery[] = [
  { q: "ボタンがとめにくい", relevantRoads: ["R01"] },
  { q: "シャツのボタンを一人で留めたい", relevantRoads: ["R01"] },
  { q: "指が動かしにくくて服を着るのが大変", relevantRoads: ["R01", "R07"] },
  { q: "爪が切りにくい", relevantRoads: ["R02"] },
  { q: "手がうまく動かず爪切りが難しい", relevantRoads: ["R02"] },
  { q: "駅の階段で足がすくむ", relevantRoads: ["R03"] },
  { q: "キャップが固くて飲み物が飲めない", relevantRoads: ["R04", "R06"], relevantAttempts: ["A08", "A09"] },
  { q: "パソコン仕事で体がつらい", relevantRoads: ["R05", "R17"] },
  { q: "薬の飲み忘れ", relevantRoads: ["R09"], relevantAttempts: ["A17", "A18"] },
  { q: "耳が遠くなって電話が困る", relevantRoads: ["R10"] },
  { q: "握力が落ちてふたが回せない", relevantRoads: ["R04", "R06"], relevantAttempts: ["A08", "A13", "A12"] },
  { q: "ボタンを留める道具", relevantRoads: ["R01"], relevantAttempts: ["A01"] },
];

/** 表記ゆれ（NFKC を使わない現方針で、モデル上どれだけ近いか）を測るペア。 */
export const VARIANT_PAIRS: [string, string][] = [
  ["ボタン", "ﾎﾞﾀﾝ"],
  ["ボタンがとめにくい", "ﾎﾞﾀﾝがとめにくい"],
  ["ペットボトルのふたが開けにくい", "ﾍﾟｯﾄﾎﾞﾄﾙのふたが開けにくい"],
  ["パソコン作業がつらい", "PC作業がつらい"],
  ["PC作業がつらい", "ＰＣ作業がつらい"],
  ["爪が切りにくい", "つめが切りにくい"],
  ["ボタンがとめにくい", "釦がとめにくい"],
  // 比較の基準（無関係）
  ["ボタンがとめにくい", "階段の上り下りがこわい"],
];
