import { test, expect } from "@playwright/test";

/**
 * 「道を編集」画面の編集可否修正指示:
 *   - 「できなくなったこと」の「一度設定したため、変更できません。」制限を廃止し、
 *     通常の必須テキスト欄として編集できるようにする。
 *   - 空にして保存しようとするとエラーになる（サーバーへ送られない）。
 *   - 変更後は再表示でも新しい内容が見える。
 *   - 「以前できていたこと」は任意のまま。
 * 2026-10-01: 項目名を作成画面とそろえた（道の更新・編集画面 修正指示）。difficulty の欄は
 *   「今、どんなことで困っていますか？」、previouslyAble は「以前は、どうしていましたか？（任意）」。
 *   保存先・既存データはそのまま。
 */

async function loginAndCreateRoad(page: import("@playwright/test").Page, difficulty: string) {
  const sub = `road-edit-e2e-${Date.now()}`;
  await page.request.post("/api/test/login", { data: { sub, name: "RoadEdit" } });
  const res = await page.request.post("/api/v1/roads", {
    data: { difficulty, goal: "編集テスト用の目標" },
  });
  const road = await res.json();
  return road.id as string;
}

test("「困っていること」（difficulty）に変更不可の表示が出ず、通常の入力欄として編集できる", async ({
  page,
}) => {
  const original = `編集前 ${Date.now()}`;
  const roadId = await loginAndCreateRoad(page, original);

  await page.goto(`/me/roads/${roadId}/edit`);
  await expect(page.getByText("一度設定したため、変更できません")).toHaveCount(0);

  const field = page.getByLabel("今、どんなことで困っていますか？");
  await expect(field).toBeEditable();
  await expect(field).toHaveValue(original);

  const updated = `編集後 ${Date.now()}`;
  await field.fill(updated);
  await page.getByRole("button", { name: "変更を保存" }).click();

  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}$`));
  // 見出し（h1）と本文の両方に出るため、いずれかが見えることだけ確認する
  await expect(page.getByText(updated).first()).toBeVisible();

  // 再度編集画面を開いても、変更後の内容が表示される
  await page.goto(`/me/roads/${roadId}/edit`);
  await expect(page.getByLabel("今、どんなことで困っていますか？")).toHaveValue(updated);
});

test("「困っていること」を空にして保存しようとするとエラーになり、遷移しない", async ({ page }) => {
  const original = `空にできないテスト ${Date.now()}`;
  const roadId = await loginAndCreateRoad(page, original);

  await page.goto(`/me/roads/${roadId}/edit`);
  await page.getByLabel("今、どんなことで困っていますか？").fill("");
  await page.getByRole("button", { name: "変更を保存" }).click();

  // 画面にとどまり、エラーが表示される
  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}/edit$`));
  await expect(page.getByText(/困っていること」を書いてください/)).toBeVisible();

  // DB 上の値も変わっていない
  const res = await page.request.get(`/api/v1/roads/${roadId}`);
  const dto = await res.json();
  expect(dto.difficulty).toBe(original);
});

test("「以前は、どうしていましたか？」は空のままでも保存できる", async ({ page }) => {
  const roadId = await loginAndCreateRoad(page, `任意項目テスト ${Date.now()}`);

  await page.goto(`/me/roads/${roadId}/edit`);
  await expect(page.getByLabel("以前は、どうしていましたか？（任意）")).toHaveValue("");
  await page.getByRole("button", { name: "変更を保存" }).click();

  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}$`));
});

test("作成画面で入れた内容が、編集画面の同じ名前の欄にそのまま出る", async ({ page }) => {
  await page.request.post("/api/test/login", {
    data: { sub: `road-edit-e2e-${Date.now()}`, name: "RoadEdit" },
  });
  const data = {
    difficulty: `困りごと ${Date.now()}`,
    goal: "自分でシャツを着たい",
    previouslyAble: "以前は自分で留めていた",
    startedAt: "2024-04-01",
    situation: "朝の着替え",
  };
  const road = await (await page.request.post("/api/v1/roads", { data })).json();

  await page.goto(`/me/roads/${road.id}/edit`);
  await expect(page.getByLabel("今、どんなことで困っていますか？")).toHaveValue(data.difficulty);
  await expect(page.getByLabel("これから、何ができるようになりたいですか？")).toHaveValue(
    data.goal,
  );
  await expect(page.getByLabel("以前は、どうしていましたか？（任意）")).toHaveValue(
    data.previouslyAble,
  );
  await expect(page.getByLabel("いつ頃から困るようになりましたか？")).toHaveValue(data.startedAt);
  await expect(page.getByLabel("どんな場面で困っていますか？")).toHaveValue(data.situation);

  // 何も変えずに保存しても欠落しない
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${road.id}$`));
  const dto = await (await page.request.get(`/api/v1/roads/${road.id}`)).json();
  expect(dto).toMatchObject(data);

  // 保存後の道の詳細（道のあらまし）も同じ言葉で出て、旧表現が残っていない
  for (const label of [
    "以前は、どうしていましたか？",
    "今、どんなことで困っていますか？",
    "これから、何ができるようになりたいですか？",
    "どんな場面で困っていますか？",
  ]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  for (const old of ["できなくなった", "以前できていた", "やりたいこと", "困っている場面"]) {
    await expect(page.getByText(old, { exact: true })).toHaveCount(0);
  }
});

test("自由記述の 7 欄すべてに音声入力ボタンがあり、入力欄のすぐ下に出る", async ({ page }) => {
  const roadId = await loginAndCreateRoad(page, `音声入力テスト ${Date.now()}`);
  await page.goto(`/me/roads/${roadId}/edit`);
  await expect(page.getByLabel("次に試すこと")).toBeVisible();
  const voice = page.getByRole("button", { name: "音声で入力" });
  // Web Speech API が無いブラウザではボタン自体を出さない仕様なので、その場合は確認しない
  test.skip((await voice.count()) === 0, "このブラウザは Web Speech API 非対応");
  await expect(voice).toHaveCount(7);

  const fields = [
    page.getByLabel("今、どんなことで困っていますか？"),
    page.getByLabel("これから、何ができるようになりたいですか？"),
    page.getByLabel("以前は、どうしていましたか？（任意）"),
    page.getByLabel("どんな場面で困っていますか？"),
    page.getByLabel("いまの進捗"),
    page.getByLabel("次に試すこと"),
    page.getByLabel("メモ", { exact: true }),
  ];
  for (const [i, f] of fields.entries()) {
    const a = (await f.boundingBox())!;
    const b = (await voice.nth(i).boundingBox())!;
    const gap = b.y - (a.y + a.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(8);
  }
});

/*
 * 道の編集画面「既存データの項目対応」修正指示（2026-10-01）のテスト 1〜4。
 * 画面の項目と DB フィールドの対応: 困っていること = difficulty / これから = goal / 以前 = previouslyAble。
 * 「困っていること」と「以前」が入れ替わらないことを、作成 → 保存 → 編集 → 再保存の往復で確かめる。
 */
const L_DIFF = "今、どんなことで困っていますか？";
const L_GOAL = "これから、何ができるようになりたいですか？";
const L_PREV = "以前は、どうしていましたか？（任意）";

async function login(page: import("@playwright/test").Page) {
  await page.request.post("/api/test/login", {
    data: { sub: `road-map-e2e-${Date.now()}-${Math.random()}`, name: "RoadMap" },
  });
}

/** 作成画面から道を作り、作成された道の id を返す */
async function createViaForm(
  page: import("@playwright/test").Page,
  v: { diff: string; goal: string; prev?: string },
) {
  await page.goto("/me/roads/new");
  await page.getByLabel(L_DIFF).fill(v.diff);
  await page.getByLabel(L_GOAL).fill(v.goal);
  if (v.prev) await page.getByLabel(L_PREV).fill(v.prev);
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
  return page.url().match(/([0-9a-f-]{36})$/)![1];
}

test("テスト1: 既存データ（できなくなったこと／以前できていたこと／やりたいこと）が正しい欄に出る", async ({
  page,
}) => {
  await login(page);
  // 旧画面の意味で API に保存された既存データと同じ形
  const road = await (
    await page.request.post("/api/v1/roads", {
      data: {
        previouslyAble: "自分で自動車を運転して出かけていた",
        difficulty: "足が動かせないので、運転ができなくなった",
        goal: "自分で運転して出かけられるようにしたい",
      },
    })
  ).json();
  await page.goto(`/me/roads/${road.id}/edit`);
  await expect(page.getByLabel(L_DIFF)).toHaveValue("足が動かせないので、運転ができなくなった");
  await expect(page.getByLabel(L_GOAL)).toHaveValue("自分で運転して出かけられるようにしたい");
  await expect(page.getByLabel(L_PREV)).toHaveValue("自分で自動車を運転して出かけていた");
});

test("テスト2: 作成画面で入れた内容が、DB の同じ意味のフィールドに保存され、編集画面の同じ欄に戻る", async ({
  page,
}) => {
  await login(page);
  const id = await createViaForm(page, {
    diff: "瓶のフタを開けるのが難しい",
    goal: "自分で瓶を開けられるようになりたい",
    prev: "以前は普通に開けられていた",
  });
  const dto = await (await page.request.get(`/api/v1/roads/${id}`)).json();
  expect(dto.difficulty).toBe("瓶のフタを開けるのが難しい");
  expect(dto.goal).toBe("自分で瓶を開けられるようになりたい");
  expect(dto.previouslyAble).toBe("以前は普通に開けられていた");

  await page.goto(`/me/roads/${id}/edit`);
  await expect(page.getByLabel(L_DIFF)).toHaveValue("瓶のフタを開けるのが難しい");
  await expect(page.getByLabel(L_GOAL)).toHaveValue("自分で瓶を開けられるようになりたい");
  await expect(page.getByLabel(L_PREV)).toHaveValue("以前は普通に開けられていた");
});

test("テスト3: 「以前」が空でも作成・編集・保存できる", async ({ page }) => {
  await login(page);
  const id = await createViaForm(page, {
    diff: "本の文字が読みにくい",
    goal: "本を無理なく読めるようになりたい",
  });
  await page.goto(`/me/roads/${id}/edit`);
  await expect(page.getByLabel(L_DIFF)).toHaveValue("本の文字が読みにくい");
  await expect(page.getByLabel(L_GOAL)).toHaveValue("本を無理なく読めるようになりたい");
  await expect(page.getByLabel(L_PREV)).toHaveValue("");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${id}$`));
  const dto = await (await page.request.get(`/api/v1/roads/${id}`)).json();
  expect(dto.difficulty).toBe("本の文字が読みにくい");
  expect(dto.previouslyAble).toBeNull();
});

test("テスト4: 「困っていること」を変えて保存すると、次に開いたとき同じ欄に出て、他の欄は変わらない", async ({
  page,
}) => {
  await login(page);
  const id = await createViaForm(page, {
    diff: "瓶のフタを開けるのが難しい",
    goal: "自分で瓶を開けられるようになりたい",
    prev: "以前は普通に開けられていた",
  });
  await page.goto(`/me/roads/${id}/edit`);
  await page.getByLabel(L_DIFF).fill("ペットボトルのフタも開けにくい");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${id}$`));

  await page.goto(`/me/roads/${id}/edit`);
  await expect(page.getByLabel(L_DIFF)).toHaveValue("ペットボトルのフタも開けにくい");
  await expect(page.getByLabel(L_GOAL)).toHaveValue("自分で瓶を開けられるようになりたい");
  await expect(page.getByLabel(L_PREV)).toHaveValue("以前は普通に開けられていた");
});

test("「いつ頃から困るようになりましたか？」に値を入れると「日付を消す」が出て、押すと空に戻る", async ({
  page,
}) => {
  // スマホ（特に iOS Safari）はネイティブの日付ダイアログに値を消す手段が無く、
  // 一度選ぶと OS 側の操作だけでは空に戻せないことがあるため、明示的な消すボタンを添えている。
  // 2026-10-01 に登録画面から外し、編集画面だけの項目になったのでここで確かめる
  const roadId = await loginAndCreateRoad(page, `日付テスト ${Date.now()}`);
  await page.goto(`/me/roads/${roadId}/edit`);
  const dateField = page.getByLabel("いつ頃から困るようになりましたか？");
  const clearBtn = page.getByRole("button", { name: "日付を消す" });

  await expect(clearBtn).toHaveCount(0);

  await dateField.fill("2020-01-01");
  await expect(dateField).toHaveValue("2020-01-01");
  await expect(clearBtn).toBeVisible();

  await clearBtn.click();
  await expect(dateField).toHaveValue("");
  await expect(clearBtn).toHaveCount(0);
});

test("役割整理のテスト 12/13: メモ付きで登録 → 編集で全項目を変えて保存 → 再編集で同じ欄に戻る", async ({
  page,
}) => {
  await login(page);
  await page.goto("/me/roads/new");
  await page.getByLabel(L_DIFF).fill("瓶のフタを開けるのが難しい");
  await page.getByLabel(L_GOAL).fill("自分で瓶を開けられるようになりたい");
  await page.getByLabel(L_PREV).fill("以前は普通に開けられていた");
  await page.getByLabel("メモ・気づき").fill("家で試してみたい");
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
  const id = page.url().match(/([0-9a-f-]{36})$/)![1];

  // 登録した内容が編集画面の同じ意味の欄に出る（メモ・気づき → 編集画面の「メモ」）
  await page.goto(`/me/roads/${id}/edit`);
  await expect(page.getByLabel(L_DIFF)).toHaveValue("瓶のフタを開けるのが難しい");
  await expect(page.getByLabel(L_GOAL)).toHaveValue("自分で瓶を開けられるようになりたい");
  await expect(page.getByLabel(L_PREV)).toHaveValue("以前は普通に開けられていた");
  await expect(page.getByLabel("メモ", { exact: true })).toHaveValue("家で試してみたい");

  // 編集画面で全項目を変えて保存
  const next = {
    [L_DIFF]: "瓶のフタを一人で開けるのが難しい",
    [L_GOAL]: "道具を使って自分で開けたい",
    [L_PREV]: "以前は手で回して開けていた",
    "いつ頃から困るようになりましたか？": "2025-03-01",
    "どんな場面で困っていますか？": "ジャムの瓶を開けるとき",
    "状態（例：継続中／一区切り）": "継続中",
    いまの進捗: "ゴムシートで少し開けやすくなった",
    次に試すこと: "オープナーを試す",
    "タグ（カンマ区切り）": "台所, 握力",
  };
  for (const [label, value] of Object.entries(next)) {
    await page.getByLabel(label).fill(value);
  }
  await page.getByLabel("メモ", { exact: true }).fill("家で試してみた");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${id}$`));

  // 再読み込みして再編集: すべて同じ欄に戻る
  await page.goto(`/me/roads/${id}/edit`);
  await page.reload();
  for (const [label, value] of Object.entries(next)) {
    // タグは保存後にタグ名順で並ぶ（既存仕様）ので、中身だけ比べる
    if (label.startsWith("タグ")) continue;
    await expect(page.getByLabel(label), label).toHaveValue(value);
  }
  const tagsShown = (await page.getByLabel("タグ（カンマ区切り）").inputValue())
    .split(/,\s*/)
    .sort();
  expect(tagsShown).toEqual(["台所", "握力"].sort());
  await expect(page.getByLabel("メモ", { exact: true })).toHaveValue("家で試してみた");

  const dto = await (await page.request.get(`/api/v1/roads/${id}`)).json();
  expect(dto).toMatchObject({
    difficulty: "瓶のフタを一人で開けるのが難しい",
    goal: "道具を使って自分で開けたい",
    previouslyAble: "以前は手で回して開けていた",
    startedAt: "2025-03-01",
    situation: "ジャムの瓶を開けるとき",
    status: "継続中",
    progress: "ゴムシートで少し開けやすくなった",
    nextAction: "オープナーを試す",
    memo: "家で試してみた",
  });
  expect([...dto.tags].sort()).toEqual(["台所", "握力"].sort());
});
