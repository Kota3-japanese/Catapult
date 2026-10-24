// supabaseに接続・ログイン認証するファイルだよ
// このファイルを読み込むと自動で認証されるから、読み込む側が何かする必要は無いよ
// ログインに失敗した場合はエラーを投げて止まるよ
// その場合、このファイルを import しているファイルはすべて実行されないよ

import { DEMO_PASSWORD, DEMO_USERNAME, DUMMY_EMAIL_DOMAIN } from './config.js';

// ログイン中のユーザー。ログインに成功した後にだけ値が入る
// （失敗した場合はこのファイルごと止まるので、import した側で null になることはない）
export let user = null;

// 👇️自動ログインを消してログイン画面を作るならここから
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_KEY, SUPABASE_URL } from './config.js';

// この「supabase」を読み込めば接続できるよ
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// 👆️ここを別ファイルに切り出すよ

// ログアウト（動作確認用。デモでは使わなくてよい）
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    // 分かりやすいメッセージに作り直しつつ、元のエラーを cause に残す
    throw new Error('ログアウトに失敗しました', { cause: error });
  }
}

// 下の関数諸々を使ってログインするよ
try {
  user = await ensureLogin();
  console.log(`ログイン成功！ユーザID：${user.id}`);
} catch (error) {
  // ここに画面へのエラー表示を追加してもいい

  // 投げ直して、このファイルを import している処理をすべて止める
  // 捕まえられないエラーになるので、コンソールに自動で表示される
  throw new Error('ログイン認証失敗', { cause: error });
}

// supabase authはデフォでメアドを認証に使うが、ユーザ名だけでログインしたいためダミーのメアドを作成している。
// 将来、ユーザー名を入力するログイン画面を作るときにも使う。
function toEmail(username) {
  return `${username}@${DUMMY_EMAIL_DOMAIN}`;
}

// ログインする関数
async function ensureLogin() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  // 保存されたログイン状態の確認に失敗した
  if (sessionError) {
    throw new Error('セッションの取得に失敗しました', { cause: sessionError });
  }
  if (sessionData.session) {
    return sessionData.session.user; // ログイン済みならユーザを返して終了
  }

  // ログイン済みでなければログイン処理
  const { data, error } = await supabase.auth.signInWithPassword({
    email: toEmail(DEMO_USERNAME),
    password: DEMO_PASSWORD,
  });

  // パスワード間違い・ユーザー未作成・通信失敗などの理由は cause に残る
  if (error) {
    throw new Error('ログインに失敗しました', { cause: error });
  }
  return data.user;
}
