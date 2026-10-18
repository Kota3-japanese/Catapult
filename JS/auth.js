// supabaseに接続・ログイン認証するファイルだよ

import { DEMO_USERNAME, DEMO_PASSWORD, DUMMY_EMAIL_DOMAIN } from "./config.js";
export let user = null;

// 👇️自動ログインを消してログイン画面を作るならここから
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

// この「supabase」を読み込めば接続できるよ
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// 👆️ここを別ファイルに切り出すよ

// ログアウト（動作確認用。デモでは使わなくてよい）
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("ログアウトエラーです。");
    throw error;
  }
}

// 下の関数諸々を使ってログインするよ
try {
  user = await ensureLogin();
  console.log(`ログイン成功！ユーザID：${user.id}`);
} catch (error) {
  console.error("ログインに失敗しました泣！：", error.message);
}

// supabase authはデフォでメアドを認証に使うが、ユーザ名だけでログインしたいためダミーのメアドを作成している。
function toEmail(username) {
  return `${username}@${DUMMY_EMAIL_DOMAIN}`;
}

// ログインする関数
async function ensureLogin() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  // セッションエラーを返す
  if (sessionError) {
    console.error("セッションエラーです。");
    throw sessionError;
  }
  if (sessionData.session) {
    return sessionData.session.user; // ログイン済みならユーザを返して終了
  }

  // ログイン済みでなければログイン処理
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(DEMO_USERNAME),
    password: DEMO_PASSWORD,
  });

  if (error) {
    console.error("ログインエラーです");
    throw error;
  }
  return data.user;
}
