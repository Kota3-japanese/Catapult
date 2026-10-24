// dbtest.js : db.js の動作確認用テスト
// 多分今は動かない！
//
// 想定しているフォルダ構成：
//   /JS/auth.js, /JS/db.js, /JS/config.js
//   /test/db-test.html, /test/db-test.js, /test/test.jpg（テスト用のJPEG画像）
//
// 使い方：
//   1. test フォルダに test.jpg を置く
//   2. Live Server で db-test.html を開く
//   3. テストが自動で実行され、結果が画面とコンソールに出る
//
// テストの前後で、テスト用の日付（TEST_DATES, ROLLBACK_DATE）の
// 日記の行と画像を自動で削除する。本番の日付と重ならないようにすること。
//
// 補足：画像の存在確認に createImageUrls を使っているため、
//   「画像URLを発行できませんでした」というログがコンソールに出ることがある。
//   画像がないことを確かめている場面では、これは正常な動作。

import {
  createImageUrls,
  deleteDiaryForTest,
  getDiaries,
  getDiaryByDate,
  postDiary,
} from '../JS/db.js';
// 画像パスの期待値（ユーザーID/日付.jpg）を作るために、ユーザーだけ読み込む
// （DB や Storage はすべて db.js の関数経由で触る）
import { user } from '../JS/auth.js';

// ---- テストの設定 ---------------------------------------------------
const TEST_IMAGE = './test.jpg'; // テスト用画像のパス（このファイルから見た位置）
const TEST_DATES = ['2026-08-01', '2026-08-02', '2026-08-03']; // 正常に投稿する日付
const ROLLBACK_DATE = '2026-08-04'; // 挿入失敗のテストに使う日付
const ALL_TEST_DATES = [...TEST_DATES, ROLLBACK_DATE];

// true：テスト後にデータを削除する
// false：削除せずに残す（管理画面でデータを確認したいとき用。次回の開始時には削除される）
const CLEANUP_AFTER = true;

// ---- 画面表示の道具 -------------------------------------------------

const resultsList = document.getElementById('results');
const preview = document.getElementById('preview');
let passCount = 0;
let failCount = 0;

// テスト結果を画面とコンソールに1行表示する
function report(message, type) {
  const li = document.createElement('li');
  li.textContent = message; // innerHTML ではなく textContent で安全に表示
  li.className = type;
  resultsList.appendChild(li);
  if (type === 'fail') {
    console.error(message);
  } else {
    console.log(message);
  }
}

// DBから返ってきた日記と、その画像を画面に表示する
async function showDiary(diary) {
  // 画像のパスから表示用のURLを発行する（db.js の関数をそのまま使う）
  const urlMap = await createImageUrls([diary.image_path]);
  const url = urlMap.get(diary.image_path);

  const figure = document.createElement('figure');

  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = `${diary.diary_date} の笑顔`;
    figure.appendChild(img);
  } else {
    const p = document.createElement('p');
    p.textContent = '（画像のURLを発行できませんでした）';
    figure.appendChild(p);
  }

  // DBから返ってきた値を、そのまま整形して表示する
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(diary, null, 2); // 第3引数の 2 は字下げの幅
  figure.appendChild(pre);

  preview.appendChild(figure);
}

// ---- テスト用の小さな道具 -------------------------------------------

// 条件が false ならエラーにする（テストの「期待と違う」を表す）
function assert(condition, message) {
  if (!condition) {
    throw new Error(`期待と違います：${message}`);
  }
}

// 非同期の処理が「エラーになること」を確かめる
// （エラーにならなかったら、それ自体が失敗）
async function assertThrows(asyncFn, message) {
  try {
    await asyncFn();
  } catch (error) {
    return error; // 期待通りエラーになった。内容を確認できるよう返す
  }
  throw new Error(`エラーになるはずが、成功してしまいました：${message}`);
}

// 1つのテストを実行し、成功・失敗を記録する
// 失敗しても次のテストは続ける
async function test(name, fn) {
  try {
    await fn();
    passCount++;
    report(`✅ ${name}`, 'pass');
  } catch (error) {
    failCount++;
    report(`❌ ${name}：${error.message}`, 'fail');
    console.error(error); // cause なども含めて詳しく見られるよう、そのまま出す
  }
}

// テスト用の画像を Blob として読み込む
async function loadTestImage() {
  const response = await fetch(TEST_IMAGE);
  if (!response.ok) {
    throw new Error(`テスト用画像を読み込めません（${TEST_IMAGE}）`);
  }
  return await response.blob();
}

// テストで期待する画像パス（db.js の規則と同じ「ユーザーID/日付.jpg」）
function expectedImagePath(date) {
  return `${user.id}/${date}.jpg`;
}

// 指定した日付の画像が Storage にあるか確かめる
// createImageUrls は、存在しない画像のURLを対応表に含めないので、それを利用する
async function imageExists(date) {
  const path = expectedImagePath(date);
  const urlMap = await createImageUrls([path]);
  return urlMap.has(path);
}

// テスト用の日付の、日記の行と画像を削除する
// 戻り値：すべて消せたら true
async function cleanup() {
  let ok = true;

  // 1日ずつ、db.js のテスト用削除関数で日記と画像をまとめて消す
  // （日記がない日でも、画像だけ残っていれば消してくれる）
  for (const date of ALL_TEST_DATES) {
    try {
      await deleteDiaryForTest(date);
    } catch (error) {
      ok = false;
      report(`⚠️ ${date} の削除に失敗しました：${error.message}`, 'fail');
      console.error(error);
    }
  }

  // 本当に消えたか確認する
  // （画像の削除はポリシーがないと静かに失敗することがあるため、念のため確かめる）
  const remainingRows = await getDiaries(
    ALL_TEST_DATES[0],
    ALL_TEST_DATES.at(-1),
  );
  const remainingImages = [];
  for (const date of ALL_TEST_DATES) {
    if (await imageExists(date)) {
      remainingImages.push(date);
    }
  }

  if (remainingRows.length > 0) {
    ok = false;
    report(
      `⚠️ 日記が ${remainingRows.length} 件残っています。日記テーブルの DELETE ポリシーを確認してください。`,
      'fail',
    );
  }
  if (remainingImages.length > 0) {
    ok = false;
    report(
      `⚠️ 画像が残っています（${remainingImages.join(', ')}）。Storage の DELETE ポリシーを確認してください。`,
      'fail',
    );
  }
  return ok;
}

// ---- テスト本体 -------------------------------------------------------

async function runTests() {
  report(`ログイン中のユーザーID：${user.id}`, 'info');

  // 事前の後片付け：前回のテストのデータが残っていたら消しておく
  if (!(await cleanup())) {
    report(
      '❌ 前回のテストデータを削除できなかったため、テストを中止します。',
      'fail',
    );
    return;
  }
  report('ℹ️ テスト用の日付のデータを初期化しました。', 'info');

  const imageBlob = await loadTestImage();
  const [d1, d2, d3] = TEST_DATES;

  // ---- 1. 空の状態 ----
  await test('日記がない期間では空の配列が返る', async () => {
    const diaries = await getDiaries(d1, d3);
    assert(Array.isArray(diaries), '配列であること');
    assert(diaries.length === 0, `0件であること（実際：${diaries.length}件）`);
  });

  await test('日記がない日は null が返る', async () => {
    const diary = await getDiaryByDate(d1);
    assert(diary === null, 'null であること');
  });

  // ---- 2. 投稿（正常系） ----
  await test('投稿すると、挿入した日記が返る', async () => {
    const diary = await postDiary({
      date: d1,
      comment: 'テスト1日目',
      smileScore: 80, // 得点は 0〜100 の整数
      imageBlob,
    });
    assert(diary.diary_date === d1, '日付が一致すること');
    assert(diary.comment === 'テスト1日目', '一言が一致すること');
    assert(
      diary.smile_score === 80,
      `得点が一致すること（実際：${diary.smile_score}）`,
    );
    assert(
      diary.image_path === expectedImagePath(d1),
      '画像パスが「ユーザーID/日付.jpg」であること',
    );

    // 投稿に成功したら、返ってきた値と画像を画面に表示する
    await showDiary(diary);
  });

  await test('投稿すると、Storage に画像が保存されている', async () => {
    assert(await imageExists(d1), `${d1}.jpg が存在すること`);
  });

  await test('投稿した日記を日付で取得できる', async () => {
    const diary = await getDiaryByDate(d1);
    assert(diary !== null, 'null ではないこと');
    assert(diary.comment === 'テスト1日目', '一言が一致すること');
  });

  // ---- 3. 重複投稿（異常系） ----
  await test('同じ日に2回投稿するとエラーになる', async () => {
    await assertThrows(
      () => postDiary({ date: d1, comment: '重複', smileScore: 50, imageBlob }),
      '同じ日付での2回目の投稿',
    );
    const diary = await getDiaryByDate(d1);
    assert(diary.comment === 'テスト1日目', '元の日記が書き換わっていないこと');
  });

  // ---- 4. 取得と期間の境界 ----
  // 並び順を確かめるため、わざと新しい日付から投稿する
  await test('2件目・3件目を投稿できる', async () => {
    const diary3 = await postDiary({
      date: d3,
      comment: 'テスト3日目',
      smileScore: 30,
      imageBlob,
    });
    await showDiary(diary3);
    const diary2 = await postDiary({
      date: d2,
      comment: 'テスト2日目',
      smileScore: 50,
      imageBlob,
    });
    await showDiary(diary2);
  });

  await test('期間内の日記が日付の古い順で返る', async () => {
    const diaries = await getDiaries(d1, d3);
    assert(diaries.length === 3, `3件であること（実際：${diaries.length}件）`);
    const dates = diaries.map((d) => d.diary_date);
    assert(
      dates.join(',') === [d1, d2, d3].join(','),
      `古い順であること（実際：${dates.join(', ')}）`,
    );
  });

  await test('開始日と終了日が同じでも、その日の日記が取れる（両端を含む）', async () => {
    const diaries = await getDiaries(d2, d2);
    assert(diaries.length === 1, `1件であること（実際：${diaries.length}件）`);
    assert(diaries[0].diary_date === d2, 'その日の日記であること');
  });

  await test('期間外の日記は含まれない', async () => {
    const diaries = await getDiaries(d2, d3);
    const dates = diaries.map((d) => d.diary_date);
    assert(!dates.includes(d1), `${d1} が含まれないこと`);
    assert(diaries.length === 2, `2件であること（実際：${diaries.length}件）`);
  });

  // ---- 5. 画像URLの発行 ----
  await test('画像パスからURLをまとめて発行でき、画像を取得できる', async () => {
    const diaries = await getDiaries(d1, d3);
    const paths = diaries.map((d) => d.image_path);
    const urlMap = await createImageUrls(paths);
    assert(urlMap.size === 3, `3件のURLがあること（実際：${urlMap.size}件）`);

    // 発行されたURLから、実際に画像を取得できるか
    const response = await fetch(urlMap.get(paths[0]));
    assert(
      response.ok,
      `URLから取得できること（ステータス：${response.status}）`,
    );
    const blob = await response.blob();
    assert(
      blob.type.startsWith('image/'),
      `画像であること（実際：${blob.type}）`,
    );
  });

  await test('存在しないパスは、URLの対応表に含まれない', async () => {
    const realPath = expectedImagePath(d1);
    const fakePath = `${user.id}/存在しない画像.jpg`;
    const urlMap = await createImageUrls([realPath, fakePath]);
    assert(urlMap.has(realPath), '存在するパスは含まれること');
    assert(!urlMap.has(fakePath), '存在しないパスは含まれないこと');
  });

  await test('空の配列を渡すと、空の対応表が返る', async () => {
    const urlMap = await createImageUrls([]);
    assert(urlMap.size === 0, '空であること');
  });

  // ---- 6. 挿入失敗時の後始末 ----
  await test('日記の挿入に失敗すると、アップロードした画像も削除される', async () => {
    // 得点に文字列を渡すと、画像のアップロードは成功するが、DBの型が合わず挿入が失敗する
    await assertThrows(
      () =>
        postDiary({
          date: ROLLBACK_DATE,
          comment: '失敗するはず',
          smileScore: '数値ではない',
          imageBlob,
        }),
      '不正な得点での投稿',
    );
    assert(
      (await getDiaryByDate(ROLLBACK_DATE)) === null,
      '日記が保存されていないこと',
    );
    assert(
      !(await imageExists(ROLLBACK_DATE)),
      '画像が残っていないこと（Storage の DELETE ポリシーを確認）',
    );
  });

  // ---- 7. テスト用削除関数 ----
  await test('deleteDiaryForTest で日記と画像がまとめて消え、消した日記が返る', async () => {
    const deleted = await deleteDiaryForTest(d3);
    assert(deleted !== null, '削除した日記が返ること');
    assert(deleted.diary_date === d3, '削除した日記の日付が一致すること');
    assert((await getDiaryByDate(d3)) === null, '日記が消えていること');
    assert(!(await imageExists(d3)), '画像が消えていること');
  });

  await test('日記がない日に deleteDiaryForTest を呼ぶと null が返る', async () => {
    const deleted = await deleteDiaryForTest(d3); // 直前のテストで削除済み
    assert(deleted === null, 'null であること');
  });

  // ---- 結果のまとめ ----
  report(
    `結果：成功 ${passCount} 件 / 失敗 ${failCount} 件`,
    failCount === 0 ? 'pass' : 'fail',
  );

  // ---- 事後の後片付け ----
  // 表示済みの画像は読み込み済みなので、削除しても画面からは消えない
  if (CLEANUP_AFTER) {
    if (await cleanup()) {
      report('ℹ️ テストで作った日記と画像を削除しました。', 'info');
    }
  } else {
    report(
      'ℹ️ テストデータは残しています（次回のテスト開始時に削除されます）。',
      'info',
    );
  }
}

runTests().catch((error) => {
  // テストの道具自体（画像の読み込みなど）が失敗した場合
  report(`❌ テストを実行できませんでした：${error.message}`, 'fail');
  console.error(error);
});
