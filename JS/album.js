
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const titleElement = document.getElementById("albumTitle");
const statusElement = document.getElementById("albumStatus");
const gridElement = document.getElementById("albumGrid");

function showStatus(message) {
  statusElement.textContent = message;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);
}

function renderAlbum(album) {
  titleElement.textContent = album.title || "共有アルバム";
  gridElement.replaceChildren();

  if (!Array.isArray(album.items) || album.items.length === 0) {
    showStatus("このアルバムには写真がありません。");
    return;
  }

  for (const item of album.items) {
    const card = document.createElement("article");
    card.className = "album-card";

    const image = document.createElement("img");
    image.className = "album-photo";
    image.alt = `${formatDate(item.diary_date)}の写真`;
    image.loading = "lazy";
    image.src = item.signed_url;

    const content = document.createElement("div");
    content.className = "album-card-content";

    const date = document.createElement("p");
    date.className = "album-date";
    date.textContent = formatDate(item.diary_date);

    const note = document.createElement("p");
    note.className = "album-note";
    note.textContent = item.comment || "";

    content.append(date, note);

    if (item.smile_score !== null && item.smile_score !== undefined) {
      const score = document.createElement("p");
      score.className = "album-score";
      score.textContent = `笑顔スコア：${item.smile_score}`;
      content.append(score);
    }

    card.append(image, content);
    gridElement.append(card);
  }

  showStatus(`${album.items.length}件の思い出`);
}

async function loadAlbum() {
  const token = new URLSearchParams(window.location.search).get("token");

  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    showStatus("共有URLが正しくありません。");
    return;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/shared-album?token=${encodeURIComponent(token)}`,
      {
        headers: {
          apikey: SUPABASE_KEY
        }
      }
    );

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "アルバムを取得できませんでした。");
    }

    if (!result.album) {
      showStatus("アルバムが見つからないか、共有URLが無効です。");
      return;
    }

    renderAlbum(result.album);
  } catch (error) {
    console.error("共有アルバムの取得に失敗しました:", error);
    showStatus("アルバムを読み込めませんでした。時間をおいて再度お試しください。");
  }
}

loadAlbum();
