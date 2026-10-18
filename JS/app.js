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

const now = new Date();
let shownMonth = new Date(now.getFullYear(), now.getMonth(), 1);
let selectedDate = dateKey(now);
let capturedPhoto = "";
let cameraStream = null;
let activeRecordId = null;
let startedAt = null;

// Demo records are stored in this browser only. Replace this layer with Supabase later.
const STORAGE_KEY = "smile-memory-demo-records";
let records = loadRecords();

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function persistRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}
function escapeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}
function formatDate(key) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(parseDate(key));
}
function showView(id) {
  views.forEach(view => view.classList.toggle("is-active", view.id === id));
  navItems.forEach(item => item.classList.toggle("is-current", item.dataset.view === id));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function recordForDate(key) {
  return records.find(record => record.date === key);
}
function renderCalendar() {
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();
  monthLabel.textContent = `${year}年${month + 1}月`;
  calendarGrid.innerHTML = "";
  // Convert Sunday-first JS index to Monday-first calendar columns.
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-day is-empty";
    blank.setAttribute("aria-hidden", "true");
    calendarGrid.append(blank);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month, day));
    const record = recordForDate(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    if (key === dateKey(now)) button.classList.add("is-today");
    if (key === selectedDate) button.classList.add("is-selected");
    button.setAttribute("aria-label", `${month + 1}月${day}日${record ? "、記録あり" : ""}`);
    button.innerHTML = `<span class="day-number">${day}</span>${record
      ? `<img class="day-thumb" src="${record.photo}" alt="" />`
      : ""}`;
    button.addEventListener("click", () => {
      selectedDate = key;
      renderCalendar();
      if (record) openDetail(record.id);
      else {
        $("#memoryDate").value = key;
        showView("cameraView");
        $("#formMessage").textContent = "この日の記録はまだありません。写真を撮って残せます。";
      }
    });
    calendarGrid.append(button);
  }
  renderRecent();
}
function renderRecent() {
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  recordCount.textContent = `${records.length}件`;
  recentList.innerHTML = "";
  emptyState.hidden = records.length > 0;
  sorted.slice(0, 3).forEach(record => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "memory-card";
    button.innerHTML = `<img src="${record.photo}" alt=""><span><strong>${escapeText(formatDate(record.date))}</strong><small>${escapeText(record.note || "メモはありません")}</small></span>`;
    button.addEventListener("click", () => openDetail(record.id));
    recentList.append(button);
  });
}
function openDetail(id) {
  const record = records.find(item => item.id === id);
  if (!record) return;
  activeRecordId = id;
  $("#detailPhoto").src = record.photo;
  $("#detailTitle").textContent = "記録の詳細";
  $("#detailDate").textContent = formatDate(record.date);
  $("#detailScore").textContent = Number.isFinite(record.score) ? `${record.score}%` : "未計測";
  $("#detailElapsed").textContent = Number.isFinite(record.elapsed) ? `${record.elapsed.toFixed(1)}秒` : "—";
  $("#detailNote").textContent = record.note || "一言メモはありません。";
  showView("detailView");
}
function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  video.srcObject = null;
  video.hidden = true;
  cameraPlaceholder.hidden = false;
  captureButton.disabled = true;
  startCameraButton.disabled = false;
  cameraStatus.textContent = "カメラ停止中";
}
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = "このブラウザではカメラを利用できません";
    $("#formMessage").textContent = "カメラにはHTTPS、またはlocalhostでの起動が必要です。";
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" }, audio: false
    });
    video.srcObject = cameraStream;
    video.hidden = false;
    cameraPlaceholder.hidden = true;
    await video.play();
    captureButton.disabled = false;
    startCameraButton.disabled = true;
    cameraStatus.textContent = "カメラ起動中";
    startedAt = performance.now();
    $("#formMessage").textContent = "撮影できます。笑顔スコアの自動計測はまだ接続していません。";
  } catch (error) {
    cameraStatus.textContent = "カメラを起動できませんでした";
    $("#formMessage").textContent = "ブラウザのカメラ使用許可を確認してください。";
    console.error(error);
  }
}
function capturePhoto() {
  if (!video.videoWidth || !video.videoHeight) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  // Mirror the captured selfie so it matches the preview.
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  capturedPhoto = canvas.toDataURL("image/jpeg", 0.86);
  $("#formMessage").textContent = "写真を撮影しました。日付と一言を確認して保存してください。";
  saveRecordButton.disabled = false;
  cameraStatus.textContent = "撮影済み";
  $("#memoryDate").value = selectedDate || dateKey(new Date());
}
function resetCapture() {
  capturedPhoto = "";
  saveRecordButton.disabled = true;
  $("#formMessage").textContent = "";
}
function saveRecord(event) {
  event.preventDefault();
  if (!capturedPhoto) {
    $("#formMessage").textContent = "先にカメラで写真を撮ってください。";
    return;
  }
  const date = $("#memoryDate").value;
  if (!date) {
    $("#formMessage").textContent = "日付を選んでください。";
    return;
  }
  const scoreValue = $("#smileScore").value;
  const score = scoreValue === "" || scoreValue === "—" ? null : Number(scoreValue);
  const elapsed = startedAt ? (performance.now() - startedAt) / 1000 : null;
  const record = {
    id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    date,
    photo: capturedPhoto,
    note: $("#memoryNote").value.trim(),
    score: Number.isFinite(score) ? score : null,
    elapsed: Number.isFinite(elapsed) ? elapsed : null,
    createdAt: new Date().toISOString()
  };
  // Keep one record per date in this simple prototype.
  records = records.filter(item => item.date !== date);
  records.push(record);
  persistRecords();
  selectedDate = date;
  shownMonth = new Date(parseDate(date).getFullYear(), parseDate(date).getMonth(), 1);
  resetCapture();
  renderCalendar();
  stopCamera();
  openDetail(record.id);
}
$("#prevMonth").addEventListener("click", () => {
  shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() - 1, 1);
  renderCalendar();
});
$("#nextMonth").addEventListener("click", () => {
  shownMonth = new Date(shownMonth.getFullYear(), shownMonth.getMonth() + 1, 1);
  renderCalendar();
});
$("#openCameraButton").addEventListener("click", () => {
  $("#memoryDate").value = dateKey(new Date());
  showView("cameraView");
});
$("#backToCalendar").addEventListener("click", () => { stopCamera(); showView("calendarView"); });
$("#detailBackButton").addEventListener("click", () => showView("calendarView"));
navItems.forEach(item => item.addEventListener("click", () => {
  if (item.dataset.view === "calendarView") { stopCamera(); showView("calendarView"); }
  else showView("cameraView");
}));
startCameraButton.addEventListener("click", startCamera);
captureButton.addEventListener("click", capturePhoto);
recordForm.addEventListener("submit", saveRecord);
$("#deleteRecordButton").addEventListener("click", () => {
  if (!activeRecordId) return;
  records = records.filter(item => item.id !== activeRecordId);
  persistRecords();
  activeRecordId = null;
  renderCalendar();
  showView("calendarView");
});
window.addEventListener("beforeunload", stopCamera);

$("#memoryDate").value = dateKey(now);
renderCalendar();

// 月ごとの写真をまとめたアルバムを作成する
const downloadAlbumButton = $("#downloadAlbumButton");

downloadAlbumButton.addEventListener("click", async () => {
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();

  // 表示中の月に保存された記録を取得
  const monthlyRecords = records
    .filter(record => {
      const date = parseDate(record.date);
      return date.getFullYear() === year && date.getMonth() === month;
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

    const rows = Math.ceil(monthlyRecords.length / columns);

    const albumCanvas = document.createElement("canvas");
    const context = albumCanvas.getContext("2d");

    albumCanvas.width =
      padding * 2 + columns * photoWidth + (columns - 1) * gap;

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

    // 写真を順番に配置
    for (let i = 0; i < monthlyRecords.length; i++) {
      const record = monthlyRecords[i];

      const column = i % columns;
      const row = Math.floor(i / columns);

      const x = padding + column * (photoWidth + gap);
      const y = titleHeight + row * (photoHeight + noteHeight + gap);

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
      const shortNote =
        note.length > 25 ? note.slice(0, 25) + "..." : note;

      context.fillText(
        shortNote,
        x,
        y + photoHeight + 42
      );
    }

    // PNG画像としてダウンロード
    const link = document.createElement("a");

    link.download =
      `笑顔アルバム_${year}年${month + 1}月.png`;

    link.href = albumCanvas.toDataURL("image/png");
    link.click();

  } catch (error) {
    console.error("アルバムの作成に失敗しました:", error);
    alert("アルバムを作成できませんでした。写真を確認してください。");
  } finally {
    downloadAlbumButton.disabled = false;
    downloadAlbumButton.textContent = "アルバムを作る";
  }
});