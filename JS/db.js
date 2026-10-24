
import { supabase, user } from "./auth.js";

// ---- 設定値 ---------------------------------------------------------

const TABLE = "diaries";
const BUCKET = "smile-images";
const SIGNED_URL_EXPIRES = 60 * 60;

const DIARY_COLUMNS =
  "diary_date, comment, image_path, smile_score";

// ---- 内部用の関数 ---------------------------------------------------

function requireLogin() {
  if (!user) {
    throw new Error("ログインしていないため、データを扱えません。");
  }
}

function toImagePath(date) {
  return `${user.id}/${date}.jpg`;
}

// ---- 日記の取得 -----------------------------------------------------

/**
 * 指定期間の日記を日付の昇順で取得する
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
    console.error("画像URLの発行に失敗しました:", error.message);
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

  // 同じ日付の日記がないか確認する
  const existing = await getDiaryByDate(date);

  if (existing) {
    throw new Error(`${date} の日記はすでに投稿されています。`);
  }

  // 画像をアップロードする
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

  // 日記をデータベースに保存する
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

    // 保存に失敗した場合は、アップロードした画像を削除する
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

// ---- 日記の削除 -----------------------------------------------------

/**
 * 指定した日の日記と保存画像を削除する
 */
export async function deleteDiary(date) {
  requireLogin();

  if (!date) {
    throw new Error("削除する日付を指定してください。");
  }

  // 日記を取得する
  const diary = await getDiaryByDate(date);

  if (!diary) {
    throw new Error(`${date} の日記が見つかりません。`);
  }

  // 日記をデータベースから削除する
  const { error: deleteError } = await supabase
    .from(TABLE)
    .delete()
    .eq("diary_date", date);

  if (deleteError) {
    console.error("日記の削除に失敗しました:", deleteError.message);
    throw deleteError;
  }

  // 保存画像を削除する
  if (diary.image_path) {
    const { error: imageError } = await supabase.storage
      .from(BUCKET)
      .remove([diary.image_path]);

    if (imageError) {
      console.error("画像の削除に失敗しました:", imageError.message);
      throw imageError;
    }
  }

  return true;
}

// ---- 共有アルバムの作成 --------------------------------------------

/**
 * 指定した日記をまとめて共有アルバムを作成する
 */
export async function createSharedAlbum({ title, diaries }) {
  requireLogin();

  if (!Array.isArray(diaries) || diaries.length === 0) {
    throw new Error("アルバムに追加する日記がありません。");
  }

  // 共有URL用のランダムなトークンを作成する
  const shareToken = crypto.randomUUID();

  // アルバム情報を保存する
  const { data: album, error: albumError } = await supabase
    .from("shared_albums")
    .insert({
      owner_id: user.id,
      title: title || "Be Smile Album",
      share_token: shareToken
    })
    .select("id, title, share_token")
    .single();

  if (albumError) {
    console.error("アルバムの作成に失敗しました:", albumError);
    throw albumError;
  }

  // 日記をアルバムの収録項目に変換する
  const items = diaries.map((diary) => ({
    album_id: album.id,
    diary_date: diary.date,
    comment: diary.note || "",
    smile_score: diary.score ?? null,
    image_path: diary.image_path
  }));

  // 収録項目を保存する
  const { error: itemsError } = await supabase
    .from("shared_album_items")
    .insert(items);

  if (itemsError) {
    console.error("アルバムの記録保存に失敗しました:", itemsError);

    // 項目の保存に失敗した場合は、アルバムを削除する
    const { error: cleanupError } = await supabase
      .from("shared_albums")
      .delete()
      .eq("id", album.id);

    if (cleanupError) {
      console.error(
        "アルバムの後片付けに失敗しました:",
        cleanupError
      );
    }

    throw itemsError;
  }

  return {
    ...album,
    shareUrl: new URL(
      `album.html?token=${encodeURIComponent(shareToken)}`,
      window.location.href
    ).href
  };
}
