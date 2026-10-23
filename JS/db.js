
 // DBとのデータやり取りがまとまったファイル
 // auth.js から Supabase クライアントとログインユーザーを取得する

import { supabase, user } from "./auth.js";

// ---- 設定値 ---------------------------------------------------------

const TABLE = "diaries";
const BUCKET = "smile-images";
const SIGNED_URL_EXPIRES = 60 * 60;

// 画面で使用する列
const DIARY_COLUMNS =
  "diary_date, comment, image_path, smile_score";

// ---- 内部用の関数 ---------------------------------------------------

// ログインしていなければエラーにする
function requireLogin() {
  if (!user) {
    throw new Error(
      "ログインしていないため、データを扱えません。"
    );
  }
}

// 日付から画像のパスを作る
function toImagePath(date) {
  return `${user.id}/${date}.jpg`;
}

// ---- 日記の取得 -----------------------------------------------------

/**
 * 指定期間の日記を取得する（日付の昇順）
 */
export async function getDiaries(startDate, endDate) {
  requireLogin();

  const { data, error } = await supabase
    .from(TABLE)
    .select(DIARY_COLUMNS)
    .gte("diary_date", startDate)
    .lte("diary_date", endDate)
    .order("diary_date", { ascending: true });

  if (error) {
    console.error("日記の取得に失敗しました:", error.message);
    throw error;
  }

  return data ?? [];
}

/**
 * 指定した日の日記を1件取得する
 */
export async function getDiaryByDate(date) {
  requireLogin();

  const { data, error } = await supabase
    .from(TABLE)
    .select(DIARY_COLUMNS)
    .eq("diary_date", date)
    .maybeSingle();

  if (error) {
    console.error("日記の取得に失敗しました:", error.message);
    throw error;
  }

  return data;
}

// ---- 画像URL --------------------------------------------------------

/**
 * 画像パスの配列から署名付きURLを発行する
 * 戻り値は Map（画像パス → URL）
 */
export async function createImageUrls(paths) {
  requireLogin();

  if (!paths || paths.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRES);

  if (error) {
    console.error(
      "画像URLの発行に失敗しました:",
      error.message
    );
    throw error;
  }

  const urlMap = new Map();

  for (const item of data ?? []) {
    if (item.error || !item.signedUrl) {
      console.error(
        `画像URLを発行できませんでした（${item.path}）:`,
        item.error
      );
      continue;
    }

    urlMap.set(item.path, item.signedUrl);
  }

  return urlMap;
}

// ---- 日記の投稿 -----------------------------------------------------

/**
 * 画像をアップロードして日記を投稿する
 */
export async function postDiary({
  date,
  comment,
  smileScore,
  imageBlob,
  contentType = "image/jpeg"
}) {
  requireLogin();

  if (!date) {
    throw new Error("日付を指定してください。");
  }

  if (!(imageBlob instanceof Blob)) {
    throw new Error("アップロードする画像がありません。");
  }

  // 1. 同じ日付の日記がないか確認する
  const existing = await getDiaryByDate(date);

  if (existing) {
    throw new Error(
      `${date} の日記はすでに投稿されています。`
    );
  }

  // 2. 画像をアップロードする
  const imagePath = toImagePath(date);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(imagePath, imageBlob, {
      contentType,
      upsert: false
    });

  if (uploadError) {
    console.error(
      "画像のアップロードに失敗しました:",
      uploadError.message
    );
    throw uploadError;
  }

  // 3. 日記をデータベースに保存する
  const { data, error: insertError } = await supabase
    .from(TABLE)
    .insert({
      diary_date: date,
      comment,
      image_path: imagePath,
      smile_score: smileScore
    })
    .select(DIARY_COLUMNS)
    .single();

  if (insertError) {
    console.error(
      "日記の保存に失敗しました:",
      insertError.message
    );

    // 日記の保存に失敗したら、アップロードした画像を削除する
    const { error: removeError } = await supabase.storage
      .from(BUCKET)
      .remove([imagePath]);

    if (removeError) {
      console.error(
        `画像の後片付けに失敗しました（${imagePath}）:`,
        removeError.message
      );
    }

    throw insertError;
  }

  return data;
}

// ---- 日記と画像の削除 -----------------------------------------------

/**
 * 指定した日の日記と関連する画像を削除する
 *
 * 戻り値:
 * {
 *   success: true,
 *   imageDeleted: true または false
 * }
 *
 * 日記が見つからない場合や日記の削除に失敗した場合は
 * エラーを投げる。
 */
export async function deleteDiary(date) {
  requireLogin();

  if (!date) {
    throw new Error("削除する日付を指定してください。");
  }

  // 1. 削除対象の日記を取得する
  const { data: diary, error: findError } = await supabase
    .from(TABLE)
    .select("diary_date, image_path")
    .eq("diary_date", date)
    .maybeSingle();

  if (findError) {
    console.error(
      "削除対象の日記の取得に失敗しました:",
      findError.message
    );
    throw findError;
  }

  if (!diary) {
    throw new Error("削除する日記が見つかりません。");
  }

  // 2. データベースから日記を削除する
  const { data: deletedDiaries, error: deleteError } =
    await supabase
      .from(TABLE)
      .delete()
      .eq("diary_date", date)
      .select("diary_date");

  if (deleteError) {
    console.error(
      "日記の削除に失敗しました:",
      deleteError.message
    );
    throw deleteError;
  }

  // RLSなどにより実際には削除されなかった場合
  if (!deletedDiaries || deletedDiaries.length === 0) {
    throw new Error(
      "日記を削除できませんでした。データベースの権限設定を確認してください。"
    );
  }

  // 3. 画像パスがなければ、日記の削除だけで完了
  if (!diary.image_path) {
    return {
      success: true,
      imageDeleted: true
    };
  }

  // 4. データベースに保存されていたパスで画像を削除する
  const { error: imageError } = await supabase.storage
    .from(BUCKET)
    .remove([diary.image_path]);

  if (imageError) {
    console.error(
      "日記は削除しましたが、画像の削除に失敗しました:",
      imageError.message
    );

    return {
      success: true,
      imageDeleted: false
    };
  }

  return {
    success: true,
    imageDeleted: true
  };
}
