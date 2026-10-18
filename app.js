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
const downloadAlbumButton = $("#downloadAlbumButton");

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

/* 現在表示している月の記録を、1枚のPNGアルバムにしてダウンロード */
async function downloadMonthlyAlbum() {
  const year = shownMonth.getFullYear();
  const month = shownMonth.getMonth();
  const monthlyRecords = records
    .filter(record => {
      const date = parseDate(record.date);
      return date.getFullYear() === year && date.getMonth() === month;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (monthlyRecords.length === 0) {
    alert("この月には記録がありません。写真を記録してからお試しください。");
    return;
  }

  downloadAlbumButton.disabled = true;
  const originalLabel = downloadAlbumButton.textContent;
  downloadAlbumButton.textContent = "アルバムを作成中…";

  try {
    const columns = 3;
    const margin = 56;
    const gap = 24;
    const cardWidth = 336;
    const cardHeight = 390;
    const headerHeight = 190;
    const rows = Math.ceil(monthlyRecords.length / columns);
    const width = margin * 2 + columns * cardWidth + (columns - 1) * gap;
    const height = headerHeight + margin + rows * cardHeight + Math.max(0, rows - 1) * gap + margin;

    const albumCanvas = document.createElement("canvas");
    albumCanvas.width = width;
    albumCanvas.height = height;
    const ctx = albumCanvas.getContext("2d");

    // 背景と見出し
    ctx.fillStyle = "#f5f0e5";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#352b20";
    ctx.textAlign = "center";
    ctx.font = "bold 42px 'Noto Sans JP', sans-serif";
    ctx.fillText(`${year}年${month + 1}月の笑顔アルバム`, width / 2, 76);
    ctx.fillStyle = "#887d6c";
    ctx.font = "20px 'Noto Sans JP', sans-serif";
    ctx.fillText(`今月の記録：${monthlyRecords.length}件`, width / 2, 120);
    ctx.strokeStyle = "#ded4c2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin, 150);
    ctx.lineTo(width - margin, 150);
    ctx.stroke();

    for (let index = 0; index < monthlyRecords.length; index++) {
      const record = monthlyRecords[index];
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + col * (cardWidth + gap);
      const y = headerHeight + row * (cardHeight + gap);

      // カード背景
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(x, y, cardWidth, cardHeight);
      ctx.strokeStyle = "#ded4c2";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      // 写真を読み込んでカードに配置
      const photo = await loadAlbumImage(record.photo);
      const photoX = x + 16;
      const photoY = y + 16;
      const photoW = cardWidth - 32;
      const photoH = 250;
      ctx.fillStyle = "#e9e2d4";
      ctx.fillRect(photoX, photoY, photoW, photoH);
      drawCoverImage(ctx, photo, photoX, photoY, photoW, photoH);

      // 日付
      ctx.textAlign = "left";
      ctx.fillStyle = "#5f6444";
      ctx.font = "bold 18px 'Noto Sans JP', sans-serif";
      ctx.fillText(formatDate(record.date), x + 18, y + 298, cardWidth - 36);

      // メモ。長い文章は最大2行に省略
      ctx.fillStyle = "#352b20";
      ctx.font = "17px 'Noto Sans JP', sans-serif";
      drawWrappedText(ctx, record.note || "一言メモはありません", x + 18, y + 330, cardWidth - 36, 26, 2);
    }

    const blob = await new Promise((resolve, reject) => {
      albumCanvas.toBlob(result => result ? resolve(result) : reject(new Error("画像を作成できませんでした")), "image/png");
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ご機嫌メーター_${year}年${String(month + 1).padStart(2, "0")}月_アルバム.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (error) {
    console.error(error);
    alert("アルバム画像の作成に失敗しました。写真データを確認して、もう一度お試しください。");
  } finally {
    downloadAlbumButton.disabled = false;
    downloadAlbumButton.textContent = originalLabel;
  }
}

function loadAlbumImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("写真を読み込めませんでした"));
    image.src = src;
  });
}
function drawCoverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.width - sourceWidth) / 2;
  const sourceY = (image.height - sourceHeight) / 2;
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}
function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  let line = "";
  const lines = [];
  for (const character of String(text)) {
    const testLine = line + character;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = character;
      if (lines.length === maxLines) break;
    } else {
      line = testLine;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && lines[lines.length - 1] !== line && lines[lines.length - 1]) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/[、。]$/, "") + "…";
  }
  lines.slice(0, maxLines).forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight, maxWidth));
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
downloadAlbumButton.addEventListener("click", downloadMonthlyAlbum);
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
