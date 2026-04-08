// script.js

/*
  Replace YOUR_YOUTUBE_API_KEY with your real YouTube Data API key.
  This version fetches up to 100 trending videos by requesting 2 pages of 50 each.
*/

const YOUTUBE_API_KEY = "YOUR_YOUTUBE_API_KEY";
const REGION_CODE = "US";
const MAX_TRENDING = 100;
const REDIRECT_DELAY = 900;
const TILT_THRESHOLD = 10;
const HOLD_FRAMES_REQUIRED = 10;

const webcam = document.getElementById("webcam");
const canvas = document.getElementById("sparkle-canvas");
const ctx = canvas.getContext("2d");

const leftCard = document.getElementById("leftCard");
const rightCard = document.getElementById("rightCard");

const leftThumb = document.getElementById("leftThumb");
const rightThumb = document.getElementById("rightThumb");

const leftTitle = document.getElementById("leftTitle");
const rightTitle = document.getElementById("rightTitle");

const leftDuration = document.getElementById("leftDuration");
const rightDuration = document.getElementById("rightDuration");

const instruction = document.getElementById("instruction");
const tiltDot = document.getElementById("tiltDot");
const clock = document.getElementById("clock");

let selectedVideos = { left: null, right: null };
let isRedirecting = false;
let currentTiltSide = null;
let stableFrames = 0;
let smoothedTilt = 0;
let facePoints = [];
let sparkleSeeds = [];
let faceVisible = false;

function updateClock() {
  const now = new Date();
  const formatted = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  clock.textContent = formatted;
}

setInterval(updateClock, 1000);
updateClock();

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function iso8601ToReadableDuration(iso) {
  if (!iso) return "--:--";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "--:--";

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function fetchTrendingPage(pageToken = "") {
  const params = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: "snippet,contentDetails,status",
    chart: "mostPopular",
    maxResults: "50",
    regionCode: REGION_CODE
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`YouTube API request failed: ${response.status}`);
  }

  return response.json();
}

async function fetchTopTrendingVideos() {
  const allItems = [];
  let nextPageToken = "";

  while (allItems.length < MAX_TRENDING) {
    const data = await fetchTrendingPage(nextPageToken);
    const valid = (data.items || []).filter((item) => {
      const embeddable = item.status?.embeddable !== false;
      const hasThumb = !!item.snippet?.thumbnails?.high?.url || !!item.snippet?.thumbnails?.medium?.url;
      const hasTitle = !!item.snippet?.title;
      return embeddable && hasThumb && hasTitle;
    });

    allItems.push(...valid);

    if (!data.nextPageToken || data.items?.length === 0) break;
    nextPageToken = data.nextPageToken;
  }

  return allItems.slice(0, MAX_TRENDING);
}

function getThumbnail(item) {
  return (
    item.snippet?.thumbnails?.maxres?.url ||
    item.snippet?.thumbnails?.standard?.url ||
    item.snippet?.thumbnails?.high?.url ||
    item.snippet?.thumbnails?.medium?.url ||
    item.snippet?.thumbnails?.default?.url ||
    ""
  );
}

function setVideos(videos) {
  selectedVideos.left = videos[0];
  selectedVideos.right = videos[1];

  leftThumb.src = getThumbnail(videos[0]);
  rightThumb.src = getThumbnail(videos[1]);

  leftTitle.textContent = videos[0].snippet.title;
  rightTitle.textContent = videos[1].snippet.title;

  leftDuration.textContent = iso8601ToReadableDuration(videos[0].contentDetails?.duration);
  rightDuration.textContent = iso8601ToReadableDuration(videos[1].contentDetails?.duration);

  instruction.textContent = "Tilt your head left or right to choose";
}

function chooseRandomTwo(items) {
  const picked = shuffle(items).slice(0, 2);
  if (picked.length < 2) {
    throw new Error("Not enough videos returned.");
  }
  return picked;
}

async function loadVideos() {
  try {
    instruction.textContent = "Loading trending videos...";
    const items = await fetchTopTrendingVideos();
    const two = chooseRandomTwo(items);
    setVideos(two);
  } catch (error) {
    console.error(error);
    leftTitle.textContent = "Could not load videos";
    rightTitle.textContent = "Please check your API key";
    leftDuration.textContent = "--:--";
    rightDuration.textContent = "--:--";
    instruction.textContent = "YouTube API failed. Add a valid API key in script.js";
  }
}

function setCardState(side = null) {
  leftCard.classList.remove("active", "dimmed", "selected");
  rightCard.classList.remove("active", "dimmed", "selected");

  if (side === "left") {
    leftCard.classList.add("active");
    rightCard.classList.add("dimmed");
  } else if (side === "right") {
    rightCard.classList.add("active");
    leftCard.classList.add("dimmed");
  }
}

function confirmSelection(side) {
  if (isRedirecting || !selectedVideos[side]) return;

  isRedirecting = true;
  setCardState(side);

  const chosenCard = side === "left" ? leftCard : rightCard;
  chosenCard.classList.add("selected");

  instruction.textContent = `Choosing ${side} video...`;

  setTimeout(() => {
    const videoId = selectedVideos[side].id;
    window.location.href = `https://www.youtube.com/watch?v=${videoId}`;
  }, REDIRECT_DELAY);
}

function mapTiltToMeter(value) {
  const clamped = Math.max(-25, Math.min(25, value));
  const percent = ((clamped + 25) / 50) * 100;
  tiltDot.style.left = `${percent}%`;
}

function evaluateTilt(rawTilt) {
  smoothedTilt = smoothedTilt * 0.75 + rawTilt * 0.25;
  mapTiltToMeter(smoothedTilt);

  let side = null;
  if (smoothedTilt > TILT_THRESHOLD) side = "right";
  if (smoothedTilt < -TILT_THRESHOLD) side = "left";

  if (side) {
    setCardState(side);
    instruction.textContent = `Hold your head ${side} to choose`;
  } else {
    setCardState(null);
    instruction.textContent = faceVisible
      ? "Tilt your head left or right to choose"
      : "Center your face in view";
  }

  if (side && side === currentTiltSide) {
    stableFrames += 1;
  } else if (side) {
    currentTiltSide = side;
    stableFrames = 1;
  } else {
    currentTiltSide = null;
    stableFrames = 0;
  }

  if (stableFrames >= HOLD_FRAMES_REQUIRED) {
    confirmSelection(side);
  }
}

function getScreenPoint(point) {
  return {
    x: (1 - point.x) * window.innerWidth,
    y: point.y * window.innerHeight
  };
}

function angleBetween(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

function seedSparkles(points) {
  sparkleSeeds = points.map((point, index) => {
    const p = getScreenPoint(point);
    return {
      x: p.x,
      y: p.y,
      size: 6 + Math.random() * 30,
      rotation: Math.random() * Math.PI * 2,
      twinkle: Math.random() * Math.PI * 2,
      alpha: index % 4 === 0 ? 0.85 : 0.35 + Math.random() * 0.45
    };
  });
}

function drawStar(x, y, radius, rotation, alpha) {
  const points = 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();

  for (let i = 0; i < points * 2; i += 1) {
    const angle = (Math.PI / points) * i;
    const r = i % 2 === 0 ? radius : radius * 0.22;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSparkles(timestamp) {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

  if (!faceVisible || sparkleSeeds.length === 0) return;

  for (let i = 0; i < sparkleSeeds.length; i += 1) {
    const s = sparkleSeeds[i];
    const pulse = 0.78 + Math.sin(timestamp * 0.003 + s.twinkle) * 0.28;
    const radius = s.size * pulse;

    drawStar(
      s.x,
      s.y,
      radius,
      s.rotation + timestamp * 0.0008,
      Math.min(1, s.alpha * pulse)
    );
  }

  const largeExtras = [
    sparkleSeeds[8],
    sparkleSeeds[36],
    sparkleSeeds[58],
    sparkleSeeds[92]
  ].filter(Boolean);

  largeExtras.forEach((s, idx) => {
    drawStar(
      s.x + (idx % 2 === 0 ? 46 : -36),
      s.y + (idx < 2 ? -60 : 72),
      36 + Math.sin(timestamp * 0.002 + idx) * 10,
      timestamp * 0.0004 + idx,
      0.92
    );
  });
}

function animate(timestamp) {
  drawSparkles(timestamp);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

async function startCameraAndTracking() {
  try {
    instruction.textContent = "Starting camera...";
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });

    webcam.srcObject = stream;
    await webcam.play();

    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    });

    faceMesh.onResults((results) => {
      const landmarks = results.multiFaceLandmarks?.[0];

      if (!landmarks) {
        faceVisible = false;
        facePoints = [];
        sparkleSeeds = [];
        evaluateTilt(0);
        return;
      }

      faceVisible = true;
      facePoints = landmarks;

      // eye corners
      const leftEyeOuter = landmarks[33];
      const rightEyeOuter = landmarks[263];

      // landmark subset for sparkle silhouette
      const sparkleIndices = [
        10, 67, 103, 109, 338, 297, 332, 284,
        54, 68, 71, 139, 127, 234, 93, 132,
        361, 323, 356, 454, 389, 251, 301, 298,
        152, 148, 176, 149, 150, 136, 172, 58,
        288, 397, 365, 379, 378, 400, 377,
        4, 6, 9, 197, 195, 5, 1, 2,
        61, 291, 13, 14, 78, 308, 82, 312,
        468, 473
      ]
        .map((i) => landmarks[i])
        .filter(Boolean);

      seedSparkles(sparkleIndices);

      const eyeAngle = angleBetween(leftEyeOuter, rightEyeOuter);
      evaluateTilt(eyeAngle);
    });

    const camera = new Camera(webcam, {
      onFrame: async () => {
        await faceMesh.send({ image: webcam });
      },
      width: 640,
      height: 480
    });

    camera.start();
    instruction.textContent = "Tilt your head left or right to choose";
  } catch (error) {
    console.error(error);
    instruction.textContent = "Camera access denied or unavailable";
  }
}

document.getElementById("soundToggle").addEventListener("click", () => {
  document.body.classList.toggle("sound-off");
});

(async function init() {
  await loadVideos();
  await startCameraAndTracking();
})();