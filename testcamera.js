
import {
  FaceLandmarker,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs";

const video = document.getElementById("camera");
const scoreText = document.getElementById("score");
const ring = document.getElementById("faceRing");
const message = document.getElementById("message");
const placeholder = document.getElementById("placeholder");
const startButton = document.getElementById("startButton");
const resetButton = document.getElementById("resetButton");

let landmarker;
let stream;
let running = false;
let lastVideoTime = -1;
let smoothScore = 0;
let hasSavedPerfectSmile = false;

function updateScore(score) {
  const value = Math.round(score);
  scoreText.textContent = value;

  ring.style.setProperty("--progress", `${value * 3.6}deg`);

  if (value >= 100 && !hasSavedPerfectSmile) {
  hasSavedPerfectSmile = true;
  saveSmileScreenshot();
}

  if (value >= 80) {
    message.textContent = "最高の笑顔！その調子！ ✨";
  } else if (value >= 50) {
    message.textContent = "いい笑顔！もっと笑ってみよう！";
  } else if (value >= 20) {
    message.textContent = "いい感じ！口角を上げてみよう！";
  } else {
    message.textContent = "笑顔の準備はいい？";
  }
}

async function startCamera() {
  startButton.disabled = true;
  message.textContent = "顔認識モデルを読み込んでいます...";

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("カメラを使えません。Live Serverでページを開いてください。");
    }

    if (!landmarker) {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm"
      );

      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true
      });
    }

    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 640 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    placeholder.style.display = "none";
    running = true;
    startButton.textContent = "計測中";
    message.textContent = "カメラに向かって笑ってみよう！";

    requestAnimationFrame(detectSmile);
  } catch (error) {
    console.error(error);
    message.textContent =
      "起動できませんでした。カメラの許可とネット接続を確認してね。";
    startButton.disabled = false;
  }
}

function detectSmile() {
  if (!running) return;

  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;

    const result = landmarker.detectForVideo(
      video,
      performance.now()
    );

    if (result.faceBlendshapes?.length > 0) {
      const categories = result.faceBlendshapes[0].categories;

      const getScore = (name) =>
        categories.find(item => item.categoryName === name)?.score ?? 0;

      const leftSmile = getScore("mouthSmileLeft");
      const rightSmile = getScore("mouthSmileRight");

      // 左右の笑顔スコアから0〜100の目安を計算
      
const smile = (leftSmile + rightSmile) / 2;

const targetScore = Math.min(100, Math.round(smile * 160));

// 点数の急な変化を抑えて滑らかにする
smoothScore += (targetScore - smoothScore) * 0.25;
updateScore(smoothScore);

    } else {
      message.textContent = "顔が見つからないよ。正面を向いてね。";
    }
  }

  requestAnimationFrame(detectSmile);
}

function resetScore() {
  smoothScore = 0;
  hasSavedPerfectSmile = false;
  updateScore(0);
}


function saveSmileScreenshot() {
  if (video.readyState < 2) return;

  // カメラ映像を画像にする
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");

  // 画面と同じように左右反転して保存
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 点数を画像に表示
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "rgba(8, 13, 32, 0.8)";
  ctx.fillRect(0, 0, canvas.width, 75);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SMILE SCORE: 100", canvas.width / 2, 48);

  // PNG画像として保存
  canvas.toBlob((blob) => {
    if (!blob) {
      message.textContent = "画像の保存に失敗しました";
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `smile-100-${Date.now()}.png`;
    link.click();

    URL.revokeObjectURL(url);
    message.textContent = "🎉 100点！最高の笑顔を保存したよ！";
  }, "image/png");
}


startButton.addEventListener("click", startCamera);
resetButton.addEventListener("click", resetScore);

updateScore(0);
