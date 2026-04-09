// script.js

/*
  SETUP:
  1. Get a YouTube Data API v3 key from https://console.cloud.google.com/
     - Create a project, enable "YouTube Data API v3", then create an API key.
  2. Paste it below into YOUTUBE_API_KEY.
  3. If your key has HTTP referrer restrictions, add your local dev URL
     (e.g. http://localhost:5500/*) or leave it unrestricted for testing.

  NOTE ON TRENDING:
  YouTube's `chart=mostPopular` endpoint maxes out at 50 results per request
  and does not reliably paginate. So we fetch 50 (not 100) and pick 2 at random.
  This is a platform limit, not a bug.

  If you leave the API key as the placeholder, the app will fall back to a
  small built-in sample set so you can still test the head-tilt interaction.
*/

const YOUTUBE_API_KEY = "YOUR_YOUTUBE_API_KEY";
const REGION_CODE = "US";
const REDIRECT_DELAY = 900;
const TILT_THRESHOLD = 10;
const HOLD_FRAMES_REQUIRED = 10;

// Fallback sample videos used when no API key is set or the API call fails.
// These are real, well-known YouTube IDs so the redirect still works.
const FALLBACK_VIDEOS = [
  {
    id: "dQw4w9WgXcQ",
    snippet: {
      title: "Rick Astley - Never Gonna Give You Up",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
        maxres: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg" }
      }
    },
    contentDetails: { duration: "PT3M33S" }
  },
  {
    id: "9bZkp7q19f0",
    snippet: {
      title: "PSY - GANGNAM STYLE",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg" },
        maxres: { url: "https://i.ytimg.com/vi/9bZkp7q19f0/maxresdefault.jpg" }
      }
    },
    contentDetails: { duration: "PT4M13S" }
  },
  {
    id: "kJQP7kiw5Fk",
    snippet: {
      title: "Luis Fonsi - Despacito ft. Daddy Yankee",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/kJQP7kiw5Fk/hqdefault.jpg" },
        maxres: { url: "https://i.ytimg.com/vi/kJQP7kiw5Fk/maxresdefault.jpg" }
      }
    },
    contentDetails: { duration: "PT4M42S" }
  },
  {
    id: "JGwWNGJdvx8",
    snippet: {
      title: "Ed Sheeran - Shape of You",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg" },
        maxres: { url: "https://i.ytimg.com/vi/JGwWNGJdvx8/maxresdefault.jpg" }
      }
    },
    contentDetails: { duration: "PT3M53S" }
  },
  {
    id: "RgKAFK5djSk",
    snippet: {
      title: "Wiz Khalifa - See You Again ft. Charlie Puth",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/RgKAFK5djSk/hqdefault.jpg" },
        maxres: { url: "https://i.ytimg.com/vi/RgKAFK5djSk/maxresdefault.jpg" }
      }
    },
    contentDetails: { duration: "PT3M57S" }
  },
  {
    id: "OPf0YbXqDm0",
    snippet: {
      title: "Mark Ronson - Uptown Funk ft. Bruno Mars",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/OPf0YbXqDm0/hqdefault.jpg" },
        maxres: { url: "https://i.ytimg.com/vi/OPf0YbXqDm0/maxresdefault.jpg" }
      }
    },
    contentDetails: { duration: "PT4M31S" }
  }
];

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
  clock.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
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

function hasValidApiKey() {
  return (
    typeof YOUTUBE_API_KEY === "string" &&
    YOUTUBE_API_KEY.length > 10 &&
    YOUTUBE_API_KEY !== "YOUR_YOUTUBE_API_KEY"
  );
}

async function fetchTrendingVideos() {
  // Single request — mostPopular returns up to 50 and does not paginate reliably.
  const params = new URLSearchParams({
    key: YOUTUBE_API_KEY,
    part: "snippet,contentDetails,status",
    chart: "mostPopular",
    maxResults: "50",
    regionCode: REGION_CODE
  });

  const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    // Surface the real API error message so you know if it's quota / referrer / bad key
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || "";
      console.error("YouTube API error:", errJson);
    } catch (_) {
      /* ignore */
    }
    throw new Error(`YouTube API ${response.status}${detail ? ` — ${detail}` : ""}`);
  }

  const data = await response.json();
  const valid = (data.items || []).filter((item) => {
    const embeddable = item.status?.embeddable !== false;
    const hasThumb =
      !!item.snippet?.thumbnails?.high?.url ||
      !!item.snippet?.thumbnails?.medium?.url;
    const hasTitle = !!item.snippet?.title;
    return embeddable && hasThumb && hasTitle;
  });

  if (valid.length < 2) {
    throw new Error("YouTube API returned fewer than 2 usable videos.");
  }

  return valid;
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
  if (picked.length < 2) throw new Error("Not enough videos to pick from.");
  return picked;
}

function showErrorState(message) {
  leftTitle.textContent = "Could not load videos";
  rightTitle.textContent = "Check browser console";
  leftDuration.textContent = "--:--";
  rightDuration.textContent = "--:--";
  leftThumb.removeAttribute("src");
  rightThumb.removeAttribute("src");
  instruction.textContent = message;
}

async function loadVideos() {
  // No key set at all → use fallback so first-run still demos. This is the ONLY
  // case that uses the sample videos.
  if (!hasValidApiKey()) {
    console.warn(
      "[YouTube This or That] No API key set. Paste your YouTube Data API v3 key " +
        "into YOUTUBE_API_KEY in script.js to fetch live trending videos."
    );
    setVideos(chooseRandomTwo(FALLBACK_VIDEOS));
    instruction.textContent =
      "⚠ No API key — showing sample videos. Add your key in script.js";
    return;
  }

  // Key is set → show the real error loudly instead of hiding behind fallbacks.
  try {
    instruction.textContent = "Loading trending videos...";
    const items = await fetchTrendingVideos();
    setVideos(chooseRandomTwo(items));
  } catch (error) {
    console.error("[YouTube This or That] API call failed:", error);
    showErrorState(`YouTube API failed: ${error.message}`);
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

// MediaPipe FaceMesh face oval landmarks — the outline of the face silhouette.
// Ordered so consecutive indices are neighbors around the oval, which lets us
// interpolate between them for a dense, clean outline.
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

// Number of sparkles inserted between each pair of oval landmarks.
// Higher = denser silhouette outline.
const POINTS_PER_SEGMENT = 4;

// Stable per-sparkle properties, keyed by position in the sparkle array.
// Seeded ONCE so size/rotation/twinkle don't re-randomize every frame —
// that's what was causing the shimmery trailing feel.
const SPARKLE_PROPS = [];
function getSparkleProps(i) {
  if (!SPARKLE_PROPS[i]) {
    // Deterministic-ish pseudo-random based on index so it stays consistent.
    const seed = Math.sin(i * 912.37) * 43758.5453;
    const rnd = seed - Math.floor(seed);
    const seed2 = Math.sin(i * 238.19) * 12543.219;
    const rnd2 = seed2 - Math.floor(seed2);
    SPARKLE_PROPS[i] = {
      // Mostly small with occasional bigger accents — reads as a clean outline.
      size: i % 7 === 0 ? 9 + rnd * 6 : 4 + rnd * 4,
      rotation: rnd2 * Math.PI * 2,
      twinkle: rnd * Math.PI * 2,
      alpha: i % 5 === 0 ? 0.95 : 0.6 + rnd2 * 0.3
    };
  }
  return SPARKLE_PROPS[i];
}

function seedSparkles(landmarks) {
  // Walk the oval and insert interpolated points between each pair.
  const points = [];
  for (let i = 0; i < FACE_OVAL.length; i += 1) {
    const a = landmarks[FACE_OVAL[i]];
    const b = landmarks[FACE_OVAL[(i + 1) % FACE_OVAL.length]];
    if (!a || !b) continue;
    const aScreen = getScreenPoint(a);
    const bScreen = getScreenPoint(b);
    for (let step = 0; step < POINTS_PER_SEGMENT; step += 1) {
      const t = step / POINTS_PER_SEGMENT;
      points.push({
        x: aScreen.x + (bScreen.x - aScreen.x) * t,
        y: aScreen.y + (bScreen.y - aScreen.y) * t
      });
    }
  }
  sparkleSeeds = points;
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
  // Hard clear — no motion-blur, no trailing. Sparkles represent the current
  // silhouette position only.
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!faceVisible || sparkleSeeds.length === 0) return;

  for (let i = 0; i < sparkleSeeds.length; i += 1) {
    const s = sparkleSeeds[i];
    const props = getSparkleProps(i);
    const pulse = 0.85 + Math.sin(timestamp * 0.003 + props.twinkle) * 0.15;
    drawStar(
      s.x,
      s.y,
      props.size * pulse,
      props.rotation,
      Math.min(1, props.alpha * pulse)
    );
  }
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

      const leftEyeOuter = landmarks[33];
      const rightEyeOuter = landmarks[263];

      // New silhouette: pass the full landmarks array — seedSparkles walks
      // the face oval and interpolates for a clean outline.
      seedSparkles(landmarks);

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
