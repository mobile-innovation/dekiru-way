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
 * 2026-10-01: 「道を編集」（基本情報 4 項目）と「道を育てる」（/grow。日付・場面・状態・進捗・次に試すこと・
 *   メモ・タグ）に分離。DB・API は変更なし。
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

test("作成時の内容が「道を編集」「道を育てる」の同じ名前の欄にそのまま出る", async ({ page }) => {
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

  // 何も変えずに保存しても欠落しない（道を編集）
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${road.id}$`));

  // 日付・場面は「道を育てる」側に出る。何も変えずに保存しても欠落しない
  await page.goto(`/me/roads/${road.id}/grow`);
  await expect(page.getByLabel("いつ頃から困るようになりましたか？")).toHaveValue(data.startedAt);
  await expect(page.getByLabel("どんな場面で困っていますか？")).toHaveValue(data.situation);
  await page.getByRole("button", { name: "保存", exact: true }).click();
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

test("「道を編集」「道を育てる」とも自由記述の欄に音声入力ボタンがあり、入力欄のすぐ下に出る", async ({
  page,
}) => {
  const roadId = await loginAndCreateRoad(page, `音声入力テスト ${Date.now()}`);
  const voice = page.getByRole("button", { name: "音声で入力" });
  const screens = [
    {
      path: `/me/roads/${roadId}/edit`,
      fields: [
        page.getByLabel("今、どんなことで困っていますか？"),
        page.getByLabel("これから、何ができるようになりたいですか？"),
        page.getByLabel("以前は、どうしていましたか？（任意）"),
        page.getByLabel("メモ・気づき"),
      ],
    },
    {
      path: `/me/roads/${roadId}/grow`,
      fields: [
        page.getByLabel("どんな場面で困っていますか？"),
        page.getByLabel("いまの進捗"),
        page.getByLabel("次に試すこと"),
        page.getByLabel("メモ", { exact: true }),
      ],
    },
  ];
  for (const sc of screens) {
    await page.goto(sc.path);
    await expect(sc.fields[0]).toBeVisible();
    // Web Speech API が無いブラウザではボタン自体を出さない仕様なので、その場合は確認しない
    test.skip((await voice.count()) === 0, "このブラウザは Web Speech API 非対応");
    await expect(voice).toHaveCount(sc.fields.length);
    for (const [i, f] of sc.fields.entries()) {
      const a = (await f.boundingBox())!;
      const b = (await voice.nth(i).boundingBox())!;
      const gap = b.y - (a.y + a.height);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(8);
    }
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
  // 2026-10-01 に登録画面・道を編集から外し、「道を育てる」の項目になったのでここで確かめる
  const roadId = await loginAndCreateRoad(page, `日付テスト ${Date.now()}`);
  await page.goto(`/me/roads/${roadId}/grow`);
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

test("道の詳細から「道を編集」「道を育てる」へ進め、それぞれ担当の項目だけが出る", async ({
  page,
}) => {
  const roadId = await loginAndCreateRoad(page, `画面分離テスト ${Date.now()}`);
  await page.goto(`/me/roads/${roadId}`);

  await page.getByRole("link", { name: "道を編集" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}/edit$`));
  await expect(page.getByRole("heading", { name: "道を編集" })).toBeVisible();
  await expect(page.locator("form label")).toHaveCount(4);
  await expect(page.getByLabel("いつ頃から困るようになりましたか？")).toHaveCount(0);
  await expect(page.getByLabel("次に試すこと")).toHaveCount(0);

  await page.goto(`/me/roads/${roadId}`);
  await page.getByRole("link", { name: "道を育てる" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}/grow$`));
  await expect(page.getByRole("heading", { name: "道を育てる" })).toBeVisible();
  await expect(page.locator("form label")).toHaveCount(7);
  await expect(page.getByLabel(L_DIFF)).toHaveCount(0);

  // 下部の戻る／キャンセルボタンは無く、上部の「← 道へ戻る」で道の詳細へ戻れる
  await expect(page.getByRole("button", { name: "戻る" })).toHaveCount(0);
  await page.getByRole("link", { name: "← 道へ戻る" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}$`));
});

test("画面分離のテスト 1〜5: 登録 → 道を編集 → 道を育てる → 再表示で、基本情報も追加情報も失われない", async ({
  page,
}) => {
  await login(page);

  // テスト1: 4 項目で登録 → 「道を編集」の同じ場所に出る
  await page.goto("/me/roads/new");
  await page.getByLabel(L_DIFF).fill("瓶のフタを開けるのが難しい");
  await page.getByLabel(L_GOAL).fill("自分で瓶を開けられるようになりたい");
  await page.getByLabel(L_PREV).fill("以前は普通に開けられていた");
  await page.getByLabel("メモ・気づき").fill("家で試してみたい");
  await page.getByRole("button", { name: "この道を作る" }).click();
  await expect(page).toHaveURL(/\/me\/roads\/[0-9a-f-]{36}$/);
  const id = page.url().match(/([0-9a-f-]{36})$/)![1];

  await page.goto(`/me/roads/${id}/edit`);
  await expect(page.getByLabel(L_DIFF)).toHaveValue("瓶のフタを開けるのが難しい");
  await expect(page.getByLabel(L_GOAL)).toHaveValue("自分で瓶を開けられるようになりたい");
  await expect(page.getByLabel(L_PREV)).toHaveValue("以前は普通に開けられていた");
  await expect(page.getByLabel("メモ・気づき")).toHaveValue("家で試してみたい");

  // テスト3: 「道を編集」で基本情報を変えて保存 → 再度開くと同じ欄に戻る
  const basic = {
    [L_DIFF]: "瓶のフタを一人で開けるのが難しい",
    [L_GOAL]: "道具を使って自分で開けたい",
    [L_PREV]: "以前は手で回して開けていた",
    "メモ・気づき": "家で試してみた",
  };
  for (const [label, value] of Object.entries(basic)) await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${id}$`));
  await page.goto(`/me/roads/${id}/edit`);
  await page.reload();
  for (const [label, value] of Object.entries(basic)) {
    await expect(page.getByLabel(label), label).toHaveValue(value);
  }

  // テスト2: 「道を育てる」を開く。メモは基本情報と同じ memo なので同じ内容が見える
  await page.goto(`/me/roads/${id}/grow`);
  await expect(page.getByLabel("メモ", { exact: true })).toHaveValue("家で試してみた");

  // テスト4: 「道を育てる」で追加情報を変えて保存 → 再度開くと同じ欄に戻る
  const grow = {
    "いつ頃から困るようになりましたか？": "2025-03-01",
    "どんな場面で困っていますか？": "ジャムの瓶を開けるとき",
    "状態（例：継続中／一区切り）": "継続中",
    いまの進捗: "ゴムシートで少し開けやすくなった",
    次に試すこと: "オープナーを試す",
  };
  for (const [label, value] of Object.entries(grow)) await page.getByLabel(label).fill(value);
  await page.getByLabel("メモ", { exact: true }).fill("ゴムシートが効いた");
  await page.getByLabel("タグ（カンマ区切り）").fill("台所, 握力");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${id}$`));
  await page.goto(`/me/roads/${id}/grow`);
  await page.reload();
  for (const [label, value] of Object.entries(grow)) {
    await expect(page.getByLabel(label), label).toHaveValue(value);
  }
  await expect(page.getByLabel("メモ", { exact: true })).toHaveValue("ゴムシートが効いた");
  // タグは保存後にタグ名順で並ぶ（既存仕様）ので、中身だけ比べる
  const tagsShown = (await page.getByLabel("タグ（カンマ区切り）").inputValue())
    .split(/,\s*/)
    .sort();
  expect(tagsShown).toEqual(["台所", "握力"].sort());

  // テスト5: 両方を保存したあとも、基本情報（育てる側の保存で消えていない）と追加情報がそろっている
  await page.goto(`/me/roads/${id}/edit`);
  await expect(page.getByLabel(L_DIFF)).toHaveValue("瓶のフタを一人で開けるのが難しい");
  await expect(page.getByLabel(L_GOAL)).toHaveValue("道具を使って自分で開けたい");
  await expect(page.getByLabel(L_PREV)).toHaveValue("以前は手で回して開けていた");
  await expect(page.getByLabel("メモ・気づき")).toHaveValue("ゴムシートが効いた");

  // 「道を編集」をもう一度保存しても、追加情報は消えない
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${id}$`));

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
    memo: "ゴムシートが効いた",
  });
  expect([...dto.tags].sort()).toEqual(["台所", "握力"].sort());
});

test("自分の道の「道を編集」「道を育てる」は、どちらも既存の主ボタン（同じ緑のスタイル）", async ({
  page,
}) => {
  const roadId = await loginAndCreateRoad(page, `ボタン色テスト ${Date.now()}`);
  await page.goto(`/me/roads/${roadId}`);
  const edit = page.getByRole("link", { name: "道を編集" });
  const grow = page.getByRole("link", { name: "道を育てる" });
  // 色コードではなく、共通 LinkButton の primary（--color-primary 系トークン）を使っていることを確かめる
  for (const btn of [edit, grow]) {
    const cls = (await btn.getAttribute("class")) ?? "";
    expect(cls).toContain("bg-[var(--color-primary)]");
    expect(cls).toContain("text-[var(--color-primary-ink)]");
    expect(cls).toContain("hover:bg-[var(--color-primary-hover)]");
  }
  expect(await edit.getAttribute("class")).toBe(await grow.getAttribute("class"));
  // 下部の「試したことを記録」（既存の主ボタン）とも同じ色
  const record = page.getByRole("link", { name: /試したことを記録/ }).first();
  expect(await record.getAttribute("class")).toContain("bg-[var(--color-primary)]");
  // 実際の背景色も 2 つで同じ
  const bg = (l: typeof edit) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg(edit)).toBe(await bg(grow));
});

test("自分の道 → 道を編集 → 道を育てる → 試したことを記録 の順に保存しても、どの内容も失われない", async ({
  page,
}) => {
  const roadId = await loginAndCreateRoad(page, `三画面テスト ${Date.now()}`);
  const detail = new RegExp(`/me/roads/${roadId}$`);
  await page.goto(`/me/roads/${roadId}`);

  // 道を編集
  await page.getByRole("link", { name: "道を編集" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}/edit$`));
  await page.getByLabel(L_DIFF).fill("足が動かせないので、運転ができなくなった");
  await page.getByLabel(L_GOAL).fill("自分で運転して出れるようにしたい");
  await page.getByLabel(L_PREV).fill("自分で自動車を運転して出かけていた");
  await page.getByRole("button", { name: "変更を保存" }).click();
  await expect(page).toHaveURL(detail);

  // 道を育てる
  await page.getByRole("link", { name: "道を育てる" }).click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}/grow$`));
  await expect(page.getByText("今の状態や、これからの一歩を整理します。")).toBeVisible();
  await expect(page.getByRole("heading", { name: "次の一歩", exact: true })).toBeVisible();
  await page.getByLabel("いつ頃から困るようになりましたか？").fill("2025-06-01");
  await page.getByLabel("どんな場面で困っていますか？").fill("買い物に出かけるとき");
  await page.getByLabel("状態（例：継続中／一区切り）").fill("継続中");
  await page.getByLabel("いまの進捗").fill("車いすから車への乗り移りを練習中");
  await page.getByLabel("次に試すこと").fill("車への乗り移り方を調べてみる");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page).toHaveURL(detail);

  // 試したことを記録（実際に試したことと結果）
  await page.getByRole("link", { name: "試したことを記録" }).first().click();
  await page.getByLabel("どんな方法を試しましたか？").fill("車への乗り移り方を調べた");
  await page.getByRole("radio", { name: /^うまくいかなかった/ }).click();
  await page.getByRole("button", { name: "記録する" }).click();
  await expect(page).toHaveURL(detail);
  await expect(page.getByText("車への乗り移り方を調べた")).toBeVisible();

  // どの画面で保存した内容も残っている
  const dto = await (await page.request.get(`/api/v1/roads/${roadId}`)).json();
  expect(dto).toMatchObject({
    difficulty: "足が動かせないので、運転ができなくなった",
    goal: "自分で運転して出れるようにしたい",
    previouslyAble: "自分で自動車を運転して出かけていた",
    startedAt: "2025-06-01",
    situation: "買い物に出かけるとき",
    status: "継続中",
    progress: "車いすから車への乗り移りを練習中",
    nextAction: "車への乗り移り方を調べてみる",
  });
  expect(dto.attempts).toHaveLength(1);
  expect(dto.attempts[0]).toMatchObject({ method: "車への乗り移り方を調べた", result: "failed" });

  // 各画面を開き直しても同じ欄に戻る
  await page.goto(`/me/roads/${roadId}/edit`);
  await expect(page.getByLabel(L_DIFF)).toHaveValue("足が動かせないので、運転ができなくなった");
  await expect(page.getByLabel(L_PREV)).toHaveValue("自分で自動車を運転して出かけていた");
  await page.goto(`/me/roads/${roadId}/grow`);
  await expect(page.getByLabel("次に試すこと")).toHaveValue("車への乗り移り方を調べてみる");
  await expect(page.getByLabel("いまの進捗")).toHaveValue("車いすから車への乗り移りを練習中");
});

test("試したことを記録: 道の画面と同じ見た目で、入力 → 結果 → メモ → 公開設定 → 記録 → 自分の道に表示", async ({
  page,
}) => {
  const roadId = await loginAndCreateRoad(page, `試したこと記録テスト ${Date.now()}`);
  // 既存データ（道の基本情報・その後）を入れておき、記録後も失われないことを確かめる
  await page.request.patch(`/api/v1/roads/${roadId}`, {
    data: { previouslyAble: "以前は普通に開けられていた", nextAction: "オープナーを試す" },
  });
  await page.goto(`/me/roads/${roadId}`);
  await page.getByRole("link", { name: "試したことを記録" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}/attempts/new$`));
  await expect(page.getByRole("heading", { name: "試したことを記録" })).toBeVisible();

  // 道を編集・道を育てると同じカード（淡いグリーン地）・全幅の主ボタン
  const sections = page.locator("form section");
  await expect(sections).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    expect(await sections.nth(i).getAttribute("class")).toContain("bg-[var(--color-primary-tint)]");
  }
  const submit = page.getByRole("button", { name: "記録する" });
  expect(await submit.getAttribute("class")).toContain("w-full");
  // ページ幅も道の画面と同じ（max-w-6xl）
  const width = async (path: string) => {
    await page.goto(path);
    return (await page.locator("main form").boundingBox())!.width;
  };
  const attemptWidth = await width(`/me/roads/${roadId}/attempts/new`);
  expect(attemptWidth).toBe(await width(`/me/roads/${roadId}/grow`));
  await page.goto(`/me/roads/${roadId}/attempts/new`);

  await page.getByLabel("どんな方法を試しましたか？").fill("瓶にゴムシートを当てて回した");
  await page.getByRole("radio", { name: /^少しできた/ }).click();
  await page.getByLabel("メモ・気づき（任意）").fill("力を入れやすくなった");
  const publish = page.getByRole("checkbox", { name: /この経験を公開する/ });
  await expect(publish).not.toBeChecked();
  await page.getByRole("button", { name: "記録する" }).click();

  await expect(page).toHaveURL(new RegExp(`/me/roads/${roadId}$`));
  await expect(page.getByText("瓶にゴムシートを当てて回した")).toBeVisible();

  const dto = await (await page.request.get(`/api/v1/roads/${roadId}`)).json();
  expect(dto.attempts).toHaveLength(1);
  expect(dto.attempts[0]).toMatchObject({
    method: "瓶にゴムシートを当てて回した",
    result: "partial",
    memo: "力を入れやすくなった",
    isPublished: false,
  });
  // 既存の道のデータは失われていない
  expect(dto).toMatchObject({
    previouslyAble: "以前は普通に開けられていた",
    nextAction: "オープナーを試す",
  });
});
