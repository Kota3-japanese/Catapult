
import {
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

import {
  getDiaries,
  createImageUrls,
  postDiary,
  deleteDiary
} from "./db.js";

// HTML要素を取得する
const $ = (selector) => document.querySelector(selector);

const views = [...document.querySelectorAll(".view")];
const navItems = [...document.querySelectorAll(".nav-item")];
const monthLabel = $("#monthLabel");
const calendarGrid = $("#calendarGrid");
const recentList = $("#recentList");
const emptyState = $("#emptyState");
const recordCount = $("#recordCount");

const video = $("#cameraVideo");
const canvas = $("#captureCanvas");
const cameraPlaceholder = $("#cameraPlaceholder");
const cameraStatus = $("#cameraStatus");
const startCameraButton = $("#startCameraButton");
const captureButton = $("#captureButton");
const saveRecordButton = $("#saveRecordButton");
const recordForm = $("#recordForm");
const deleteRecordButton = $("#deleteRecordButton");
const downloadAlbumButton = $("#downloadAlbumButton");

// アプリの状態
const now = new Date();

let shownMonth = new Date(
  now.getFullYear(),
  now.getMonth(),
  1
);

let selectedDate = dateKey(now);
let capturedPhoto = "";
let cameraStream = null;
let activeRecordId = null;
let faceLandmarker = null;
let isCapturing = false;

// Supabaseから取得した日記データ
let records = [];

// 日付を YYYY-MM-DD の形式にする
function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

// YYYY-MM-DD を Date に変換する
function parseDate(key) {
  const [y, m, d] = key.split("-").map(Number);

  return new Date(y, m - 1, d);
}

// 日付を日本語形式で表示する
function formatDate(key) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(parseDate(key));
}

// HTMLに表示する文字列を安全に変換する
function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

// Supabaseの日記データを画面表示用に変換する
function convertDiaryRecords(diaries, imageUrls) {
  return diaries.map((diary) => ({
    id: diary.diary_date,
    date: diary.diary_date,
    photo: imageUrls.get(diary.image_path) || "",
    note: diary.comment || "",
    score: diary.smile_score,
    createdAt: diary.created_at || ""
  }));
}

// Supabaseから日記と画像URLを取得する
async function loadSupabaseRecords() {
  try {
    const diaries = await getDiaries(
      "1900-01-01",
      "2100-12-31"
    );

    const imagePaths = diaries
      .map((diary) => diary.image_path)
      .filter(Boolean);

    const imageUrls = await createImageUrls(imagePaths);

    records = convertDiaryRecords(diaries, imageUrls);

    renderCalendar();

    return true;
  } catch (error) {
    console.error("日記の読み込みに失敗しました:", error);

    $("#formMessage").textContent =
      "日記を読み込めませんでした。通信状況やSupabaseの設定を確認してください。";

    return false;
  }
}

// 表示する画面を切り替える
function showView(id) {
  views.forEach((view) => {
    view.classList.toggle("is-active", view.id === id);
  });

  navItems.forEach((item) => {
    item.classList.toggle(
      "is-current",
      item.dataset.view === id
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// 指定した日付の記録を取得する
function recordForDate(key) {
  return records.find((record) => record.date === key);
}

// カレンダーを表示する
function renderCalendar() {
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();

  monthLabel.textContent = `${year}年${month + 1}月`;
  calendarGrid.innerHTML = "";

  // 月曜日始まりのカレンダーにする
  const firstWeekday =
    (new Date(year, month, 1).getDay() + 6) % 7;

  const daysInMonth =
    new Date(year, month + 1, 0).getDate();

  // 月初までの空白を作る
  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");

    blank.className = "calendar-day is-empty";
    blank.setAttribute("aria-hidden", "true");

    calendarGrid.append(blank);
  }

  // 各日付のボタンを作る
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    const record = recordForDate(key);

    const button = document.createElement("button");

    button.type = "button";
    button.className = "calendar-day";

    if (key === dateKey(now)) {
      button.classList.add("is-today");
    }

    if (key === selectedDate) {
      button.classList.add("is-selected");
    }

    button.setAttribute(
      "aria-label",
      `${month + 1}月${day}日${record ? "、記録あり" : ""}`
    );

    button.innerHTML = `
      <span class="day-number">${day}</span>
      ${
        record?.photo
          ? `<img class="day-thumb" src="${record.photo}" alt="">`
          : ""
      }
    `;

    button.addEventListener("click", () => {
      selectedDate = key;
      renderCalendar();

      if (record) {
        openDetail(record.id);
      } else {
        $("#memoryDate").value = key;

        showView("cameraView");

        $("#formMessage").textContent =
          "この日の記録はまだありません。写真を撮って残せます。";
      }
    });

    calendarGrid.append(button);
  }

  renderRecent();
}

// 最近の記録を表示する
function renderRecent() {
  const sorted = [...records].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  recordCount.textContent = `${records.length}件`;
  recentList.innerHTML = "";
  emptyState.hidden = records.length > 0;

  sorted.slice(0, 3).forEach((record) => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "memory-card";

    button.innerHTML = `
      ${
        record.photo
          ? `<img src="${record.photo}" alt="">`
          : ""
      }
      <span>
        <strong>${escapeText(formatDate(record.date))}</strong>
        <small>${escapeText(record.note || "メモはありません")}</small>
      </span>
    `;

    button.addEventListener("click", () => {
      openDetail(record.id);
    });

    recentList.append(button);
  });
}

// 記録の詳細を表示する
function openDetail(id) {
  const record = records.find((item) => item.id === id);

  if (!record) {
    $("#formMessage").textContent =
      "記録を表示できませんでした。もう一度読み込んでください。";
    return;
  }

  activeRecordId = id;

  $("#detailPhoto").src = record.photo;
  $("#detailTitle").textContent = "記録の詳細";
  $("#detailDate").textContent = formatDate(record.date);

  $("#detailScore").textContent = Number.isFinite(record.score)
    ? `${record.score}点`
    : "未計測";

  $("#detailNote").textContent =
    record.note || "一言メモはありません。";

  showView("detailView");
}

// MediaPipeの笑顔採点機能を準備する
async function setupFaceLandmarker() {
  if (faceLandmarker) return;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  faceLandmarker = await FaceLandmarker.createFromOptions(
    vision,
    {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
      },
      runningMode: "IMAGE",
      numFaces: 1,
      outputFaceBlendshapes: true
    }
  );
}

// カメラを停止する
function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  cameraStream = null;
  video.srcObject = null;
  video.hidden = true;
  cameraPlaceholder.hidden = false;

  captureButton.disabled = true;
  startCameraButton.disabled = false;

  cameraStatus.textContent = "カメラ停止中";
}

// カメラを起動する
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent =
      "このブラウザではカメラを利用できません";

    $("#formMessage").textContent =
      "カメラにはHTTPS、またはlocalhostでの起動が必要です。";

    return;
  }

  startCameraButton.disabled = true;
  cameraStatus.textContent = "笑顔採点の準備中...";
  $("#formMessage").textContent =
    "採点機能とカメラを準備しています。";

  try {
    // 先にMediaPipeを準備する
    await setupFaceLandmarker();

    // カメラを起動する
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });

    video.srcObject = cameraStream;
    video.hidden = false;
    cameraPlaceholder.hidden = true;

    await video.play();

    captureButton.disabled = false;
    cameraStatus.textContent = "カメラ起動中";

    // 前回のスコアや写真をリセットする
    const scoreInput = $("#smileScore");

    scoreInput.value = "";
    scoreInput.disabled = false;

    saveRecordButton.disabled = true;
    capturedPhoto = "";

    $("#formMessage").textContent =
      "笑顔を作って「写真を撮影」を押してください。撮影した写真を採点します。";
  } catch (error) {
    console.error("カメラの起動に失敗しました:", error);

    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => {
        track.stop();
      });
    }

    cameraStream = null;
    video.srcObject = null;
    video.hidden = true;
    cameraPlaceholder.hidden = false;

    captureButton.disabled = true;
    startCameraButton.disabled = false;

    cameraStatus.textContent =
      "カメラを起動できませんでした";

    $("#formMessage").textContent =
      "カメラの許可、インターネット接続、またはMediaPipeの読み込みを確認してください。";
  }
}

// 写真を撮影して笑顔を採点する
async function capturePhoto() {
  if (
    isCapturing ||
    !video.videoWidth ||
    !video.videoHeight ||
    !faceLandmarker
  ) {
    return;
  }

  isCapturing = true;
  captureButton.disabled = true;
  saveRecordButton.disabled = true;

  cameraStatus.textContent = "撮影・採点中...";
  $("#formMessage").textContent =
    "写真の笑顔を分析しています。";

  try {
    // カメラ映像をCanvasに描画する
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");

    // プレビューと同じ鏡写しにする
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height
    );
    context.restore();

    // 撮影した画像をMediaPipeで分析する
    const result = faceLandmarker.detect(canvas);

    // 顔を認識できなかった場合
    if (
      !result.faceLandmarks?.length ||
      !result.faceBlendshapes?.length
    ) {
      capturedPhoto = "";
      $("#smileScore").value = "";

      cameraStatus.textContent =
        "顔を認識できませんでした";

      $("#formMessage").textContent =
        "顔全体が映るようにして、もう一度撮影してください。";

      return;
    }

    // 左右の口角の笑顔スコアを取得する
    const categories = result.faceBlendshapes[0].categories;

    const smileLeft =
      categories.find(
        (item) => item.categoryName === "mouthSmileLeft"
      )?.score ?? 0;

    const smileRight =
      categories.find(
        (item) => item.categoryName === "mouthSmileRight"
      )?.score ?? 0;

    // 左右の平均を0〜100点に変換する
    const averageSmile = (smileLeft + smileRight) / 2;

    const score = Math.round(
      Math.min(100, Math.max(0, averageSmile * 100))
    );

    // 写真を保存用の形式にする
    capturedPhoto = canvas.toDataURL("image/jpeg", 0.86);

    // 採点結果を入力欄にセットする
    const scoreInput = $("#smileScore");

    scoreInput.disabled = false;
    scoreInput.value = String(score);

    // 選択中の日付を設定する
    $("#memoryDate").value =
      selectedDate || dateKey(new Date());

    // 保存ボタンを有効にする
    saveRecordButton.disabled = false;

    cameraStatus.textContent = "採点完了！";

    $("#formMessage").textContent = score >= 60
      ? `笑顔スコアは ${score} 点です。素敵な笑顔ですね！日付とメモを確認して保存してください。`
      : `笑顔スコアは ${score} 点です。日付とメモを確認して保存できます。`;
  } catch (error) {
    console.error("写真の撮影・採点に失敗しました:", error);

    capturedPhoto = "";
    $("#smileScore").value = "";

    cameraStatus.textContent = "採点に失敗しました";

    $("#formMessage").textContent =
      "採点できませんでした。もう一度撮影してください。";
  } finally {
    isCapturing = false;
    captureButton.disabled = !cameraStream;
  }
}

// 撮影した写真とスコアをリセットする
function resetCapture() {
  capturedPhoto = "";
  saveRecordButton.disabled = true;
  $("#smileScore").value = "";
  $("#formMessage").textContent = "";
}

// 記録を保存する
async function saveRecord(event) {
  event.preventDefault();

  if (!capturedPhoto) {
    $("#formMessage").textContent =
      "先に写真を撮影して採点してください。";
    return;
  }

  const date = $("#memoryDate").value;

  if (!date) {
    $("#formMessage").textContent =
      "日付を選んでください。";
    return;
  }

  // 同じ日付に複数保存しない
  if (recordForDate(date)) {
    $("#formMessage").textContent =
      "この日付にはすでに記録があります。別の日付を選んでください。";
    return;
  }

  const scoreValue = $("#smileScore").value;

  const score =
    scoreValue === "" ||
    scoreValue === "-" ||
    scoreValue === "_"
      ? null
      : Number(scoreValue);

  saveRecordButton.disabled = true;
  $("#formMessage").textContent = "保存しています...";

  try {
    // 撮影した画像データをBlobに変換する
    const response = await fetch(capturedPhoto);
    const imageBlob = await response.blob();

    // Supabaseに画像と日記を保存する
    await postDiary({
      date,
      comment: $("#memoryNote").value.trim(),
      smileScore: Number.isFinite(score) ? score : null,
      imageBlob,
      contentType: "image/jpeg"
    });

    selectedDate = date;

    shownMonth = new Date(
      parseDate(date).getFullYear(),
      parseDate(date).getMonth(),
      1
    );

    // Supabaseから記録を再取得する
    const refreshed = await loadSupabaseRecords();

    stopCamera();
    resetCapture();

    if (refreshed) {
      openDetail(date);
      $("#formMessage").textContent = "";
    } else {
      showView("calendarView");

      $("#formMessage").textContent =
        "保存は完了しましたが、一覧の更新に失敗しました。ページを再読み込みしてください。";
    }
  } catch (error) {
    console.error("日記の保存に失敗しました:", error);

    $("#formMessage").textContent =
      "保存に失敗しました。ログイン状態やSupabaseの設定を確認してください。";
  } finally {
    saveRecordButton.disabled = !capturedPhoto;
  }
}

// 記録を削除する
async function handleDeleteDiary() {
  if (!activeRecordId) return;

  const record = records.find(
    (item) => item.id === activeRecordId
  );

  if (!record) {
    alert("削除する日記が見つかりません。");
    return;
  }

  // 削除前に確認する
  const confirmed = confirm(
    `${record.date} の日記を削除しますか？\n写真も削除されます。`
  );

  if (!confirmed) return;

  deleteRecordButton.disabled = true;

  try {
    // Supabaseから日記と写真を削除する
    const result = await deleteDiary(record.date);

    // 削除済みの記録を画面から先に取り除く
    records = records.filter(
      (item) => item.id !== record.id
    );

    activeRecordId = null;

    renderCalendar();
    showView("calendarView");

    // Supabaseから最新データを再取得する
    const refreshed = await loadSupabaseRecords();

    if (!refreshed) {
      alert(
        "日記の削除処理は完了しましたが、一覧の更新に失敗しました。ページを再読み込みしてください。"
      );
      return;
    }

    if (!result.imageDeleted) {
      alert(
        "日記は削除しましたが、写真の削除に失敗しました。Supabase Storageを確認してください。"
      );
    }
  } catch (error) {
    console.error("日記の削除に失敗しました:", error);

    alert(
      "日記を削除できませんでした。\n通信状況やSupabaseの権限設定を確認してください。"
    );
  } finally {
    deleteRecordButton.disabled = false;
  }
}

// 前の月へ移動する
$("#prevMonth").addEventListener("click", () => {
  shownMonth = new Date(
    shownMonth.getFullYear(),
    shownMonth.getMonth() - 1,
    1
  );

  renderCalendar();
});

// 次の月へ移動する
$("#nextMonth").addEventListener("click", () => {
  shownMonth = new Date(
    shownMonth.getFullYear(),
    shownMonth.getMonth() + 1,
    1
  );

  renderCalendar();
});

// カメラ画面を開く
$("#openCameraButton").addEventListener("click", () => {
  selectedDate = dateKey(new Date());
  $("#memoryDate").value = selectedDate;

  showView("cameraView");
});

// カレンダーに戻る
$("#backToCalendar").addEventListener("click", () => {
  stopCamera();
  showView("calendarView");
});

// 詳細画面からカレンダーに戻る
$("#detailBackButton").addEventListener("click", () => {
  showView("calendarView");
});

// ナビゲーションの切り替え
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    if (item.dataset.view === "calendarView") {
      stopCamera();
      showView("calendarView");
    } else {
      showView("cameraView");
    }
  });
});

// ボタンやフォームのイベントを設定する
startCameraButton.addEventListener("click", startCamera);
captureButton.addEventListener("click", capturePhoto);
recordForm.addEventListener("submit", saveRecord);
deleteRecordButton.addEventListener("click", handleDeleteDiary);

// ページを離れるときにカメラを停止する
window.addEventListener("beforeunload", stopCamera);

// ページを開いたときにSupabaseから日記を取得する
$("#memoryDate").value = dateKey(now);
loadSupabaseRecords();

// 月ごとの写真をまとめたアルバムを作成する
downloadAlbumButton.addEventListener("click", async () => {
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();

  // 表示中の月に保存された記録を取得する
  const monthlyRecords = records
    .filter((record) => {
      const date = parseDate(record.date);

      return date.getFullYear() === year &&
        date.getMonth() === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (monthlyRecords.length === 0) {
    alert("この月には写真がありません。");
    return;
  }

  downloadAlbumButton.disabled = true;
  downloadAlbumButton.textContent = "アルバム作成中...";

  try {
    const photoWidth = 240;
    const photoHeight = 180;
    const columns = 3;
    const padding = 30;
    const gap = 20;
    const titleHeight = 80;
    const noteHeight = 50;

    const rows = Math.ceil(
      monthlyRecords.length / columns
    );

    const albumCanvas = document.createElement("canvas");
    const context = albumCanvas.getContext("2d");

    albumCanvas.width =
      padding * 2 +
      columns * photoWidth +
      (columns - 1) * gap;

    albumCanvas.height =
      titleHeight +
      padding +
      rows * (photoHeight + noteHeight) +
      (rows - 1) * gap +
      padding;

    // 背景
    context.fillStyle = "#f5f0e5";
    context.fillRect(
      0,
      0,
      albumCanvas.width,
      albumCanvas.height
    );

    // タイトル
    context.fillStyle = "#493f35";
    context.font = "bold 28px sans-serif";
    context.textAlign = "center";

    context.fillText(
      `${year}年${month + 1}月の笑顔アルバム`,
      albumCanvas.width / 2,
      45
    );

    // 写真を順番に配置する
    for (let i = 0; i < monthlyRecords.length; i++) {
      const record = monthlyRecords[i];

      const column = i % columns;
      const row = Math.floor(i / columns);

      const x = padding + column * (photoWidth + gap);
      const y =
        titleHeight +
        row * (photoHeight + noteHeight + gap);

      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = record.photo;
      });

      // 写真
      context.drawImage(
        img,
        x,
        y,
        photoWidth,
        photoHeight
      );

      // 日付
      context.fillStyle = "#493f35";
      context.font = "bold 14px sans-serif";
      context.textAlign = "left";

      context.fillText(
        record.date,
        x,
        y + photoHeight + 20
      );

      // メモ
      context.font = "12px sans-serif";

      const note = record.note || "メモなし";
      const shortNote = note.length > 25
        ? note.slice(0, 25) + "..."
        : note;

      context.fillText(
        shortNote,
        x,
        y + photoHeight + 42
      );
    }

    // PNG画像としてダウンロードする
    const link = document.createElement("a");

    link.download =
      `笑顔アルバム_${year}年${month + 1}月.png`;

    link.href = albumCanvas.toDataURL("image/png");
    link.click();
  } catch (error) {
    console.error("アルバムの作成に失敗しました:", error);

    alert(
      "アルバムを作成できませんでした。写真を確認してください。"
    );
  } finally {
    downloadAlbumButton.disabled = false;
    downloadAlbumButton.textContent = "アルバムを作る";
  }
});
