// DBとのデータやり取りがまとまったファイルだよ
// auth.js を import しているので、このファイルを読み込んだ時点で自動でログインされる。
// 失敗したときはすべて Error を投げる（throw）。使う側は try / catch で受け取る。

import { supabase, user } from './auth.js';

// ---- 設定値（名前を変えたらここだけ直す） --------------------------
const TABLE = 'diaries'; // 日記テーブル名
const BUCKET = 'smile-images'; // 画像を置くバケット名
const SIGNED_URL_EXPIRES = 60 * 60; // 署名付きURLの有効期限（秒）。ここでは1時間

// 取得する列。画面で使うものだけに絞り、返すデータの形を固定する
const DIARY_COLUMNS = 'diary_date, comment, image_path, smile_score';

// ---- 内部用の関数（export しない） ---------------------------------

// ログインできていなければ、問い合わせる前にエラーにする
// （ログインせずに問い合わせると、RLSにより「空の結果」が返り、
//   「日記がない」と誤解してしまうため）
function requireLogin() {
  if (!user) {
    throw new Error('ログインしていないため、データを扱えません');
  }
}

// 日付から画像のパスを作る（投稿と削除で同じ規則を使うため、1か所にまとめる）
function toImagePath(date) {
  return `${user.id}/${date}.jpg`;
}

/**
 * 期間を指定して日記を取得する（日付の昇順）
 * @param {string} startDate 開始日 "YYYY-MM-DD"（この日を含む）
 * @param {string} endDate   終了日 "YYYY-MM-DD"（この日を含む）
 * @returns {Promise<Array<{diary_date: string, comment: string, image_path: string, smile_score: number}>>}
 *          日記の配列。1件もなければ空の配列
 */
export async function getDiaries(startDate, endDate) {
  requireLogin();

  // ユーザーでの絞り込みは RLS が行うので書かない
  const { data, error } = await supabase
    .from(TABLE)
    .select(DIARY_COLUMNS)
    .gte('diary_date', startDate) // 開始日以上
    .lte('diary_date', endDate) // 終了日以下
    .order('diary_date', { ascending: true }); // 日付の古い順

  if (error) {
    console.error('日記の取得に失敗しました：', error.message);
    throw error;
  }
  // 念のため、data が null の場合も空の配列にそろえる
  return data ?? [];
}

/**
 * 指定した日の日記を1件取得する
 * @param {string} date "YYYY-MM-DD"
 * @returns {Promise<object|null>} 日記。なければ null
 */
export async function getDiaryByDate(date) {
  requireLogin();

  // maybeSingle()：0件なら null、1件ならその行を返す（2件以上はエラー）
  // 複合ユニーク制約があるので、2件以上になることはない
  const { data, error } = await supabase
    .from(TABLE)
    .select(DIARY_COLUMNS)
    .eq('diary_date', date)
    .maybeSingle();

  if (error) {
    console.error('日記の取得に失敗しました：', error.message);
    throw error;
  }
  return data;
}

// ---- 画像URL --------------------------------------------------------

/**
 * 複数の画像パスから、表示用の署名付きURLをまとめて発行する
 * @param {string[]} paths Storage上のパスの配列
 * @returns {Promise<Map<string, string>>} パス → URL の対応表
 *          （使い方：urlMap.get(diary.image_path) でURLが取れる）
 */
export async function createImageUrls(paths) {
  requireLogin();

  // パスが1つもなければ、通信せずに空の対応表を返す
  if (paths.length === 0) {
    return new Map();
  }

  // 1回のリクエストで、全部のパスのURLをまとめて発行する
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES);

  if (error) {
    console.error('画像URLの発行に失敗しました：', error.message);
    throw error;
  }

  // 結果は [{ path, signedUrl, error }, ...] の配列なので、
  // 「パスからURLを引ける」Map に変換して返す
  const urlMap = new Map();
  for (const item of data) {
    if (item.error) {
      // 画像が見つからないなど、1件だけ失敗した場合は飛ばす
      // （表示側では URL がない = デフォルト画像を使う、などで対応できる）
      console.error(
        `画像URLを発行できませんでした（${item.path}）：`,
        item.error,
      );
      continue;
    }
    urlMap.set(item.path, item.signedUrl);
  }
  return urlMap;
}

// ---- 投稿 -----------------------------------------------------------

/**
 * 日記を投稿する（画像のアップロード → 日記の挿入）
 * @param {object}  params
 * @param {string}  params.date        日記の日付 "YYYY-MM-DD"（呼び出し側で日本時間で決める）
 * @param {string}  params.comment     一言日記
 * @param {number}  params.smileScore  笑顔の得点（0〜100 の整数）
 * @param {Blob}    params.imageBlob   笑顔の画像（canvas.toBlob などで作ったもの）
 * @param {string} [params.contentType] 画像の形式。省略時は JPEG
 * @returns {Promise<object>} 挿入された日記（getDiaries と同じ形）
 */
export async function postDiary({
  date,
  comment,
  smileScore,
  imageBlob,
  contentType = 'image/jpeg',
}) {
  requireLogin();

  // 1. その日の日記がすでにあれば、アップロードする前に止める
  const existing = await getDiaryByDate(date);
  if (existing) {
    throw new Error(`${date} の日記はすでに投稿されています`);
  }

  // 2. 画像をアップロードする
  //    パスは「ユーザーID/日付.jpg」。Storage の RLS は先頭フォルダ = ユーザーID で判定している
  const imagePath = toImagePath(date);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(imagePath, imageBlob, {
      contentType, // バケットで許可した形式と一致している必要がある
      upsert: false, // 同じパスがあれば上書きせずエラーにする
    });

  if (uploadError) {
    console.error('画像のアップロードに失敗しました：', uploadError.message);
    throw uploadError;
  }

  // 3. 日記を挿入し、挿入した行をそのまま受け取る
  //    user_id はデフォルト値 auth.uid() で自動的に入るので送らない
  const { data, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      diary_date: date,
      comment: comment,
      image_path: imagePath,
      smile_score: smileScore,
    })
    .select(DIARY_COLUMNS) // 挿入した行を返してもらう
    .single(); // 1件だけなので、配列ではなくオブジェクトで受け取る

  if (insertError) {
    console.error('日記の保存に失敗しました：', insertError.message);

    // 4. 挿入に失敗したら、アップロード済みの画像を消して元の状態に戻す
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove([imagePath]);
    if (removeError) {
      console.error(
        `画像の削除にも失敗しました。手動で削除してください（${imagePath}）：`,
        removeError.message,
      );
    }

    throw insertError;
  }

  return data;
}

// ---- 削除（⚠️ テスト用。本番の画面からは呼ばないこと） ----------------

/**
 * 【テスト用】指定した日の日記と画像をまとめて削除する
 *
 * - 日記の行がなくても、画像だけ残っていれば画像を削除する（テストの後片付け用）
 * - 日記テーブルと Storage の両方に DELETE ポリシーが必要
 *   （本番前にポリシーを外すと、この関数はエラーになる）
 *
 * @param {string} date "YYYY-MM-DD"
 * @returns {Promise<object|null>} 削除した日記。日記の行がなかった場合は null
 */
export async function deleteDiaryForTest(date) {
  requireLogin();

  // 1. 削除前に、日記があるか確認しておく
  //    （RLS で DELETE が許可されていないと、エラーにならず「0件削除」で終わる。
  //     元々あったのに消えなかった、を見分けるため）
  const existing = await getDiaryByDate(date);

  // 2. 日記の行を削除する
  //    画像より先に消すのは、途中で失敗したときに
  //    「存在しない画像を指す日記」が残るのを避けるため
  //    （逆に画像だけが残る分には、表示が壊れない）
  let deletedDiary = null;
  if (existing) {
    const { data, error: deleteError } = await supabase
      .from(TABLE)
      .delete()
      .eq('diary_date', date)
      .select(DIARY_COLUMNS); // 削除した行を返してもらう（0件なら空の配列）

    if (deleteError) {
      console.error('日記の削除に失敗しました：', deleteError.message);
      throw deleteError;
    }
    if (data.length === 0) {
      // 日記はあったのに1件も消えなかった = DELETE ポリシーがない可能性が高い
      throw new Error(
        `${date} の日記を削除できませんでした（日記テーブルの DELETE ポリシーを確認）`,
      );
    }
    deletedDiary = data[0];
  }

  // 3. 画像を削除する
  //    日記の行がなかった場合も、パスの規則から画像を探して消す
  //    （存在しないパスを指定してもエラーにはならない）
  const imagePath = existing?.image_path ?? toImagePath(date);
  const { data: removed, error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([imagePath]);

  if (removeError) {
    console.error(
      `画像の削除に失敗しました。手動で削除してください（${imagePath}）：`,
      removeError.message,
    );
    throw removeError;
  }
  // removed は実際に削除されたファイルの一覧。画像があった日なのに空なら、ポリシーの可能性
  if (existing && removed.length === 0) {
    console.warn(
      `画像が削除されませんでした（${imagePath}）。` +
        'すでにない画像か、Storage の DELETE ポリシーを確認してください。',
    );
  }

  return deletedDiary;
}
