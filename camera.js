
import {
    FaceLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");
const messageElement = document.getElementById("message");

const startButton = document.getElementById("startButton");
const captureButton = document.getElementById("captureButton");

const resultElement = document.getElementById("result");
const photoElement = document.getElementById("photo");
const resultScoreElement = document.getElementById("resultScore");
const downloadButton = document.getElementById("downloadButton");

let faceLandmarker = null;
let cameraStream = null;
let isRunning = false;
let isCapturing = false;

// MediaPipeを準備する
async function setupFaceLandmarker() {
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

// カメラを起動する
async function startCamera() {
    startButton.disabled = true;
    statusElement.textContent = "準備しています...";

    try {
        if (!faceLandmarker) {
            await setupFaceLandmarker();
        }

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "user",
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        });

        video.srcObject = cameraStream;
        await video.play();

        isRunning = true;
        captureButton.disabled = false;

        statusElement.textContent = "撮影の準備ができました";
        messageElement.textContent =
            "笑顔を作って「写真を撮影」を押してね！";

    } catch (error) {
        console.error(error);
        statusElement.textContent = "カメラを起動できませんでした";
        messageElement.textContent =
            "localhostまたはHTTPSで開き、カメラを許可してください。";
        startButton.disabled = false;
    }
}

// 写真を撮影してから採点する
async function capturePhoto() {
    if (!isRunning || isCapturing || video.readyState < 2) {
        return;
    }

    isCapturing = true;
    captureButton.disabled = true;
    resultElement.hidden = true;
    statusElement.textContent = "撮影・採点中...";
    messageElement.textContent = "写真の笑顔を分析しています。";

    try {
        // カメラ映像から写真を作る
        const photoCanvas = document.createElement("canvas");
        photoCanvas.width = video.videoWidth;
        photoCanvas.height = video.videoHeight;

        const photoContext = photoCanvas.getContext("2d");

        // 画面と同じ鏡写しの写真にする
        photoContext.translate(photoCanvas.width, 0);
        photoContext.scale(-1, 1);
        photoContext.drawImage(
            video,
            0,
            0,
            photoCanvas.width,
            photoCanvas.height
        );

        // 撮影した写真そのものをMediaPipeで分析する
        const result = faceLandmarker.detect(photoCanvas);

        if (
            result.faceLandmarks.length === 0 ||
            result.faceBlendshapes.length === 0
        ) {
            statusElement.textContent = "顔を認識できませんでした";
            messageElement.textContent =
                "顔全体が映るようにして、もう一度撮影してね。";
            return;
        }

        const categories = result.faceBlendshapes[0].categories;

        const smileLeft = categories.find(
            item => item.categoryName === "mouthSmileLeft"
        )?.score ?? 0;

        const smileRight = categories.find(
            item => item.categoryName === "mouthSmileRight"
        )?.score ?? 0;

        const averageSmile = (smileLeft + smileRight) / 2;
        const score = Math.round(
            Math.min(100, Math.max(0, averageSmile * 100))
        );

        // 撮影した写真と採点結果を表示する
        const imageUrl = photoCanvas.toDataURL("image/png");

        photoElement.src = imageUrl;
        resultScoreElement.textContent =
            `今回の笑顔スコア：${score}点`;

        scoreElement.innerHTML = `${score}<span>点</span>`;

        downloadButton.href = imageUrl;
        resultElement.hidden = false;

        statusElement.textContent = "採点完了！";
        messageElement.textContent =
            score >= 60
                ? "素敵な笑顔だね！ ☕"
                : "次はもっと笑顔で撮影してみよう！";

    } catch (error) {
        console.error(error);
        statusElement.textContent = "採点に失敗しました";
        messageElement.textContent =
            "もう一度撮影してみてね。";
    } finally {
        isCapturing = false;
        captureButton.disabled = false;
    }
}

startButton.addEventListener("click", startCamera);
captureButton.addEventListener("click", capturePhoto);
