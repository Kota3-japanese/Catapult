
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders },
    );
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get("token");

    if (
      !token ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)
    ) {
      return Response.json(
        { error: "共有URLが正しくありません。" },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("サーバー側の環境変数が設定されていません。");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: album, error: albumError } = await supabase.rpc(
      "get_shared_album",
      { p_share_token: token },
    );

    if (albumError) {
      console.error("アルバム取得エラー:", albumError.message);
      throw new Error("アルバムを取得できませんでした。");
    }

    if (!album) {
      return Response.json(
        { error: "アルバムが見つかりません。" },
        { status: 404, headers: corsHeaders },
      );
    }

    const items = Array.isArray(album.items) ? album.items : [];
    const paths = items.map((item: { image_path: string }) => item.image_path);

    let signedUrlMap = new Map<string, string>();

    if (paths.length > 0) {
      const { data: signedUrls, error: signedError } = await supabase.storage
        .from("smile-images")
        .createSignedUrls(paths, 60 * 10);

      if (signedError) {
        console.error("写真URLの発行エラー:", signedError.message);
        throw new Error("写真を表示できませんでした。");
      }

      signedUrlMap = new Map(
        (signedUrls ?? [])
          .filter((item) => !item.error && item.signedUrl)
          .map((item) => [item.path, item.signedUrl]),
      );
    }

    const safeItems = items
      .filter((item: { image_path: string }) => signedUrlMap.has(item.image_path))
      .map((item: {
        diary_date: string;
        comment: string | null;
        smile_score: number | null;
        image_path: string;
      }) => ({
        diary_date: item.diary_date,
        comment: item.comment,
        smile_score: item.smile_score,
        signed_url: signedUrlMap.get(item.image_path),
      }));

    return Response.json(
      {
        album: {
          title: album.title,
          items: safeItems,
        },
      },
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("共有アルバム処理エラー:", error);

    return Response.json(
      { error: "アルバムの読み込みに失敗しました。" },
      { status: 500, headers: corsHeaders },
    );
  }
});
