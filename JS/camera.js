
import {
    FaceLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");
const messageElement = document.getElementById("resultMessage");

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
            "笑顔を作って「写真を撮影」を押してください";

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
                "顔全体が映るようにして、もう一度撮影してください。";
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

        switch (score) {
            case 100:
                messageElement.textContent ='神の領域';
                break;
            case 99:
            case 98:
            case 97:
            case 96:
            case 95:
                messageElement.textContent = '世界レベル';
                break;
            case 94:
            case 93:
            case 92:
            case 91:
            case 90:
                messageElement.textContent = 'その笑顔、世界救えます！';
                break;
            case 89:
            case 88:
            case 87:
            case 86:
            case 85:
                messageElement.textContent = '恥を捨てて！まだいける！！';
                break;  
            case 84:
            case 83:
            case 82:
            case 81:
            case 80:
                messageElement.textContent = '笑顔の才能あり';
                break;
            case 79:
            case 78:
            case 77:
            case 76:
            case 75:
                messageElement.textContent = '笑顔の天才か！';
                break;
            case 74:
            case 73:
            case 72:
            case 71:
            case 70:
                messageElement.textContent = 'いい笑顔！';
                break;
            case 69:
            case 68:
            case 67:
            case 66:
            case 65:
            
                messageElement.textContent = '一般的な笑顔ですな';
                break;
            case 64:
            case 63:
            case 62:
            case 61:
            case 60:
                messageElement.textContent = '平均点はこえた！知らんけど';
                break;
            case 59:
            case 58:
            case 57:
            case 56:
            case 55:
                messageElement.textContent = '悪くないけど何かが足りない！';
                break;
            case 54:
            case 53:
            case 52:
            case 51:
            case 50:
                messageElement.textContent ='もうちょっと頑張れるはず！';
                break;
            case 49:
            case 48:
            case 47:
            case 46:
            case 45:
                messageElement.textContent = '心から笑ってる？';
                break;
            case 44:
            case 43:
            case 42:
            case 41:
            case 40:
                messageElement.textContent = '笑顔あきらめた方がいいかも';
                break;
            case 39:
            case 38:
            case 37:
            case 36:
            case 35:
                messageElement.textContent = '笑顔の練習してこようかwww';
                break;
            case 34:
            case 33:
            case 32:
            case 31:
            case 30:
                messageElement.textContent = '寝起きの顔かな？';
                break;
            case 29:
            case 28:
            case 27:
            case 26:
            case 25:
                messageElement.textContent = '逆にこの点数出せる方がすごい';
                break;
            case 24:
            case 23:
            case 22:
            case 21:
            case 20:
                messageElement.textContent = '証明写真でも、もう少し笑うよ';
                break;
            case 19:
            case 18:
            case 17:
            case 16:
            case 15:
                messageElement.textContent = '笑顔って知ってますか？';
                break;
            case 14:
            case 13:
            case 12:
            case 11:
            case 10:
                messageElement.textContent = '笑顔の気配すら感じない';
                break;
            case 9:
            case 8:
            case 7:
            case 6:
            case 5:
                messageElement.textContent = 'カメラが可哀想';
                break;
            case 4:
            case 3:
            case 2:
            case 1:
            case 0:
                messageElement.textContent = 'ウシでも出来る笑顔🐄';
                break;
        }

    } catch (error) {
        console.error(error);
        statusElement.textContent = "採点に失敗しました";
        messageElement.textContent =
            "もう一度撮影して。";
    } finally {
        isCapturing = false;
        captureButton.disabled = false;
    }
}

startButton.addEventListener("click", startCamera);
captureButton.addEventListener("click", capturePhoto);
