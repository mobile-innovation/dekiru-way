/**
 * 開発用シードデータ。
 * - 病名・障害名は使わず、日常の困りごとで構成する
 * - 5 分類すべて (success / partial / no_change / failed / ongoing) を含める
 * - failed が「正常な経験」として保存・公開されることを示す (指示書 2/18/23)
 */
try {
  // Node 20.12+ / 22+: .env を読み込む (prisma db seed 経由なら不要だが直接実行でも動くように)
  (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  /* .env が無くても続行 */
}

import { PrismaClient, type AttemptResult, type Visibility } from "@prisma/client";
import { hashPassword } from "../src/lib/admin/password";

const prisma = new PrismaClient();

type AttemptSeed = {
  method: string;
  result: AttemptResult;
  memo?: string;
  triedAt?: string;
  isPublished?: boolean;
  /** v6: 本人入力の「できた％」(0〜100) */
  achievementPercent?: number;
  feeling?: string;
  stateAfter?: string;
  nextAction?: string;
  /** 道内での識別キー。previousKey からの参照に使う */
  key?: string;
  /** この方法の前に試した方法の key（実際のつながりがある場合のみ） */
  previousKey?: string;
};

type RoadSeed = {
  owner: string;
  title: string;
  previouslyAble?: string;
  difficulty: string;
  goal: string;
  startedAt?: string;
  situation?: string;
  progress?: string;
  nextAction?: string;
  visibility?: Visibility;
  tags: string[];
  attempts: AttemptSeed[];
};

const ROADS: RoadSeed[] = [
  {
    owner: "seed:hana",
    title: "シャツのボタンがとめにくい",
    previouslyAble: "以前は何も考えずにボタンをとめられた",
    difficulty: "指先に力が入りにくく、小さいボタンが自分でとめられない",
    goal: "朝、自分で着替えを済ませたい",
    startedAt: "2025-11-01",
    situation: "急いでいる朝。特に袖口のボタン。",
    progress: "道具を使えば7割くらいは自分でできる",
    nextAction: "前開きでボタンの大きい服を試す",
    tags: ["着替え", "手先", "朝の支度"],
    attempts: [
      {
        method: "ボタンエイド（ボタン通しの道具）を使ってみた",
        result: "partial",
        memo: "袖口以外はできるようになった。道具に慣れるまで数日かかった。",
        triedAt: "2025-11-10",
        isPublished: true,
      },
      {
        method: "ボタンを大きいものに付け替えた",
        result: "success",
        memo: "家族に手伝ってもらって交換。かなり楽になった。",
        triedAt: "2025-11-20",
        isPublished: true,
      },
      {
        method: "マグネット式のボタンに替える服を探した",
        result: "ongoing",
        memo: "商品はあるが値段が高い。ひとつだけ試し買い予定。",
        triedAt: "2025-12-05",
        isPublished: true,
      },
    ],
  },
  {
    owner: "seed:taro",
    title: "つめが切りにくくなった",
    previouslyAble: "普通のつめ切りで問題なく切れていた",
    difficulty: "つめ切りをしっかり握れず、狙った位置で切れない",
    goal: "自分で安全につめの手入れをしたい",
    startedAt: "2025-09-15",
    situation: "特に利き手と反対の手のつめ。",
    progress: "てこ式のつめ切りで安定してきた",
    nextAction: "電動やすりを試す",
    tags: ["身だしなみ", "手先"],
    attempts: [
      {
        method: "握力がなくても使えるテコ型（ニッパー型）のつめ切りにした",
        result: "success",
        memo: "握り込まなくて済むので狙いが安定した。",
        triedAt: "2025-09-25",
        isPublished: true,
      },
      {
        method: "100円ショップの拡大鏡付きつめ切りを使った",
        result: "no_change",
        memo: "見やすさは上がったが、切る動作自体は変わらず難しかった。",
        triedAt: "2025-10-02",
        isPublished: true,
      },
      {
        method: "家族に切ってもらうようお願いした",
        result: "failed",
        memo: "お互い気をつかってしまい、深爪が怖くて続かなかった。自分でやれる方法を探すことにした。",
        achievementPercent: 15,
        feeling: "頼るのが申し訳なくて、少しつらかった。",
        stateAfter: "結局、自分でできる方法を探すことにした。",
        triedAt: "2025-10-10",
        isPublished: true,
      },
    ],
  },
  {
    owner: "seed:hana",
    title: "ペットボトルのふたが開けにくい",
    difficulty: "ふたを回す力が足りず、飲み物が自分で開けられない",
    goal: "外出先でも自分で水分をとれるようにしたい",
    startedAt: "2025-10-20",
    situation: "外出中。カフェや自販機で買ったとき。",
    progress: "オープナーを持ち歩くようにして安定した",
    nextAction: "キャップが元から緩いブランドを探す",
    tags: ["外出", "手先", "水分補給"],
    attempts: [
      {
        method: "シリコン製のふたオープナー（薄いシート）をカバンに入れた",
        result: "success",
        memo: "軽くて持ち歩きやすい。だいたいこれで開く。",
        triedAt: "2025-10-28",
        isPublished: true,
      },
      {
        method: "お店の人に開けてもらえないか頼んでみた",
        result: "partial",
        memo: "開けてもらえるが、毎回頼むのは気が引ける。緊急用と割り切った。",
        triedAt: "2025-11-03",
        isPublished: true,
      },
      {
        method: "歯で開けようとした",
        result: "failed",
        memo: "歯に良くないしケガしそうだった。おすすめしない。",
        triedAt: "2025-11-04",
        isPublished: true,
      },
    ],
  },
  {
    owner: "seed:taro",
    title: "階段の上り下りがこわい",
    previouslyAble: "手すりなしで普通に上り下りしていた",
    difficulty: "片足に体重を乗せるのがこわくて、駅の階段で時間がかかる",
    goal: "通院で使う駅の階段を落ち着いて使いたい",
    startedAt: "2025-08-01",
    situation: "人が多い時間帯の駅。後ろから来る人が気になる。",
    progress: "時間をずらす+杖でだいぶ楽になった",
    nextAction: "エレベーターの場所を事前に調べる",
    visibility: "public",
    tags: ["移動", "外出", "こわさ"],
    attempts: [
      {
        method: "ラッシュの時間を避けて移動するようにした",
        result: "success",
        memo: "後ろを気にしなくてよくなっただけで、かなり落ち着いた。",
        triedAt: "2025-08-10",
        isPublished: true,
      },
      {
        method: "折りたたみの杖を使い始めた",
        result: "partial",
        memo: "下りが安定した。上りはまだ手すり優先。",
        triedAt: "2025-08-20",
        isPublished: true,
      },
      {
        method: "エスカレーターだけで移動しようとした",
        result: "no_change",
        memo: "駅によってはエスカレーターが上りしかなく、結局階段を使うことになった。",
        triedAt: "2025-09-01",
        isPublished: true,
      },
      {
        method: "手すりのない側から上ろうとした（急いでいて）",
        result: "failed",
        memo: "途中で不安になって立ち止まってしまった。無理せず手すり側にすべき。",
        triedAt: "2025-09-05",
        isPublished: false,
      },
    ],
  },
  {
    owner: "seed:mika",
    title: "料理の火加減がわからなくなった",
    previouslyAble: "音や匂いで火加減を調整できていた",
    difficulty: "見え方が変わり、鍋の中の様子と炎の大きさが分かりにくい",
    goal: "簡単な煮物と炒め物を自分で作りたい",
    startedAt: "2025-07-10",
    situation: "夕方、台所の照明だけのとき。",
    progress: "IHとタイマーの組み合わせで安定してきた",
    nextAction: "音声タイマーを導入する",
    tags: ["料理", "見え方", "台所"],
    attempts: [
      {
        key: "ih",
        method: "ガスからIHクッキングヒーターに変えた",
        result: "success",
        memo: "炎を見なくて済み、温度を数字で決められるので安心。",
        achievementPercent: 80,
        feeling: "自分でも火を使えるようになって、ほっとした。",
        stateAfter: "一人でも温度を決めて調理できるようになった。",
        triedAt: "2025-07-25",
        isPublished: true,
      },
      {
        key: "timer",
        method: "調理を全部タイマー管理にした（レシピごとに時間をメモ）",
        result: "partial",
        memo: "煮物はうまくいく。炒め物はタイミングが難しい。",
        achievementPercent: 55,
        feeling: "少し希望が持てたけれど、炒め物はまだ不安。",
        nextAction: "音声で知らせてくれるタイマーを試す",
        triedAt: "2025-08-05",
        isPublished: true,
      },
      {
        key: "voicetimer",
        previousKey: "timer",
        method: "音声で知らせる調理タイマーを導入した",
        result: "success",
        memo: "手を止めずに時間が分かるので、炒め物も落ち着いてできる。",
        achievementPercent: 90,
        feeling: "これなら続けられそう、と思えた。",
        stateAfter: "煮物も炒め物も一人で作れるようになった。",
        triedAt: "2025-08-20",
        isPublished: true,
      },
      {
        method: "手元をライトで照らすようにした",
        result: "no_change",
        memo: "鍋の中は見やすくなったが、火加減の判断自体は変わらなかった。",
        achievementPercent: 10,
        feeling: "期待していたので、正直がっかりした。",
        triedAt: "2025-08-12",
        isPublished: true,
      },
    ],
  },
  {
    owner: "seed:mika",
    title: "薬の飲み忘れが増えた",
    difficulty: "毎食後の薬を飲んだかどうか自分で思い出せない",
    goal: "飲み忘れ・二重飲みをなくしたい",
    startedAt: "2025-12-01",
    situation: "昼食後。外出していると特に忘れる。",
    progress: "ピルケース+スマホ通知で運用中",
    nextAction: "家族と共有できる服薬アプリを試す",
    tags: ["くすり", "習慣", "記録"],
    attempts: [
      {
        method: "曜日つきのピルケースに1週間分をセットした",
        result: "partial",
        memo: "家では効果あり。外出時に持ち出すのを忘れる。",
        triedAt: "2025-12-08",
        isPublished: true,
      },
      {
        method: "スマホのアラームを毎食後にセットした",
        result: "success",
        memo: "ピルケースと合わせたら、ほぼ忘れなくなった。",
        triedAt: "2025-12-15",
        isPublished: true,
      },
    ],
  },
];

async function main() {
  console.log("seeding...");

  // 冪等にするため既存のシードデータを消す
  const seedSubs = ["seed:hana", "seed:taro", "seed:mika"];
  await prisma.user.deleteMany({ where: { googleSub: { in: seedSubs } } });

  const users = new Map<string, string>();
  for (const sub of seedSubs) {
    const name = { "seed:hana": "はな", "seed:taro": "たろう", "seed:mika": "みか" }[sub]!;
    const u = await prisma.user.create({ data: { googleSub: sub, displayName: name } });
    users.set(sub, u.id);
  }

  // 開発用の管理者。ADMIN_EMAIL / ADMIN_PASSWORD が無ければ既定値。
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "dekiru-admin";
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash: hashPassword(adminPassword),
      displayName: "開発用管理者",
    },
    update: { passwordHash: hashPassword(adminPassword), isActive: true },
  });
  console.log(`admin: ${adminEmail} / ${adminPassword}`);

  for (const r of ROADS) {
    const road = await prisma.road.create({
      data: {
        userId: users.get(r.owner)!,
        title: r.title,
        previouslyAble: r.previouslyAble ?? null,
        difficulty: r.difficulty,
        goal: r.goal,
        startedAt: r.startedAt ? new Date(`${r.startedAt}T00:00:00.000Z`) : null,
        situation: r.situation ?? null,
        progress: r.progress ?? null,
        nextAction: r.nextAction ?? null,
        visibility: r.visibility ?? "private",
        // 道の内容モデレーションが承認済みでないと、その道の経験は公開面に出ない。
        // seed の道は公開デモ用なので明示的に approved にする（未指定だと既定 pending）。
        moderationStatus: "approved",
      },
    });

    for (const name of r.tags) {
      const tag = await prisma.tag.upsert({
        where: { name },
        create: { name },
        update: {},
      });
      await prisma.roadTag.create({ data: { roadId: road.id, tagId: tag.id } });
    }

    // 1st pass: Attempt 作成（key → id を控える）
    const keyToId = new Map<string, string>();
    for (const a of r.attempts) {
      const created = await prisma.attempt.create({
        data: {
          roadId: road.id,
          method: a.method,
          result: a.result,
          memo: a.memo ?? null,
          triedAt: a.triedAt ? new Date(`${a.triedAt}T00:00:00.000Z`) : null,
          isPublished: a.isPublished ?? false,
          // 公開シードは審査済みとして入れる (バックフィルと同じ扱い)
          moderationStatus: a.isPublished ? "approved" : "pending",
          achievementPercent: a.achievementPercent ?? null,
          feeling: a.feeling ?? null,
          stateAfter: a.stateAfter ?? null,
          nextAction: a.nextAction ?? null,
        },
      });
      if (a.key) keyToId.set(a.key, created.id);
    }
    // 2nd pass: previousKey が指定されたものだけ previous_attempt_id を設定
    for (const a of r.attempts) {
      if (a.key && a.previousKey && keyToId.has(a.previousKey)) {
        await prisma.attempt.update({
          where: { id: keyToId.get(a.key)! },
          data: { previousAttemptId: keyToId.get(a.previousKey)! },
        });
      }
    }
  }

  const publishedCount = await prisma.attempt.count({ where: { isPublished: true } });
  const failedPublished = await prisma.attempt.count({
    where: { isPublished: true, result: "failed" },
  });
  console.log(
    `done. roads=${ROADS.length}, published attempts=${publishedCount}, published 'failed'=${failedPublished}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
