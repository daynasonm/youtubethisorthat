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

const YOUTUBE_API_KEY = "AIzaSyCodorc6VuxgaNJ4_Rh5d-Hq6LmHFEp5LY";
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

const sessionStartTime = Date.now();

function updateClock() {
  const elapsedMs = Date.now() - sessionStartTime;
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  clock.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

// Preload a thumbnail URL and resolve true only if it actually loads.
// Guards against 404s, broken links, and YouTube's "this image isn't available"
// gray placeholder that sometimes comes back instead of the real thumbnail.
function preloadThumbnail(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(false);
      return;
    }
    const img = new Image();
    img.onload = () => {
      // YouTube's 404 placeholder is exactly 120x90. Reject it.
      if (img.naturalWidth <= 120 && img.naturalHeight <= 90) {
        resolve(false);
      } else {
        resolve(true);
      }
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// Shuffle the candidate pool and walk it in pairs, preloading each pair's
// thumbnails. Return the first pair where BOTH load successfully.
async function pickValidPair(items) {
  const pool = shuffle(items);
  for (let i = 0; i < pool.length - 1; i += 1) {
    const a = pool[i];
    const b = pool[i + 1];
    const [okA, okB] = await Promise.all([
      preloadThumbnail(getThumbnail(a)),
      preloadThumbnail(getThumbnail(b))
    ]);
    if (okA && okB) return [a, b];
  }
  throw new Error("No pair of videos with working thumbnails found.");
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
    const pair = await pickValidPair(items);
    setVideos(pair);
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
    // Open in new tab so the back button on the original tab still works
    // and so we don't get stuck in a redirect loop if the user returns
    // with their head still tilted.
    window.open(`https://www.youtube.com/watch?v=${videoId}`, "_blank");

    // Reset selection state so the user can immediately pick again.
    isRedirecting = false;
    stableFrames = 0;
    currentTiltSide = null;
    setCardState(null);
    instruction.textContent = "Tilt your head left or right to choose";
    // Reload fresh videos for the next round.
    loadVideos();
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

// Number of sparkles to scatter inside the face. ~22 reads as decorative
// without looking noisy.
const SPARKLE_COUNT = 45;

// Stable sparkle templates in face-local coordinates. Each has a (u, v)
// position in normalized face space where (0,0) is face center, u is
// horizontal (±1 = temple edge), v is vertical (±1 = forehead/chin edge).
// Generated once so sparkles keep their identity as the head moves.
const SPARKLE_TEMPLATES = [];
function ensureTemplates() {
  if (SPARKLE_TEMPLATES.length > 0) return;
  let i = 0;
  // Rejection sample inside an ellipse until we have SPARKLE_COUNT points.
  while (SPARKLE_TEMPLATES.length < SPARKLE_COUNT && i < 500) {
    // Deterministic pseudo-random seeded by i so templates are stable.
    const r1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const r2 = Math.abs(Math.sin(i * 78.233) * 43758.5453) % 1;
    const r3 = Math.abs(Math.sin(i * 37.719) * 43758.5453) % 1;
    const r4 = Math.abs(Math.sin(i * 93.145) * 43758.5453) % 1;
    i += 1;

    const u = (r1 - 0.5) * 2; // -1..1
    const v = (r2 - 0.5) * 2; // -1..1

    // Face is roughly an ellipse taller than wide. Accept points inside
    // a 0.85 × 1.1 ellipse so sparkles stay safely within the silhouette.
    if ((u / 0.95) ** 2 + (v / 1.2) ** 2 > 1) continue;

    // Three size tiers for clear hero/medium/small hierarchy.
    let size;
    if (SPARKLE_TEMPLATES.length % 5 === 0) {
    size = 36 + r3 * 18;
    } else if (SPARKLE_TEMPLATES.length % 2 === 0) {
    size = 20 + r3 * 12;
    } else {
    size = 10 + r3 * 8;
    }

    SPARKLE_TEMPLATES.push({
      u,
      v,
      size,
      rotation: r4 * Math.PI * 2,
      twinkle: r3 * Math.PI * 2,
      alpha: SPARKLE_TEMPLATES.length % 5 === 0 ? 1.0 : 0.75 + r4 * 0.25
    });
  }
}
ensureTemplates();

// Holds the frame-by-frame transformed sparkle positions (in screen coords).
// Rewritten every face-mesh frame by seedSparkles.
let sparkleFrame = [];

function seedSparkles(landmarks) {
  // Use a few stable landmarks to establish a face-local coordinate frame:
  //   10  = top of forehead
  //   152 = bottom of chin
  //   234 = left temple
  //   454 = right temple
  const top = landmarks[10];
  const bottom = landmarks[152];
  const leftTemple = landmarks[234];
  const rightTemple = landmarks[454];
  if (!top || !bottom || !leftTemple || !rightTemple) {
    sparkleFrame = [];
    return;
  }

  const topS = getScreenPoint(top);
  const bottomS = getScreenPoint(bottom);
  const leftS = getScreenPoint(leftTemple);
  const rightS = getScreenPoint(rightTemple);

  // Face center = midpoint of the vertical axis (forehead → chin)
  const cx = (topS.x + bottomS.x) / 2;
  const cy = (topS.y + bottomS.y) / 2;

  // Half-extents of the face-local coordinate system
  const halfWidth = Math.hypot(rightS.x - leftS.x, rightS.y - leftS.y) / 2;
  const halfHeight = Math.hypot(bottomS.x - topS.x, bottomS.y - topS.y) / 2;

  // Vertical-axis rotation (forehead-to-chin direction)
  const vertAngle = Math.atan2(bottomS.y - topS.y, bottomS.x - topS.x) - Math.PI / 2;
  const cos = Math.cos(vertAngle);
  const sin = Math.sin(vertAngle);

  // Transform each template from face-local (u, v) to screen (x, y),
  // keeping the template's stable size/rotation/alpha/twinkle.
  sparkleFrame = SPARKLE_TEMPLATES.map((t) => {
    // Scale by face half-extents
    const localX = t.u * halfWidth;
    const localY = t.v * halfHeight;
    // Rotate by face tilt
    const rx = localX * cos - localY * sin;
    const ry = localX * sin + localY * cos;
    return {
      x: cx + rx,
      y: cy + ry,
      size: t.size,
      rotation: t.rotation + vertAngle,
      twinkle: t.twinkle,
      alpha: t.alpha
    };
  });
}

function drawStar(x, y, radius, rotation, alpha) {
  // Sharp 4-point sparkle (✦). Two pairs of long thin points with a very
  // pinched middle — inner radius is 10% of outer so the points read as
  // actual spikes, not a round blob.
  const spikes = 4;
  const inner = radius * 0.1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();

  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const r = i % 2 === 0 ? radius : inner;
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
  // Hard clear — no motion-blur, no trailing.
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (!faceVisible || sparkleFrame.length === 0) return;

  for (let i = 0; i < sparkleFrame.length; i += 1) {
    const s = sparkleFrame[i];
    const pulse = 0.85 + Math.sin(timestamp * 0.003 + s.twinkle) * 0.15;
    drawStar(
      s.x,
      s.y,
      s.size * pulse,
      s.rotation,
      Math.min(1, s.alpha * pulse)
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
        sparkleFrame = [];
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

const soundToggle = document.getElementById("soundToggle");
const soundIconImg = document.getElementById("soundIconImg");

let soundOn = true;

soundToggle.addEventListener("click", () => {
  soundOn = !soundOn;
  soundIconImg.src = soundOn
    ? "images/soundonicon.svg"
    : "images/soundofficon.svg";
});

const refreshPageBtn = document.getElementById("refreshPageBtn");

if (refreshPageBtn) {
  refreshPageBtn.addEventListener("click", () => {
    window.location.reload();
  });
}

const screenshotBtn = document.getElementById("screenshotBtn");

if (screenshotBtn) {
  screenshotBtn.addEventListener("click", async () => {
    try {
      const shotCanvas = await html2canvas(document.body, {
        backgroundColor: null,
        useCORS: true,
        scale: 2
      });

      const link = document.createElement("a");
      link.href = shotCanvas.toDataURL("image/png");
      link.download = "youtube-this-or-that.png";
      link.click();
    } catch (error) {
      console.error("Screenshot failed:", error);
    }
  });
}
