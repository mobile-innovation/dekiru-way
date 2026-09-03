import { test, expect } from "@playwright/test";

/**
 * 「この人がたどった道」= 枝分かれ型フロー (UI修正指示書 v2 §21)。
 *   - 「この人がたどった道」カードの中で、その人が試した方法が枝分かれして同時に見える
 *   - 経験詳細では各方法カードの中身を最初から全部表示する（タップして選ぶ／詳細へ飛ぶ操作は無い）
 *   - 失敗・変化なし・継続中も道として残る
 *   - 「現在」は Road 全体の独立ノードではなく、各方法カードの中（その方法を試した結果）にある
 */

async function aRoadWithMultipleMethods(request: import("@playwright/test").APIRequestContext) {
  // シードの「料理の火加減」の道（方法 4 件・1 ページ）を安定して使う。
  const res = await request.get(
    "/api/v1/experiences/paths?q=" + encodeURIComponent("火加減") + "&limit=1",
  );
  const { items } = await res.json();
  expect(items.length).toBeGreaterThan(0);
  const steps: { experienceId: string; method: string; result: string }[] = items[0].steps;
  expect(steps.length).toBeGreaterThanOrEqual(2);
  return steps;
}

test("「この人がたどった道」の中で複数の方法が枝分かれして同時に見える", async ({ page, request }) => {
  const steps = await aRoadWithMultipleMethods(request);
  await page.goto(`/experiences/${steps[0].experienceId}`);

  // 主役は「この人がたどった道」。別セクション「同じ困りごとへの道」は無い。
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "同じ困りごとへの道" })).toHaveCount(0);

  // 幹
  await expect(page.getByText("やりたいこと", { exact: true })).toBeVisible();

  // 枝が同時に見えている（切り替え不要）
  await expect(page.getByText("方法A", { exact: true })).toBeVisible();
  await expect(page.getByText("方法B", { exact: true })).toBeVisible();

  // すべての枝に結果が文字で出ている（色だけに依存しない）
  const resultWords = [
    "できるようになった",
    "少しできた",
    "変化はなかった",
    "うまくいかなかった",
    "まだ試している",
  ];
  const anyResultVisible = await Promise.all(
    resultWords.map((w) => page.getByText(w).first().isVisible().catch(() => false)),
  );
  expect(anyResultVisible.some(Boolean)).toBe(true);

  // 「現在」は方法カードの中にある（Road 全体の独立ノードではない）
  await expect(page.getByText("現在：").first()).toBeVisible();

  // いま見ている方法は「選んだ状態」の見た目で示す（チップ文言は付けない）
  await expect(page.getByText("いま見ている道")).toHaveCount(0);
  await expect(page.locator('[aria-current="true"]')).toHaveCount(1);
  await expect(page.getByText("（この経験を表示中）")).toHaveCount(1);
});

test("経験詳細では全方法をそのまま表示し、タップ用の「詳しく見る」導線は出さない", async ({
  page,
  request,
}) => {
  // シードの「料理の火加減」の道（方法 4 件・1 ページに収まる）で確認する
  const res = await request.get("/api/v1/experiences?q=" + encodeURIComponent("火加減") + "&limit=20");
  const { items } = await res.json();
  const road = items.filter((i: { method: string }) => i.method);
  const target = road.find((i: { method: string }) => i.method.includes("タイマー管理")) ?? road[0];
  await page.goto(`/experiences/${target.id}`);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();

  // 全方法のカードが同時に見える
  await expect(page.getByText("方法A", { exact: true })).toBeVisible();
  await expect(page.getByText("方法C", { exact: true })).toBeVisible();
  // 各方法の「試したこと」本文がそのまま出ている（シードの 4 方法）
  for (const m of [
    "ガスからIHクッキングヒーターに変えた",
    "手元をライトで照らすようにした",
    "調理を全部タイマー管理にした（レシピごとに時間をメモ）",
    "音声で知らせる調理タイマーを導入した",
  ]) {
    await expect(page.getByText(m, { exact: true })).toBeVisible();
  }
  // 「詳しく見る →」でタップ表示させる導線は無い / ページ送りも出ない（10 件以下）
  await expect(page.getByRole("link", { name: /詳しく見る/ })).toHaveCount(0);
  await expect(page.getByText(/\d+ \/ \d+ ページ/)).toHaveCount(0);
});

test("v6: 経験詳細に「できた度」「気持ち」が出る（本人入力・任意）", async ({ page, request }) => {
  // シードの「料理の火加減」は できた％ / 気持ち / previous_attempt_id を持つ
  const res = await request.get("/api/v1/experiences?q=" + encodeURIComponent("火加減") + "&limit=10");
  const { items } = await res.json();
  const target = items.find((i: { method: string }) => i.method.includes("タイマー管理")) ?? items[0];
  await page.goto(`/experiences/${target.id}`);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
  await expect(page.getByText(/できた度\s*\d+%/).first()).toBeVisible();
  await expect(page.getByText("気持ち：", { exact: false }).first()).toBeVisible();
  // previous_attempt_id でつながった方法は「方法B-2」のように入れ子ラベルになる
  await expect(page.getByText(/方法[A-Z]-\d/).first()).toBeVisible();
});

test("道の見える化ページ（一覧）は枝分かれ＋各方法から詳細への導線を持つ", async ({ page }) => {
  await page.goto("/experiences/paths");
  await expect(page.getByRole("heading", { name: "道の見える化", level: 1 })).toBeVisible();
  await expect(page.getByText("方法A", { exact: true }).first()).toBeVisible();
  // 一覧は情報を絞っているので、ここでは詳細への導線（詳しく見る）を残す
  await expect(page.getByRole("link", { name: /詳しく見る/ }).first()).toBeVisible();
});

test("「経験を探す」のカードは方法別ではなく道（困りごと）別", async ({ page }) => {
  await page.goto("/experiences");
  await expect(page.getByRole("heading", { name: /いろいろな道/ })).toBeVisible();

  // 1 枚目のカード = 一人の道。その中に複数の「試したこと」がまとまっている。
  const card = page.locator("article").first();
  await expect(card.getByText("だれかの道")).toBeVisible();
  const methodsLabel = card.getByText(/試したこと（\d+）/);
  await expect(methodsLabel).toBeVisible();
  const count = Number((await methodsLabel.textContent())!.match(/（(\d+)）/)![1]);
  expect(count).toBeGreaterThanOrEqual(2); // シードの道は複数の方法を持つ

  // カードから、その道の枝分かれ詳細へ進める
  await card.getByRole("link", { name: /この道を見る/ }).click();
  await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
});

test("経験を探す: 語が困りごと・目標に当たると「道カード」で出る", async ({ page }) => {
  await page.goto("/experiences?q=" + encodeURIComponent("階段"));
  const roadCard = page.locator("article").filter({ hasText: /試したこと（\d+）/ }).first();
  await expect(roadCard).toBeVisible();
  await expect(roadCard.getByText("だれかの道")).toBeVisible();
  await expect(roadCard.getByText(/駅の階段/)).toBeVisible();
});

test("経験を探す: 語が方法の中だけにあると「方法カード」で出て、タップでその道の詳細へ", async ({
  page,
}) => {
  // 「ボタンエイド」はシードの方法本文にだけあり、道の困りごと・目標・場面には無い
  // 既定は「道だけ」なので、方法カードを見るには種類を切り替える
  await page.goto("/experiences?q=" + encodeURIComponent("ボタンエイド") + "&kind=method");
  await expect(page.getByRole("heading", { name: /方法の中にあった記録/ })).toBeVisible();

  const methodCard = page.locator("article").filter({ hasText: "方法の記録" }).first();
  await expect(methodCard.getByText(/ボタンエイド/)).toBeVisible();
  // 困りごと・目標には当たらないので道カード（試したこと（N））は出ない
  await expect(page.locator("article").filter({ hasText: /試したこと（\d+）/ })).toHaveCount(0);

  await methodCard.getByRole("link", { name: /この方法の道を見る/ }).click();
  await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
});

test("経験を探す: 方法カードのタップ先は、その方法が実際に見えるページ（分割ツリーの ?p=N）", async ({
  page,
}) => {
  // ツリーが 2 ページになる道（公開 12 方法）を作り、12 件目に固有語を入れる
  const word = `フカイホウホウ${Date.now()}`;
  await page.request.post("/api/test/login", { data: { sub: `deep-${Date.now()}`, name: "Deep" } });
  const road = await (
    await page.request.post("/api/v1/roads", {
      data: { difficulty: "検索の深い方法テストの道", goal: "12件目を見たい" },
    })
  ).json();
  for (let i = 1; i <= 12; i++) {
    await page.request.post(`/api/v1/roads/${road.id}/attempts`, {
      data: {
        method: i === 12 ? `${word} を試した` : `ふつうの方法 ${i}`,
        result: "ongoing",
        isPublished: true,
        triedAt: `2025-01-${String(i).padStart(2, "0")}`,
      },
    });
  }

  await page.goto("/experiences?q=" + encodeURIComponent(word) + "&kind=method");
  const methodCard = page.locator("article").filter({ hasText: "方法の記録" }).first();
  await expect(methodCard.getByText(new RegExp(word))).toBeVisible();
  await methodCard.getByRole("link", { name: /この方法の道を見る/ }).click();

  // 12 件目は 2 ページ目。タップ先が ?p=2 で、その方法が見えている
  await expect(page).toHaveURL(/\/experiences\/[0-9a-f-]{36}\?p=2$/);
  await expect(page.getByText(new RegExp(`${word} を試した`))).toBeVisible();
});

test("経験を探す: 「この条件で探す」で検索ワードが消えない", async ({ page }) => {
  await page.goto("/experiences");
  await page.getByRole("searchbox").fill("階段");
  await page.getByRole("combobox", { name: "並び順" }).selectOption("helpful");
  await page.getByRole("button", { name: "この条件で探す" }).click();

  await expect(page).toHaveURL(/[?&]q=%E9%9A%8E%E6%AE%B5(&|$)/);
  await expect(page).toHaveURL(/[?&]sort=helpful(&|$)/);
  await expect(page.getByRole("searchbox")).toHaveValue("階段");
  await expect(page.getByRole("heading", { name: /「階段」への、いろいろな道/ })).toBeVisible();
});

test("経験を探す: 検索ワードが無いあいだ「表示する種類」は道だけ・変更不可", async ({ page }) => {
  await page.goto("/experiences");
  const kind = page.getByRole("combobox", { name: "表示する種類" });
  await expect(kind).toBeDisabled();
  await expect(kind).toHaveValue("road");
  await expect(page.getByText(/検索ワードを入れると「方法」も選べます/)).toBeVisible();

  await page.getByRole("searchbox").fill("階段");
  await expect(kind).toBeEnabled();
});

test("経験を探す: 表示する種類（道 / 方法 / 両方）を指定できる", async ({ page }) => {
  // 「階段」は道（goal）にも 方法（memo）にも当たる
  const roadCard = () => page.locator("article").filter({ hasText: /試したこと（\d+）/ });
  const methodCard = () => page.locator("article").filter({ hasText: "方法の記録" });

  // 既定は「道だけ」（方法カードは出さない）
  await page.goto("/experiences?q=" + encodeURIComponent("階段"));
  await expect(roadCard().first()).toBeVisible();
  await expect(methodCard()).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /方法の中にあった記録/ })).toHaveCount(0);

  // 両方
  await page.goto("/experiences?q=" + encodeURIComponent("階段") + "&kind=both");
  await expect(roadCard().first()).toBeVisible();
  await expect(methodCard().first()).toBeVisible();

  // 方法だけ
  await page.goto("/experiences?q=" + encodeURIComponent("階段") + "&kind=method");
  await expect(methodCard().first()).toBeVisible();
  await expect(roadCard()).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /いろいろな道/ })).toHaveCount(0);
});

test("経験を探す: 方法カードも道カードとは別に ?mp= でページ送りできる", async ({ page }) => {
  const word = `オオイホウホウ${Date.now()}`;
  await page.request.post("/api/test/login", { data: { sub: `mp-${Date.now()}`, name: "Mp" } });
  const road = await (
    await page.request.post("/api/v1/roads", {
      data: { difficulty: "方法が多い道", goal: "たくさん試す" },
    })
  ).json();
  for (let i = 1; i <= 25; i++) {
    await page.request.post(`/api/v1/roads/${road.id}/attempts`, {
      data: { method: `${word} その${i}`, result: "ongoing", isPublished: true },
    });
  }

  await page.goto("/experiences?q=" + encodeURIComponent(word) + "&kind=method");
  await expect(page.getByRole("heading", { name: /方法の中にあった記録/ })).toBeVisible();
  // 20 件表示 + 次ページ
  await expect(page.locator("article").filter({ hasText: "方法の記録" })).toHaveCount(20);
  const nav = page.getByRole("navigation", { name: /方法の記録のページ送り/ });
  await nav.getByRole("link", { name: /次のページ/ }).click();

  await expect(page).toHaveURL(/[?&]mp=2(&|$)/);
  await expect(page.locator("article").filter({ hasText: "方法の記録" })).toHaveCount(5);
});

test("v6: 「現在」は各方法カードの中にある（その方法を試した結果）", async ({ page, request }) => {
  const res = await request.get("/api/v1/experiences?q=" + encodeURIComponent("火加減") + "&limit=10");
  const { items } = await res.json();
  const target = items.find((i: { method: string }) => i.method.includes("タイマー管理")) ?? items[0];
  await page.goto(`/experiences/${target.id}`);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
  await expect(page.getByText("音声で知らせる調理タイマーを導入した")).toBeVisible();

  // 方法ごとに「現在」が独立する: IH化 と 音声タイマー(C-2) はそれぞれ state_after を持つ
  await expect(page.getByText("一人でも温度を決めて調理できるようになった。")).toBeVisible();
  await expect(page.getByText("煮物も炒め物も一人で作れるようになった。")).toBeVisible();
  expect(await page.getByText("現在：").count()).toBeGreaterThanOrEqual(2);

  // state_after を「その後：」としては表示しない（道の詳細では「現在：」に統一）
  await expect(page.getByText("その後：", { exact: false })).toHaveCount(0);

  // 「次に試すこと」は各方法カード内（Road 共通ノードではない）
  await expect(page.getByText("次に試すこと：", { exact: false }).first()).toBeVisible();

  // previous_attempt_id でつながった方法は「方法A-2」のような入れ子ラベル
  await expect(page.getByText(/方法[A-Z]-\d/).first()).toBeVisible();
});

test("方法が多いとページが切り替わるが、枝分かれ（親子）はページ境界で分断しない", async ({
  page,
}) => {
  // --- 12 方法（うち 11 件目は 10 件目の続き）を持つ道を作る ---
  await page.request.post("/api/test/login", {
    data: { sub: `pager-${Date.now()}`, name: "Pager" },
  });
  const roadRes = await page.request.post("/api/v1/roads", {
    data: { difficulty: "ページ分割テストの道", goal: "10件ごとに区切りたい" },
  });
  const road = await roadRes.json();

  const ids: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const body: Record<string, unknown> = {
      method: `ページ分割の方法 ${i}`,
      result: "ongoing",
      isPublished: true,
      triedAt: `2025-01-${String(i).padStart(2, "0")}`,
      stateAfter: `方法 ${i} のあとの状態`,
    };
    // 11 件目は 10 件目（方法J）の続き。10 件目に親が来るケース。
    if (i === 11) body.previousAttemptId = ids[9];
    const r = await page.request.post(`/api/v1/roads/${road.id}/attempts`, { data: body });
    ids.push((await r.json()).id);
  }

  // --- 1 ページ目: 方法J と その子 方法J-2 は同じページに収まる（10 で切らない） ---
  await page.goto(`/experiences/${ids[0]}`);
  await expect(page.getByRole("heading", { name: "この人がたどった道" })).toBeVisible();
  await expect(page.getByText("1 / 2 ページ")).toBeVisible();
  await expect(page.getByRole("link", { name: /次のページ/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /前のページ/ })).toHaveCount(0);
  await expect(page.getByText("方法A", { exact: true })).toBeVisible();
  await expect(page.getByText("方法J", { exact: true })).toBeVisible();
  // 親（方法J）と子（方法J-2）が同じページ。境界をまたがないので続き表示は出ない。
  await expect(page.getByText(/方法J-\d/)).toBeVisible();
  await expect(page.getByText("方法K", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/からの続き/)).toHaveCount(0);
  await expect(page.getByText("↓ この先は次のページに続きます")).toBeVisible();

  // --- 2 ページ目: 独立した次の方法グループ（方法K）だけ。先頭が子にならない。 ---
  await page.getByRole("link", { name: /次のページ/ }).click();
  await expect(page).toHaveURL(new RegExp(`/experiences/${ids[0]}\\?p=2$`));
  await expect(page.getByText("2 / 2 ページ")).toBeVisible();
  await expect(page.getByText("方法A", { exact: true })).toHaveCount(0);
  await expect(page.getByText("方法K", { exact: true })).toBeVisible();
  await expect(page.getByText(/方法J-\d/)).toHaveCount(0);
  await expect(page.getByText(/からの続き/)).toHaveCount(0);
  // 現在（state_after）はページを変えても各方法に残る
  await expect(page.getByText("現在：", { exact: false }).first()).toBeVisible();
});
