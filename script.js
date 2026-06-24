const GAME_SECONDS = 180;
const PANEL_KEYS = ["a", "s", "d", "f"];
const PANEL_LABELS = ["A", "S", "D", "F"];
const PANEL_SCORE_UNLOCKS = [50, 150, 300];
const VIEW_WORLD_HEIGHT = 780;
const FLOOR_WORLD_Y = 690;
const CAMERA_CENTER_START_HEIGHT = 300;
const FURNITURE_WIDTH_SCALE = 0.86;
const MILESTONE_STEP = 50;

const FURNITURE_TIERS = [
  [
    { name: "Grand Piano", kind: "piano", w: 0.44, h: 72, color: "#26384d", accent: "#e8d8b6" },
    { name: "Bed", kind: "bed", w: 0.46, h: 70, color: "#d86b4f", accent: "#f2c9b8" },
    { name: "Sofa", kind: "sofa", w: 0.43, h: 68, color: "#5e9f78", accent: "#dbead7" }
  ],
  [
    { name: "Cabinet", kind: "cabinet", w: 0.39, h: 74, color: "#9a6b4f", accent: "#f4cf86" },
    { name: "Desk", kind: "desk", w: 0.4, h: 62, color: "#c2844d", accent: "#ffe1a8" },
    { name: "Bookshelf", kind: "shelf", w: 0.37, h: 78, color: "#7b6d8d", accent: "#f0d88a" }
  ],
  [
    { name: "Chair", kind: "chair", w: 0.32, h: 60, color: "#e8b84f", accent: "#7b5c32" },
    { name: "TV", kind: "tv", w: 0.32, h: 54, color: "#303947", accent: "#9bd4e8" },
    { name: "Drawer", kind: "drawer", w: 0.32, h: 66, color: "#b0725a", accent: "#f2c45c" }
  ],
  [
    { name: "Lamp", kind: "lamp", w: 0.27, h: 58, color: "#e6a64f", accent: "#fff0a8" },
    { name: "Speaker", kind: "speaker", w: 0.27, h: 62, color: "#35495c", accent: "#88a5b8" },
    { name: "Stool", kind: "stool", w: 0.27, h: 48, color: "#8f6d54", accent: "#d8b98f" }
  ],
  [
    { name: "Fish Bowl", kind: "fish", w: 0.24, h: 46, color: "#56b5d8", accent: "#f28f3b" },
    { name: "Plant", kind: "plant", w: 0.24, h: 58, color: "#5e9f78", accent: "#c46a4a" },
    { name: "Clock", kind: "clock", w: 0.23, h: 48, color: "#f1d37a", accent: "#334155" }
  ],
  [
    { name: "Book Stack", kind: "books", w: 0.21, h: 42, color: "#7b6d8d", accent: "#e8b84f" },
    { name: "Vase", kind: "vase", w: 0.2, h: 52, color: "#7ab6a2", accent: "#f0b7a4" },
    { name: "Radio", kind: "radio", w: 0.21, h: 44, color: "#cf7d5c", accent: "#ffe1a8" }
  ],
  [
    { name: "Mug", kind: "mug", w: 0.18, h: 36, color: "#ffffff", accent: "#56b5d8" },
    { name: "Tiny Pot", kind: "tinyPlant", w: 0.18, h: 44, color: "#62a86d", accent: "#c46a4a" },
    { name: "Toy Block", kind: "block", w: 0.18, h: 40, color: "#e85d75", accent: "#ffd166" }
  ]
];

const $ = (selector) => document.querySelector(selector);

const canvas = $("#game-canvas");
const ctx = canvas.getContext("2d");
const startScreen = $("#start-screen");
const playScreen = $("#play-screen");
const resultScreen = $("#result-screen");
const keyStrip = $("#key-strip");
const scoreLabel = $("#score-label");
const timeLabel = $("#time-label");
const bestScoreLabel = $("#best-score");
const toast = $("#toast");
const battleLayout = $("#battle-layout");
const furnitureAssets = buildFurnitureAssets();

let animationId = 0;
let lastTime = 0;
let state = null;
let bestScore = Number(localStorage.getItem("riseRiseBest") || 0);
let audioCtx = null;
let bgmTimer = null;
let bgmStep = 0;
let bgmGain = null;

bestScoreLabel.textContent = formatMeters(bestScore);
applySharedStart();

function makePanel(index, ownerName, isHuman) {
  return {
    index,
    ownerName,
    isHuman,
    key: PANEL_KEYS[index],
    label: PANEL_LABELS[index],
    active: index === 0,
    stack: [],
    scraps: [],
    topY: 0,
    score: 0,
    water: 0,
    misses: 0,
    camera: 0,
    piece: null,
    nextDrop: 0.8 + Math.random() * 1.2,
    damageFlash: 0,
    milestoneFlash: 0,
    splitFlash: index === 0 ? 0 : 1,
    nextMilestone: MILESTONE_STEP
  };
}

function makePlayer(id, name, isHuman) {
  return {
    id,
    name,
    isHuman,
    panels: PANEL_KEYS.map((_, index) => makePanel(index, name, isHuman)),
    score: 0
  };
}

function startGame() {
  cancelAnimationFrame(animationId);
  const players = [makePlayer(1, "나", true)];

  state = {
    running: true,
    players,
    playerCount: 1,
    roomCode: "",
    startedAt: performance.now(),
    elapsed: 0,
    lastShareScore: 0,
    endReason: "",
    rivalCanvases: [],
    activePanelCount: 1,
    previousActivePanelCount: 1,
    splitTransition: 1
  };

  ensureAudio();
  playSound("start");
  startBgm();
  showScreen(playScreen);
  setupRivals();
  updateKeyStrip();
  lastTime = performance.now();
  animationId = requestAnimationFrame(loop);
}

function loop(now) {
  if (!state || !state.running) return;
  const dt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;
  state.elapsed = (now - state.startedAt) / 1000;

  updateGame(dt);
  drawMain();
  drawRivals();
  updateHud();

  if (state.elapsed >= GAME_SECONDS) {
    endGame();
    return;
  }

  animationId = requestAnimationFrame(loop);
}

function updateGame(dt) {
  const difficulty = getDifficulty();
  const activeCount = getActivePanelCount();

  if (activeCount !== state.activePanelCount) {
    state.previousActivePanelCount = state.activePanelCount;
    state.activePanelCount = activeCount;
    state.splitTransition = 0;
    state.players.forEach((player) => {
      player.panels.forEach((panel, index) => {
        if (index < activeCount && index >= state.previousActivePanelCount) {
          panel.splitFlash = 1;
          panel.water = Math.min(panel.water, 34);
        }
      });
    });
  }

  state.splitTransition = Math.min(1, state.splitTransition + dt * 1.65);

  for (const player of state.players) {
    player.panels.forEach((panel, index) => {
      panel.active = index < state.activePanelCount;
      panel.damageFlash = Math.max(0, panel.damageFlash - dt * 2.7);
      panel.milestoneFlash = Math.max(0, panel.milestoneFlash - dt * 1.15);
      panel.splitFlash = Math.max(0, panel.splitFlash - dt * 1.3);
      if (!panel.active) return;

      updatePanelCamera(panel, dt);
      const heightPressure = getHeightPressure(panel);
      panel.water += dt * (4.4 + difficulty * 6.6 + heightPressure * 17);
      updateScraps(panel, dt);
      if (!panel.piece) spawnPiece(panel);
      updatePiece(panel, dt, difficulty);

      if (!panel.isHuman) updateAiPanel(panel, dt, difficulty);
    });

    player.score = player.panels.reduce((sum, panel) => sum + panel.score, 0);
  }

  if (isHumanDrowned()) {
    state.endReason = "water";
    endGame();
  }
}

function updatePiece(panel, dt, difficulty) {
  const piece = panel.piece;
  if (!piece) return;

  if (piece.dropping) {
    piece.vy += 1450 * dt;
    piece.y += piece.vy * dt;
    const landingY = getLandingY(panel);
    if (piece.y + piece.h >= landingY) {
      piece.y = landingY - piece.h;
      placePiece(panel, piece);
    }
    return;
  }

  piece.x += piece.dir * piece.speed * dt;
  const left = piece.margin;
  const right = 1 - piece.margin;
  if (piece.x < left || piece.x > right) {
    piece.x = Math.max(left, Math.min(right, piece.x));
    piece.dir *= -1;
  }
}

function updateAiPanel(panel, dt, difficulty) {
  if (!panel.piece || panel.piece.dropping) return;
  panel.nextDrop -= dt;
  if (panel.nextDrop > 0) return;

  const target = getTargetX(panel);
  const distance = Math.abs(panel.piece.x - target);
  const accuracy = Math.max(0.055, 0.17 - difficulty * 0.03 - getHeightPressure(panel) * 0.025);
  if (distance < accuracy || panel.nextDrop <= -0.65) {
    panel.piece.dropping = true;
    panel.piece.vy = 180;
    panel.nextDrop = 0.75 + Math.random() * 1.1;
  }
}

function updateScraps(panel, dt) {
  panel.scraps = panel.scraps.filter((scrap) => {
    scrap.y += scrap.vy * dt;
    scrap.vy += 900 * dt;
    scrap.rotation += scrap.spin * dt;
    scrap.life -= dt;
    return scrap.life > 0;
  });
}

function spawnPiece(panel) {
  const progress = Math.min(1, state.elapsed / GAME_SECONDS);
  const tierIndex = Math.min(FURNITURE_TIERS.length - 1, Math.floor(progress * FURNITURE_TIERS.length));
  const options = FURNITURE_TIERS[tierIndex];
  const base = options[Math.floor(Math.random() * options.length)];
  const asset = furnitureAssets.get(base.kind);
  const sizeShrink = 1 - progress * 0.16;
  const pieceWidth = base.w * sizeShrink * FURNITURE_WIDTH_SCALE;
  const heightPressure = getHeightPressure(panel);

  panel.piece = {
    ...base,
    asset,
    tierIndex,
    w: pieceWidth,
    originalW: pieceWidth,
    h: base.h * sizeShrink,
    x: Math.random() > 0.5 ? 0.24 : 0.76,
    y: 56,
    dir: Math.random() > 0.5 ? 1 : -1,
    speed: 0.16 + getDifficulty() * 0.22 + heightPressure * 0.38,
    margin: pieceWidth / 2 + 0.03,
    dropping: false,
    vy: 0
  };
}

function placePiece(panel, piece) {
  if (panel.stack.length === 0) {
    addStackItem(panel, piece, piece.x, piece.w);
    panel.piece = null;
    playSound("place");
    return;
  }

  const top = panel.stack[panel.stack.length - 1];
  const pieceLeft = piece.x - piece.w / 2;
  const pieceRight = piece.x + piece.w / 2;
  const topLeft = top.x - top.w / 2;
  const topRight = top.x + top.w / 2;
  const overlapWidth = Math.min(pieceRight, topRight) - Math.max(pieceLeft, topLeft);
  const overlapRatio = overlapWidth / Math.min(piece.w, top.w);
  const centerDistance = Math.abs(piece.x - top.x);
  const maxCenterDistance = (piece.w + top.w) * 0.38;

  if (overlapWidth <= 0 || overlapRatio < 0.24 || centerDistance > maxCenterDistance) {
    addScrap(panel, piece, piece.x, piece.w);
    panel.misses += 1;
    panel.score = Math.max(0, panel.score - 1.2);
    panel.damageFlash = 1;
    panel.piece = null;
    playSound("miss");
    return;
  }

  const overlapLeft = Math.max(pieceLeft, topLeft);
  const overlapRight = Math.min(pieceRight, topRight);
  const settledX = piece.x * 0.72 + ((overlapLeft + overlapRight) / 2) * 0.28;
  addStackItem(panel, piece, settledX, piece.w);
  playSound("place");
  panel.piece = null;
}

function addStackItem(panel, piece, x, w) {
  panel.stack.push({
    x,
    w,
    h: piece.h,
    asset: piece.asset,
    kind: piece.kind,
    color: piece.color,
    accent: piece.accent,
    name: piece.name,
    tierIndex: piece.tierIndex
  });
  panel.topY += piece.h;
  panel.score += piece.h / 10;
  checkMilestone(panel);
}

function checkMilestone(panel) {
  if (!panel.isHuman) return;

  let reached = false;
  while (panel.score >= panel.nextMilestone) {
    panel.nextMilestone += MILESTONE_STEP;
    reached = true;
  }

  if (!reached) return;
  panel.milestoneFlash = 1;
  playSound("milestone");
  showToast(`${formatMeters(panel.score)} 돌파!`);
}

function addScrap(panel, piece, x, w) {
  panel.scraps.push({
    x,
    w,
    h: piece.h,
    y: getLandingY(panel) - piece.h,
    asset: piece.asset,
    kind: piece.kind,
    color: piece.color,
    accent: piece.accent,
    name: piece.name,
    tierIndex: piece.tierIndex,
    vy: 140 + Math.random() * 80,
    rotation: 0,
    spin: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random() * 1.4),
    life: 1.4
  });
}

function getTargetX(panel) {
  const top = panel.stack[panel.stack.length - 1];
  return top ? top.x : 0.5;
}

function getLandingY(panel) {
  const camera = getCamera(panel);
  return FLOOR_WORLD_Y - (panel.topY - camera);
}

function updatePanelCamera(panel, dt) {
  const target = getCameraTarget(panel);
  const current = Number.isFinite(panel.camera) ? panel.camera : target;
  const next = current + (target - current) * Math.min(1, dt * 7.5);
  panel.camera = Math.abs(target - next) < 0.2 ? target : next;
}

function getCamera(panel) {
  return Number.isFinite(panel.camera) ? panel.camera : getCameraTarget(panel);
}

function getCameraTarget(panel) {
  return Math.max(0, panel.topY - CAMERA_CENTER_START_HEIGHT);
}

function getDifficulty() {
  return Math.min(1, state.elapsed / GAME_SECONDS);
}

function getHeightPressure(panel) {
  const normalized = Math.min(1, panel.topY / 1050);
  return Math.pow(normalized, 1.35);
}

function isHumanDrowned() {
  const human = state.players[0];
  return human.panels.some((panel) => {
    if (!panel.active) return false;
    if (panel.stack.length === 0) return panel.water > 90;
    return panel.water >= panel.topY - 2;
  });
}

function getActivePanelCount() {
  const score = state?.players?.[0]?.score || 0;
  return 1 + PANEL_SCORE_UNLOCKS.reduce((count, unlock) => count + (score >= unlock ? 1 : 0), 0);
}

function dropHumanPanel(index) {
  if (!state || !state.running) return;
  const panel = state.players[0].panels[index];
  if (!panel || !panel.active || !panel.piece || panel.piece.dropping) return;
  ensureAudio();
  playSound("drop");
  panel.piece.dropping = true;
  panel.piece.vy = 160;
}

function drawMain() {
  updateCanvasResolution(canvas);
  drawPlayer(ctx, canvas.width, canvas.height, state.players[0], true);
}

function drawRivals() {
  state.rivalCanvases.forEach(({ canvas: rivalCanvas, player }) => {
    updateCanvasResolution(rivalCanvas);
    const rivalCtx = rivalCanvas.getContext("2d");
    drawPlayer(rivalCtx, rivalCanvas.width, rivalCanvas.height, player, false);
  });
  document.querySelectorAll("[data-rival-score]").forEach((node) => {
    const player = state.players.find((entry) => entry.id === Number(node.dataset.rivalScore));
    if (player) node.textContent = formatMeters(player.score);
  });
}

function updateCanvasResolution(targetCanvas) {
  const rect = targetCanvas.getBoundingClientRect();
  const ratio = Math.min(2.5, window.devicePixelRatio || 1);
  const nextWidth = Math.max(1, Math.round(rect.width * ratio));
  const nextHeight = Math.max(1, Math.round(rect.height * ratio));
  if (targetCanvas.width !== nextWidth || targetCanvas.height !== nextHeight) {
    targetCanvas.width = nextWidth;
    targetCanvas.height = nextHeight;
  }
}

function drawPlayer(drawCtx, width, height, player, detailed) {
  drawCtx.imageSmoothingEnabled = true;
  drawCtx.imageSmoothingQuality = "high";
  drawCtx.clearRect(0, 0, width, height);
  const count = Math.max(1, detailed ? state.activePanelCount : getActivePanelCount());
  const activePanels = player.panels.slice(0, count);
  const splitEase = easeOutCubic(state?.splitTransition ?? 1);
  const baseGap = Math.min(detailed ? 10 : 3, Math.max(0, (width - count) / Math.max(1, count - 1)));
  const gap = count <= 1 ? 0 : baseGap * splitEase;
  const panelWidth = Math.max(1, (width - gap * (count - 1)) / count);

  activePanels.forEach((panel, visibleIndex) => {
    const x = visibleIndex * (panelWidth + gap);
    drawPanel(drawCtx, panel, x, 0, panelWidth, height, detailed, count);
  });
}

function drawPanel(drawCtx, panel, x, y, width, height, detailed, panelCount) {
  drawCtx.save();
  drawCtx.translate(x, y);

  const scale = height / VIEW_WORLD_HEIGHT;
  const furnitureDraw = getFurnitureDrawScale(width, height, panelCount);
  const furnitureScale = scale * furnitureDraw.height;
  const camera = getCamera(panel);
  const visualCamera = getVisualCamera(panel, furnitureDraw.height);
  const floorY = (FLOOR_WORLD_Y + visualCamera) * scale;
  const waterHeight = Math.max(0, Math.min(height, (panel.water * furnitureDraw.height - visualCamera) * scale));

  drawBackground(drawCtx, width, height, visualCamera);
  drawSpeedLines(drawCtx, width, height, panel, visualCamera, scale);

  drawCtx.fillStyle = "#8f7b65";
  drawCtx.fillRect(0, floorY, width, Math.max(0, height - floorY));
  drawCtx.fillStyle = "#6f5f50";
  drawCtx.fillRect(0, floorY, width, 8 * scale);

  let stackY = floorY;
  panel.stack.forEach((item) => {
    const itemW = item.w * width * furnitureDraw.width;
    const itemH = item.h * furnitureScale;
    const itemX = getVisualFurnitureCenterX(item.x, width, itemW, furnitureDraw.motion) - itemW / 2;
    stackY -= itemH;
    if (stackY < height && stackY + itemH > -48 * scale) {
      drawFurniture(drawCtx, item, itemX, stackY, itemW, itemH);
    }
  });

  panel.scraps.forEach((scrap) => {
    const scrapW = scrap.w * width * furnitureDraw.width;
    const scrapH = scrap.h * furnitureScale;
    const screenX = getVisualFurnitureCenterX(scrap.x, width, scrapW, furnitureDraw.motion);
    const screenY = (scrap.y + scrap.h) * scale - scrapH;
    drawCtx.save();
    drawCtx.translate(screenX, screenY + scrapH / 2);
    drawCtx.rotate(scrap.rotation);
    drawFurniture(drawCtx, scrap, -scrapW / 2, -scrapH / 2, scrapW, scrapH);
    drawCtx.restore();
  });

  if (panel.piece) {
    const piece = panel.piece;
    const pieceW = piece.w * width * furnitureDraw.width;
    const pieceH = piece.h * furnitureScale;
    const pieceX = getVisualFurnitureCenterX(piece.x, width, pieceW, furnitureDraw.motion) - pieceW / 2;
    const pieceY = piece.dropping ? (piece.y + piece.h) * scale - pieceH : piece.y * scale;
    drawFurniture(drawCtx, piece, pieceX, pieceY, pieceW, pieceH);
  }

  drawWater(drawCtx, width, height, waterHeight, scale);
  drawDamageFlash(drawCtx, panel, width, height);
  drawMilestoneEffect(drawCtx, panel, width, height, scale);
  drawSplitFlash(drawCtx, panel, width, height);
  drawPanelHud(drawCtx, panel, width, height, scale, detailed, visualCamera, furnitureDraw.height);

  drawCtx.restore();
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);
}

function getFurnitureDrawScale(width, height, panelCount) {
  if (panelCount <= 1) return { width: 1, height: 1, motion: 1 };

  const referenceAspect = 0.82;
  const panelAspect = width / Math.max(1, height);
  const aspectRatio = Math.max(0.42, Math.min(1, panelAspect / referenceAspect));
  const heightScale = Math.max(0.34, Math.min(0.78, aspectRatio * 0.88));
  const widthScale = Math.max(0.82, Math.min(0.96, 0.94 - (1 - heightScale) * 0.12));
  const motionScale = Math.max(1, Math.min(1.42, 1 + (1 - aspectRatio) * 0.56));

  return {
    width: widthScale,
    height: heightScale,
    motion: motionScale
  };
}

function getVisualFurnitureCenterX(normalizedX, width, itemWidth, motionScale) {
  const center = 0.5 + (normalizedX - 0.5) * motionScale;
  const margin = Math.min(0.48, itemWidth / Math.max(1, width) / 2 + 0.015);
  const clampedCenter = Math.max(margin, Math.min(1 - margin, center));
  return clampedCenter * width;
}

function getVisualCamera(panel, splitScale) {
  if (splitScale >= 0.995) return getCamera(panel);
  return Math.max(0, panel.topY * splitScale - CAMERA_CENTER_START_HEIGHT);
}

function drawBackground(drawCtx, width, height, camera) {
  const altitude = Math.min(1, camera / 1700);
  const sky = drawCtx.createLinearGradient(0, 0, 0, height);

  if (altitude < 0.34) {
    sky.addColorStop(0, "#aee4f6");
    sky.addColorStop(0.58, "#f7f5dc");
    sky.addColorStop(1, "#d7c7a9");
  } else if (altitude < 0.7) {
    sky.addColorStop(0, "#4775b8");
    sky.addColorStop(0.52, "#8fc8f2");
    sky.addColorStop(1, "#f4e9c7");
  } else {
    sky.addColorStop(0, "#080c21");
    sky.addColorStop(0.55, "#1a2a5c");
    sky.addColorStop(1, "#6a8bc7");
  }

  drawCtx.fillStyle = sky;
  drawCtx.fillRect(0, 0, width, height);

  if (altitude < 0.72) {
    drawSun(drawCtx, width * (0.78 - altitude * 0.18), height * (0.16 + altitude * 0.08), 24 + 10 * altitude);
    drawCloud(drawCtx, width * 0.25, height * 0.18 + Math.sin(camera * 0.004) * 10, width * 0.18);
    drawCloud(drawCtx, width * 0.72, height * 0.34 + Math.cos(camera * 0.003) * 12, width * 0.13);
    if (altitude > 0.26) drawCloud(drawCtx, width * 0.48, height * 0.08, width * 0.1);
  }

  if (altitude > 0.55) {
    drawStars(drawCtx, width, height, camera, altitude);
    drawMoon(drawCtx, width * 0.22, height * 0.14, 18 + altitude * 12);
  }
}

function drawSpeedLines(drawCtx, width, height, panel, camera, scale) {
  const pressure = getHeightPressure(panel);
  const intensity = Math.min(1, 0.18 + getDifficulty() * 0.25 + pressure * 0.7);
  const lineCount = Math.floor(5 + intensity * 13);
  const speed = 160 + pressure * 520;

  drawCtx.save();
  drawCtx.globalAlpha = 0.08 + intensity * 0.14;
  drawCtx.strokeStyle = "#ffffff";
  drawCtx.lineWidth = Math.max(1, 2 * scale);

  for (let i = 0; i < lineCount; i += 1) {
    const seed = i * 97;
    const x = ((seed % 100) / 100) * width;
    const y = ((seed * 13 + camera * 0.35 + state.elapsed * speed) % (height + 120)) - 80;
    const length = (24 + intensity * 54) * scale;
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
    drawCtx.lineTo(x - 10 * scale, y + length);
    drawCtx.stroke();
  }

  drawCtx.restore();
}

function drawSun(drawCtx, x, y, radius) {
  drawCtx.fillStyle = "rgba(255, 213, 90, 0.9)";
  drawCtx.beginPath();
  drawCtx.arc(x, y, radius, 0, Math.PI * 2);
  drawCtx.fill();
}

function drawMoon(drawCtx, x, y, radius) {
  drawCtx.fillStyle = "rgba(245, 247, 255, 0.92)";
  drawCtx.beginPath();
  drawCtx.arc(x, y, radius, 0, Math.PI * 2);
  drawCtx.fill();
  drawCtx.fillStyle = "rgba(26, 42, 92, 0.92)";
  drawCtx.beginPath();
  drawCtx.arc(x + radius * 0.38, y - radius * 0.2, radius * 0.9, 0, Math.PI * 2);
  drawCtx.fill();
}

function drawCloud(drawCtx, x, y, size) {
  const cloudSize = Math.max(1, Math.abs(size));
  drawCtx.fillStyle = "rgba(255,255,255,0.78)";
  drawCtx.beginPath();
  drawCtx.ellipse(x, y, cloudSize * 0.5, cloudSize * 0.18, 0, 0, Math.PI * 2);
  drawCtx.ellipse(x - cloudSize * 0.22, y + cloudSize * 0.02, cloudSize * 0.24, cloudSize * 0.16, 0, 0, Math.PI * 2);
  drawCtx.ellipse(x + cloudSize * 0.18, y - cloudSize * 0.04, cloudSize * 0.28, cloudSize * 0.2, 0, 0, Math.PI * 2);
  drawCtx.fill();
}

function drawStars(drawCtx, width, height, camera, altitude) {
  drawCtx.fillStyle = `rgba(255,255,255,${Math.min(0.9, (altitude - 0.52) * 2.2)})`;
  for (let i = 0; i < 34; i += 1) {
    const x = ((i * 71) % 997) / 997 * width;
    const y = (((i * 131) + camera * 0.16) % 1080) / 1080 * height;
    const r = (i % 3 === 0 ? 1.6 : 1) * (height / 1080);
    drawCtx.beginPath();
    drawCtx.arc(x, y, r, 0, Math.PI * 2);
    drawCtx.fill();
  }
}

function drawWater(drawCtx, width, height, waterHeight, scale) {
  drawCtx.fillStyle = "rgba(86, 181, 216, 0.74)";
  drawCtx.fillRect(0, height - waterHeight, width, waterHeight);
  drawCtx.fillStyle = "rgba(39, 125, 161, 0.34)";
  for (let i = 0; i < 5; i += 1) {
    const waveY = height - waterHeight + 8 * scale + i * 16 * scale;
    const waveOffset = ((state.elapsed * (28 + i * 9)) % 42) * scale;
    drawCtx.fillRect(-waveOffset, waveY, width + 42 * scale, 2 * scale);
  }
}

function drawDamageFlash(drawCtx, panel, width, height) {
  if (!panel.damageFlash) return;
  const alpha = 0.24 * panel.damageFlash;
  drawCtx.fillStyle = `rgba(216, 62, 62, ${alpha})`;
  drawCtx.fillRect(0, 0, width, height);
}

function drawMilestoneEffect(drawCtx, panel, width, height, scale) {
  if (!panel.milestoneFlash) return;
  const t = 1 - panel.milestoneFlash;
  const centerX = width * 0.5;
  const centerY = height * (0.42 - t * 0.08);
  const radius = (46 + t * 110) * scale;
  const alpha = Math.max(0, panel.milestoneFlash);

  drawCtx.save();
  drawCtx.globalAlpha = alpha;
  drawCtx.strokeStyle = "#ffd166";
  drawCtx.lineWidth = Math.max(2, 5 * scale);
  drawCtx.beginPath();
  drawCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  drawCtx.stroke();

  drawCtx.fillStyle = "rgba(255, 209, 102, 0.22)";
  drawCtx.beginPath();
  drawCtx.arc(centerX, centerY, radius * 0.62, 0, Math.PI * 2);
  drawCtx.fill();

  drawCtx.fillStyle = "#fff3bf";
  for (let i = 0; i < 10; i += 1) {
    const angle = i * 0.63 + t * 1.5;
    const sparkleX = centerX + Math.cos(angle) * radius * 0.9;
    const sparkleY = centerY + Math.sin(angle) * radius * 0.52;
    drawCtx.fillRect(sparkleX, sparkleY, Math.max(2, 5 * scale), Math.max(2, 5 * scale));
  }
  drawCtx.restore();
}

function drawSplitFlash(drawCtx, panel, width, height) {
  if (!panel.splitFlash) return;
  const alpha = 0.28 * panel.splitFlash;
  const sweepX = width * (1 - panel.splitFlash);
  const gradient = drawCtx.createLinearGradient(sweepX - width * 0.2, 0, sweepX + width * 0.25, 0);
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.5, `rgba(255,255,255,${alpha})`);
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  drawCtx.fillStyle = gradient;
  drawCtx.fillRect(0, 0, width, height);
}

function drawPanelHud(drawCtx, panel, width, height, scale, detailed, camera, splitScale = 1) {
  drawCtx.fillStyle = detailed ? "#16202a" : "#27384a";
  drawCtx.font = `900 ${detailed ? 22 * scale : 14 * scale}px system-ui`;
  drawCtx.textAlign = "left";
  drawCtx.fillText(panel.label, 12 * scale, 30 * scale);
  drawCtx.textAlign = "right";
  drawCtx.fillText(formatMeters(panel.score), width - 12 * scale, 30 * scale);

  if (!detailed) return;
  drawCtx.fillStyle = "rgba(22,32,42,0.08)";
  drawCtx.fillRect(width - 10 * scale, 42 * scale, 4 * scale, height - 180 * scale);
  drawCtx.fillStyle = "#d86b4f";
  const markerY = Math.max(52 * scale, (FLOOR_WORLD_Y + camera - panel.topY * splitScale) * scale);
  drawCtx.fillRect(width - 12 * scale, markerY, 8 * scale, 8 * scale);
}

function drawFurniture(drawCtx, item, x, y, width, height) {
  drawCtx.imageSmoothingEnabled = true;
  drawCtx.imageSmoothingQuality = "high";
  drawCtx.save();
  drawCtx.shadowColor = "rgba(18, 27, 38, 0.18)";
  drawCtx.shadowBlur = Math.max(4, height * 0.08);
  drawCtx.shadowOffsetY = Math.max(2, height * 0.04);
  drawFurnitureVector(drawCtx, item, x, y, width, height);
  drawCtx.restore();
}

function drawFurnitureVector(drawCtx, item, x, y, width, height) {
  const c = item.color || "#7b6d8d";
  const a = item.accent || "#ffffff";
  const dark = shade(c, -28);
  const light = shade(c, 24);
  const r = Math.min(10, height * 0.18, width * 0.1);

  if (item.kind === "piano") {
    roundedRect(drawCtx, x, y + height * 0.18, width, height * 0.64, r, c);
    roundedRect(drawCtx, x + width * 0.08, y + height * 0.05, width * 0.62, height * 0.32, r, light);
    drawCtx.fillStyle = a;
    for (let i = 0; i < 10; i += 1) drawCtx.fillRect(x + width * (0.2 + i * 0.045), y + height * 0.48, width * 0.026, height * 0.18);
    drawCtx.fillStyle = dark;
    drawCtx.fillRect(x + width * 0.08, y + height * 0.8, width * 0.82, height * 0.12);
  } else if (item.kind === "bed") {
    roundedRect(drawCtx, x, y + height * 0.22, width, height * 0.58, r, c);
    roundedRect(drawCtx, x + width * 0.06, y + height * 0.08, width * 0.32, height * 0.28, r, a);
    roundedRect(drawCtx, x + width * 0.4, y + height * 0.1, width * 0.52, height * 0.24, r, shade(a, 10));
    drawCtx.fillStyle = dark;
    drawCtx.fillRect(x + width * 0.04, y + height * 0.78, width * 0.92, height * 0.12);
  } else if (item.kind === "sofa") {
    roundedRect(drawCtx, x + width * 0.02, y + height * 0.28, width * 0.96, height * 0.56, r, c);
    roundedRect(drawCtx, x + width * 0.12, y + height * 0.08, width * 0.76, height * 0.38, r, light);
    roundedRect(drawCtx, x, y + height * 0.42, width * 0.16, height * 0.38, r, dark);
    roundedRect(drawCtx, x + width * 0.84, y + height * 0.42, width * 0.16, height * 0.38, r, dark);
  } else if (item.kind === "cabinet" || item.kind === "drawer") {
    roundedRect(drawCtx, x + width * 0.04, y, width * 0.92, height, r, c);
    drawCtx.fillStyle = light;
    drawCtx.fillRect(x + width * 0.12, y + height * 0.3, width * 0.76, height * 0.04);
    drawCtx.fillRect(x + width * 0.12, y + height * 0.58, width * 0.76, height * 0.04);
    drawCtx.fillStyle = a;
    drawCtx.beginPath();
    drawCtx.arc(x + width * 0.47, y + height * 0.46, Math.max(2, width * 0.018), 0, Math.PI * 2);
    drawCtx.arc(x + width * 0.54, y + height * 0.72, Math.max(2, width * 0.018), 0, Math.PI * 2);
    drawCtx.fill();
  } else if (item.kind === "desk") {
    roundedRect(drawCtx, x, y, width, height * 0.34, r, c);
    roundedRect(drawCtx, x + width * 0.08, y + height * 0.34, width * 0.2, height * 0.54, r * 0.6, dark);
    roundedRect(drawCtx, x + width * 0.72, y + height * 0.34, width * 0.2, height * 0.54, r * 0.6, dark);
    roundedRect(drawCtx, x + width * 0.39, y + height * 0.34, width * 0.22, height * 0.5, r * 0.6, light);
  } else if (item.kind === "shelf") {
    roundedRect(drawCtx, x + width * 0.05, y, width * 0.9, height, r, c);
    drawCtx.fillStyle = a;
    for (let row = 0; row < 3; row += 1) {
      const yy = y + height * (0.22 + row * 0.25);
      drawCtx.fillRect(x + width * 0.14, yy, width * 0.72, height * 0.04);
      drawCtx.fillRect(x + width * (0.18 + row * 0.07), yy - height * 0.14, width * 0.05, height * 0.13);
      drawCtx.fillRect(x + width * (0.29 + row * 0.06), yy - height * 0.14, width * 0.045, height * 0.13);
    }
  } else if (item.kind === "chair") {
    roundedRect(drawCtx, x + width * 0.12, y, width * 0.76, height * 0.5, r, light);
    roundedRect(drawCtx, x + width * 0.06, y + height * 0.44, width * 0.88, height * 0.36, r, c);
    drawCtx.fillStyle = dark;
    drawCtx.fillRect(x + width * 0.16, y + height * 0.78, width * 0.68, height * 0.14);
  } else if (item.kind === "tv") {
    roundedRect(drawCtx, x + width * 0.02, y, width * 0.96, height * 0.78, r, c);
    roundedRect(drawCtx, x + width * 0.11, y + height * 0.13, width * 0.78, height * 0.46, r * 0.5, a);
    drawCtx.fillStyle = dark;
    drawCtx.fillRect(x + width * 0.42, y + height * 0.78, width * 0.16, height * 0.1);
    drawCtx.fillRect(x + width * 0.25, y + height * 0.9, width * 0.5, height * 0.08);
  } else if (item.kind === "lamp") {
    roundedRect(drawCtx, x + width * 0.18, y, width * 0.64, height * 0.38, r, a);
    roundedRect(drawCtx, x + width * 0.32, y + height * 0.34, width * 0.36, height * 0.46, r * 0.6, c);
    drawCtx.fillStyle = dark;
    drawCtx.fillRect(x + width * 0.22, y + height * 0.82, width * 0.56, height * 0.1);
  } else if (item.kind === "speaker") {
    roundedRect(drawCtx, x + width * 0.14, y, width * 0.72, height, r, c);
    drawCtx.fillStyle = a;
    [0.32, 0.7].forEach((cy) => {
      drawCtx.beginPath();
      drawCtx.arc(x + width * 0.5, y + height * cy, Math.min(width, height) * 0.13, 0, Math.PI * 2);
      drawCtx.fill();
    });
  } else if (item.kind === "stool") {
    roundedRect(drawCtx, x + width * 0.08, y, width * 0.84, height * 0.45, r, c);
    roundedRect(drawCtx, x + width * 0.18, y + height * 0.42, width * 0.64, height * 0.44, r * 0.6, dark);
  } else if (item.kind === "fish") {
    roundedRect(drawCtx, x + width * 0.08, y + height * 0.12, width * 0.84, height * 0.68, r, "rgba(86,181,216,0.9)");
    drawCtx.fillStyle = a;
    drawCtx.beginPath();
    drawCtx.ellipse(x + width * 0.5, y + height * 0.48, width * 0.12, height * 0.13, 0, 0, Math.PI * 2);
    drawCtx.moveTo(x + width * 0.62, y + height * 0.48);
    drawCtx.lineTo(x + width * 0.76, y + height * 0.36);
    drawCtx.lineTo(x + width * 0.76, y + height * 0.6);
    drawCtx.closePath();
    drawCtx.fill();
  } else if (item.kind === "plant" || item.kind === "tinyPlant") {
    roundedRect(drawCtx, x + width * 0.2, y + height * 0.58, width * 0.6, height * 0.34, r * 0.6, a);
    drawCtx.fillStyle = c;
    [0.32, 0.5, 0.68].forEach((px, i) => {
      drawCtx.beginPath();
      drawCtx.ellipse(x + width * px, y + height * (0.35 + i * 0.03), width * 0.12, height * 0.28, (i - 1) * 0.45, 0, Math.PI * 2);
      drawCtx.fill();
    });
  } else if (item.kind === "clock") {
    roundedRect(drawCtx, x + width * 0.2, y + height * 0.75, width * 0.6, height * 0.16, r * 0.5, dark);
    drawCtx.fillStyle = c;
    drawCtx.beginPath();
    drawCtx.arc(x + width * 0.5, y + height * 0.42, Math.min(width, height) * 0.32, 0, Math.PI * 2);
    drawCtx.fill();
    drawCtx.strokeStyle = a;
    drawCtx.lineWidth = Math.max(2, width * 0.025);
    drawCtx.beginPath();
    drawCtx.moveTo(x + width * 0.5, y + height * 0.42);
    drawCtx.lineTo(x + width * 0.5, y + height * 0.24);
    drawCtx.moveTo(x + width * 0.5, y + height * 0.42);
    drawCtx.lineTo(x + width * 0.64, y + height * 0.49);
    drawCtx.stroke();
  } else if (item.kind === "books") {
    [0, 1, 2].forEach((row) => roundedRect(drawCtx, x + width * (0.08 + row * 0.04), y + height * (0.62 - row * 0.22), width * 0.84, height * 0.22, r * 0.5, row % 2 ? a : c));
  } else if (item.kind === "vase") {
    roundedRect(drawCtx, x + width * 0.18, y + height * 0.75, width * 0.64, height * 0.16, r * 0.4, dark);
    roundedRect(drawCtx, x + width * 0.3, y + height * 0.26, width * 0.4, height * 0.6, r, c);
    roundedRect(drawCtx, x + width * 0.38, y + height * 0.08, width * 0.24, height * 0.24, r, a);
  } else if (item.kind === "radio") {
    roundedRect(drawCtx, x + width * 0.05, y + height * 0.22, width * 0.9, height * 0.62, r, c);
    drawCtx.strokeStyle = dark;
    drawCtx.lineWidth = Math.max(2, width * 0.025);
    drawCtx.beginPath();
    drawCtx.moveTo(x + width * 0.25, y + height * 0.22);
    drawCtx.lineTo(x + width * 0.1, y + height * 0.02);
    drawCtx.stroke();
    drawCtx.fillStyle = a;
    drawCtx.beginPath();
    drawCtx.arc(x + width * 0.72, y + height * 0.54, Math.min(width, height) * 0.13, 0, Math.PI * 2);
    drawCtx.fill();
  } else if (item.kind === "mug") {
    roundedRect(drawCtx, x + width * 0.18, y + height * 0.24, width * 0.54, height * 0.58, r, c);
    drawCtx.strokeStyle = a;
    drawCtx.lineWidth = Math.max(3, width * 0.06);
    drawCtx.beginPath();
    drawCtx.arc(x + width * 0.72, y + height * 0.52, width * 0.16, -Math.PI / 2, Math.PI / 2);
    drawCtx.stroke();
  } else {
    roundedRect(drawCtx, x + width * 0.08, y + height * 0.08, width * 0.84, height * 0.76, r, c);
    drawCtx.fillStyle = a;
    drawCtx.fillRect(x + width * 0.32, y + height * 0.26, width * 0.36, height * 0.32);
  }

  drawFurnitureVisualDetails(drawCtx, item, x, y, width, height, dark, light, a);
}

function drawFurnitureVisualDetails(drawCtx, item, x, y, width, height, dark, light, accent) {
  const detail = Math.max(1, Math.min(width, height) * 0.035);
  drawCtx.save();
  drawCtx.globalAlpha = 0.78;

  if (item.kind === "bed") {
    roundedRect(drawCtx, x + width * 0.08, y + height * 0.34, width * 0.84, height * 0.28, detail * 2, "rgba(255,255,255,0.28)");
    roundedRect(drawCtx, x + width * 0.09, y + height * 0.12, width * 0.23, height * 0.18, detail * 2, "rgba(255,255,255,0.65)");
  } else if (item.kind === "sofa") {
    roundedRect(drawCtx, x + width * 0.17, y + height * 0.32, width * 0.28, height * 0.3, detail * 2, "rgba(255,255,255,0.16)");
    roundedRect(drawCtx, x + width * 0.55, y + height * 0.32, width * 0.28, height * 0.3, detail * 2, "rgba(255,255,255,0.16)");
  } else if (item.kind === "piano") {
    drawCtx.fillStyle = "rgba(18,27,38,0.42)";
    for (let i = 0; i < 5; i += 1) {
      drawCtx.fillRect(x + width * (0.235 + i * 0.09), y + height * 0.47, width * 0.018, height * 0.15);
    }
  } else if (item.kind === "cabinet" || item.kind === "drawer") {
    drawCtx.fillStyle = "rgba(255,255,255,0.24)";
    for (let i = 0; i < 3; i += 1) {
      drawCtx.fillRect(x + width * 0.13, y + height * (0.23 + i * 0.25), width * 0.74, Math.max(1, height * 0.025));
    }
    drawCtx.fillStyle = accent;
    [0.34, 0.59, 0.84].forEach((cy) => {
      drawCtx.beginPath();
      drawCtx.arc(x + width * 0.5, y + height * cy, Math.max(2, width * 0.025), 0, Math.PI * 2);
      drawCtx.fill();
    });
  } else if (item.kind === "shelf") {
    const colors = ["#e85d75", "#ffd166", "#56b5d8", "#5e9f78"];
    colors.forEach((color, i) => {
      drawCtx.fillStyle = color;
      drawCtx.fillRect(x + width * (0.18 + i * 0.15), y + height * 0.12, width * 0.06, height * 0.18);
      drawCtx.fillRect(x + width * (0.2 + i * 0.13), y + height * 0.48, width * 0.055, height * 0.16);
    });
  } else if (item.kind === "tv") {
    const shine = drawCtx.createLinearGradient(x + width * 0.18, y + height * 0.16, x + width * 0.82, y + height * 0.55);
    shine.addColorStop(0, "rgba(255,255,255,0.35)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    drawCtx.fillStyle = shine;
    roundedRect(drawCtx, x + width * 0.14, y + height * 0.16, width * 0.72, height * 0.4, detail * 2, shine);
  } else if (item.kind === "lamp") {
    drawCtx.fillStyle = "rgba(255, 241, 156, 0.35)";
    drawCtx.beginPath();
    drawCtx.ellipse(x + width * 0.5, y + height * 0.2, width * 0.34, height * 0.18, 0, 0, Math.PI * 2);
    drawCtx.fill();
  } else if (item.kind === "plant" || item.kind === "tinyPlant") {
    drawCtx.fillStyle = "rgba(255,255,255,0.24)";
    roundedRect(drawCtx, x + width * 0.28, y + height * 0.68, width * 0.44, height * 0.12, detail * 2, "rgba(255,255,255,0.22)");
  } else if (item.kind === "radio") {
    drawCtx.fillStyle = accent;
    for (let i = 0; i < 4; i += 1) {
      drawCtx.fillRect(x + width * (0.18 + i * 0.09), y + height * 0.45, width * 0.035, height * 0.2);
    }
  } else if (item.kind === "books") {
    drawCtx.fillStyle = "rgba(255,255,255,0.32)";
    [0.2, 0.46, 0.7].forEach((cy) => {
      drawCtx.fillRect(x + width * 0.18, y + height * cy, width * 0.64, Math.max(1, height * 0.025));
    });
  } else if (item.kind === "block") {
    drawCtx.fillStyle = "rgba(255,255,255,0.35)";
    drawCtx.fillRect(x + width * 0.42, y + height * 0.12, width * 0.16, height * 0.64);
    drawCtx.fillRect(x + width * 0.18, y + height * 0.36, width * 0.64, height * 0.16);
  }

  drawCtx.fillStyle = "rgba(255,255,255,0.18)";
  drawCtx.fillRect(x + width * 0.16, y + height * 0.08, width * 0.5, Math.max(1, height * 0.03));
  drawCtx.fillStyle = item.color || light;
  drawCtx.fillRect(x + width * 0.12, y + height * 0.972, width * 0.76, Math.max(1, height * 0.028));
  drawCtx.restore();
}

function roundedRect(drawCtx, x, y, width, height, radius, color) {
  const r = Math.min(radius, width / 2, height / 2);
  drawCtx.beginPath();
  drawCtx.moveTo(x + r, y);
  drawCtx.arcTo(x + width, y, x + width, y + height, r);
  drawCtx.arcTo(x + width, y + height, x, y + height, r);
  drawCtx.arcTo(x, y + height, x, y, r);
  drawCtx.arcTo(x, y, x + width, y, r);
  drawCtx.closePath();
  drawCtx.fillStyle = color;
  drawCtx.fill();
}

function strokeRoundRect(drawCtx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  drawCtx.beginPath();
  drawCtx.moveTo(x + r, y);
  drawCtx.arcTo(x + width, y, x + width, y + height, r);
  drawCtx.arcTo(x + width, y + height, x, y + height, r);
  drawCtx.arcTo(x, y + height, x, y, r);
  drawCtx.arcTo(x, y, x + width, y, r);
  drawCtx.closePath();
  drawCtx.stroke();
}

function buildFurnitureAssets() {
  const assets = new Map();
  FURNITURE_TIERS.flat().forEach((item) => {
    const sprite = document.createElement("canvas");
    const scale = 5;
    sprite.width = 220 * scale;
    sprite.height = 120 * scale;
    sprite.scale = scale;
    sprite.bounds = getFurnitureBounds(item.kind);
    const spriteCtx = sprite.getContext("2d");
    spriteCtx.imageSmoothingEnabled = true;
    spriteCtx.imageSmoothingQuality = "high";
    spriteCtx.scale(scale, scale);
    drawFurnitureSprite(spriteCtx, item);
    assets.set(item.kind, sprite);
  });
  return assets;
}

function getFurnitureBounds(kind) {
  if (kind === "shelf" || kind === "speaker") return { y: 24, h: 74 };
  if (kind === "plant" || kind === "tinyPlant") return { y: 28, h: 68 };
  if (kind === "clock") return { y: 22, h: 76 };
  if (kind === "vase") return { y: 30, h: 64 };
  if (kind === "mug" || kind === "block") return { y: 34, h: 60 };
  return { y: 28, h: 68 };
}

function drawFurnitureSprite(spriteCtx, item) {
  const w = spriteCtx.canvas.width;
  const h = spriteCtx.canvas.height;
  spriteCtx.clearRect(0, 0, w, h);
  spriteCtx.shadowColor = "rgba(20, 30, 40, 0.18)";
  spriteCtx.shadowBlur = 8;
  spriteCtx.shadowOffsetY = 6;

  const body = item.color;
  const accent = item.accent;
  const dark = shade(body, -24);

  if (item.kind === "piano") {
    roundedRect(spriteCtx, 18, 42, 176, 44, 8, body);
    roundedRect(spriteCtx, 32, 32, 116, 22, 7, shade(body, 18));
    spriteCtx.fillStyle = accent;
    for (let i = 0; i < 11; i += 1) spriteCtx.fillRect(44 + i * 9, 62, 5, 12);
    spriteCtx.fillStyle = dark;
    spriteCtx.fillRect(32, 84, 146, 8);
    spriteCtx.fillStyle = "rgba(255,255,255,0.18)";
    spriteCtx.fillRect(42, 44, 118, 4);
  } else if (item.kind === "bed") {
    roundedRect(spriteCtx, 16, 48, 188, 38, 7, body);
    roundedRect(spriteCtx, 28, 36, 58, 22, 7, accent);
    roundedRect(spriteCtx, 88, 38, 94, 20, 6, shade(accent, 12));
    spriteCtx.fillStyle = dark;
    spriteCtx.fillRect(22, 84, 176, 8);
    spriteCtx.fillStyle = "rgba(255,255,255,0.28)";
    spriteCtx.fillRect(38, 50, 138, 5);
  } else if (item.kind === "sofa") {
    roundedRect(spriteCtx, 20, 52, 180, 36, 10, body);
    roundedRect(spriteCtx, 36, 34, 148, 34, 12, shade(body, 16));
    roundedRect(spriteCtx, 16, 56, 30, 32, 8, dark);
    roundedRect(spriteCtx, 174, 56, 30, 32, 8, dark);
    spriteCtx.fillStyle = "rgba(255,255,255,0.14)";
    spriteCtx.fillRect(48, 54, 124, 4);
  } else if (item.kind === "cabinet" || item.kind === "drawer") {
    roundedRect(spriteCtx, 36, 34, 148, 58, 7, body);
    spriteCtx.fillStyle = shade(body, 20);
    spriteCtx.fillRect(48, 50, 124, 3);
    spriteCtx.fillRect(48, 68, 124, 3);
    spriteCtx.fillStyle = accent;
    spriteCtx.beginPath();
    spriteCtx.arc(102, 60, 3, 0, Math.PI * 2);
    spriteCtx.arc(124, 78, 3, 0, Math.PI * 2);
    spriteCtx.fill();
    spriteCtx.strokeStyle = "rgba(255,255,255,0.25)";
    spriteCtx.lineWidth = 2;
    spriteCtx.strokeRect(48, 42, 124, 42);
  } else if (item.kind === "desk") {
    roundedRect(spriteCtx, 24, 38, 172, 24, 6, body);
    roundedRect(spriteCtx, 38, 62, 36, 28, 4, dark);
    roundedRect(spriteCtx, 146, 62, 36, 28, 4, dark);
    roundedRect(spriteCtx, 92, 62, 42, 28, 4, shade(body, 16));
    spriteCtx.fillStyle = "rgba(255,255,255,0.2)";
    spriteCtx.fillRect(34, 42, 148, 4);
  } else if (item.kind === "shelf") {
    roundedRect(spriteCtx, 38, 26, 144, 68, 6, body);
    spriteCtx.fillStyle = accent;
    for (let row = 0; row < 3; row += 1) {
      spriteCtx.fillRect(52, 42 + row * 17, 116, 3);
      spriteCtx.fillRect(62 + row * 14, 31 + row * 17, 9, 11);
      spriteCtx.fillRect(80 + row * 11, 31 + row * 17, 8, 11);
    }
    spriteCtx.strokeStyle = "rgba(255,255,255,0.2)";
    spriteCtx.strokeRect(48, 34, 124, 50);
  } else if (item.kind === "chair") {
    roundedRect(spriteCtx, 56, 52, 108, 28, 6, body);
    roundedRect(spriteCtx, 70, 30, 80, 28, 7, shade(body, 14));
    spriteCtx.fillStyle = dark;
    spriteCtx.fillRect(66, 78, 88, 10);
    spriteCtx.fillStyle = "rgba(255,255,255,0.16)";
    spriteCtx.fillRect(74, 54, 72, 4);
  } else if (item.kind === "tv") {
    roundedRect(spriteCtx, 36, 32, 148, 56, 8, body);
    roundedRect(spriteCtx, 48, 42, 124, 34, 5, accent);
    spriteCtx.fillStyle = dark;
    spriteCtx.fillRect(94, 86, 32, 7);
    spriteCtx.fillRect(70, 94, 80, 5);
    spriteCtx.fillStyle = "rgba(255,255,255,0.28)";
    spriteCtx.fillRect(58, 47, 42, 4);
  } else if (item.kind === "lamp") {
    roundedRect(spriteCtx, 62, 36, 96, 28, 7, accent);
    roundedRect(spriteCtx, 72, 64, 76, 26, 6, body);
    spriteCtx.fillStyle = dark;
    spriteCtx.fillRect(78, 88, 64, 7);
    spriteCtx.fillStyle = "rgba(255,255,255,0.28)";
    spriteCtx.fillRect(74, 43, 70, 4);
  } else if (item.kind === "speaker") {
    roundedRect(spriteCtx, 58, 30, 104, 62, 7, body);
    spriteCtx.fillStyle = accent;
    [46, 74].forEach((cy) => {
      spriteCtx.beginPath();
      spriteCtx.arc(110, cy, 13, 0, Math.PI * 2);
      spriteCtx.fill();
    });
    spriteCtx.fillStyle = "rgba(255,255,255,0.12)";
    spriteCtx.fillRect(70, 36, 76, 4);
  } else if (item.kind === "stool") {
    roundedRect(spriteCtx, 58, 48, 104, 24, 8, body);
    roundedRect(spriteCtx, 70, 70, 80, 18, 5, dark);
    spriteCtx.fillStyle = "rgba(255,255,255,0.18)";
    spriteCtx.fillRect(72, 54, 76, 4);
  } else if (item.kind === "fish") {
    roundedRect(spriteCtx, 52, 42, 116, 42, 14, "rgba(86,181,216,0.86)");
    spriteCtx.fillStyle = accent;
    spriteCtx.beginPath();
    spriteCtx.ellipse(108, 60, 16, 8, 0, 0, Math.PI * 2);
    spriteCtx.moveTo(122, 60);
    spriteCtx.lineTo(138, 50);
    spriteCtx.lineTo(138, 70);
    spriteCtx.closePath();
    spriteCtx.fill();
  } else if (item.kind === "plant" || item.kind === "tinyPlant") {
    roundedRect(spriteCtx, 62, 66, 96, 24, 5, accent);
    spriteCtx.fillStyle = body;
    [[96, 58, -0.7], [112, 48, 0], [126, 58, 0.7]].forEach(([cx, cy, rot]) => {
      spriteCtx.save();
      spriteCtx.translate(cx, cy);
      spriteCtx.rotate(rot);
      spriteCtx.beginPath();
      spriteCtx.ellipse(0, 0, 13, 22, 0, 0, Math.PI * 2);
      spriteCtx.fill();
      spriteCtx.restore();
    });
  } else if (item.kind === "clock") {
    spriteCtx.fillStyle = body;
    roundedRect(spriteCtx, 70, 72, 80, 18, 5, shade(body, -12));
    spriteCtx.beginPath();
    spriteCtx.arc(110, 54, 30, 0, Math.PI * 2);
    spriteCtx.fill();
    spriteCtx.strokeStyle = item.accent;
    spriteCtx.lineWidth = 5;
    spriteCtx.beginPath();
    spriteCtx.moveTo(110, 58);
    spriteCtx.lineTo(110, 40);
    spriteCtx.moveTo(110, 58);
    spriteCtx.lineTo(126, 64);
    spriteCtx.stroke();
  } else if (item.kind === "books") {
    [0, 1, 2].forEach((row) => roundedRect(spriteCtx, 50 + row * 8, 74 - row * 15, 120, 16, 4, row % 2 ? accent : body));
  } else if (item.kind === "vase") {
    roundedRect(spriteCtx, 72, 70, 76, 18, 5, shade(body, -12));
    roundedRect(spriteCtx, 86, 46, 48, 42, 15, body);
    roundedRect(spriteCtx, 94, 34, 32, 18, 10, accent);
  } else if (item.kind === "radio") {
    roundedRect(spriteCtx, 50, 42, 120, 44, 7, body);
    spriteCtx.strokeStyle = dark;
    spriteCtx.lineWidth = 4;
    spriteCtx.beginPath();
    spriteCtx.moveTo(82, 44);
    spriteCtx.lineTo(66, 24);
    spriteCtx.stroke();
    spriteCtx.fillStyle = accent;
    spriteCtx.beginPath();
    spriteCtx.arc(132, 65, 12, 0, Math.PI * 2);
    spriteCtx.fill();
  } else if (item.kind === "mug") {
    roundedRect(spriteCtx, 68, 50, 78, 36, 8, body);
    spriteCtx.strokeStyle = accent;
    spriteCtx.lineWidth = 8;
    spriteCtx.beginPath();
    spriteCtx.arc(136, 66, 14, -Math.PI / 2, Math.PI / 2);
    spriteCtx.stroke();
  } else {
    roundedRect(spriteCtx, 62, 48, 96, 40, 7, body);
    spriteCtx.fillStyle = accent;
    spriteCtx.fillRect(96, 58, 28, 18);
  }

  finishFurnitureSprite(spriteCtx, item);
  spriteCtx.shadowColor = "transparent";
}

function finishFurnitureSprite(spriteCtx, item) {
  spriteCtx.shadowColor = "transparent";
  spriteCtx.fillStyle = "rgba(255,255,255,0.2)";
  spriteCtx.fillRect(32, 30, 136, 3);
  spriteCtx.fillStyle = "rgba(18,27,38,0.12)";
  for (let i = 0; i < 4; i += 1) {
    spriteCtx.fillRect(38 + i * 34, 91, 18, 2);
  }
}

function drawLegs(spriteCtx, xs, y, color) {
  spriteCtx.fillStyle = color;
  xs.forEach((x) => spriteCtx.fillRect(x, y, 7, 24));
}

function shade(hex, amount) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((start) => {
    const next = parseInt(value.slice(start, start + 2), 16) + amount;
    return Math.max(0, Math.min(255, next)).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

function setupRivals() {
  if (battleLayout) battleLayout.className = "battle-layout players-1";
}

function updateRoomUi() {
  // Single-player only.
}

function updateKeyStrip() {
  keyStrip.innerHTML = "";
  PANEL_LABELS.forEach((label, index) => {
    const pill = document.createElement("div");
    pill.className = "key-pill";
    pill.textContent = label;
    pill.dataset.keyIndex = index;
    keyStrip.append(pill);
  });
}

function updateHud() {
  const humanScore = state.players[0].score;
  const left = Math.max(0, GAME_SECONDS - state.elapsed);
  scoreLabel.textContent = formatMeters(humanScore);
  timeLabel.textContent = formatTime(left);
  updateLocalDebugState();

  const activeCount = getActivePanelCount();
  document.querySelectorAll(".key-pill").forEach((pill) => {
    pill.classList.toggle("live", Number(pill.dataset.keyIndex) < activeCount);
  });
}

function updateLocalDebugState() {
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) return;
  window.__riseRiseDebug = () => {
    if (!state) return null;
    const panel = state.players[0].panels[0];
    return {
      topY: panel.topY,
      camera: panel.camera,
      cameraTarget: getCameraTarget(panel),
      stack: panel.stack.length,
      misses: panel.misses,
      activePanelCount: state.activePanelCount
    };
  };
}

function endGame() {
  if (!state.running) return;
  state.running = false;
  cancelAnimationFrame(animationId);
  stopBgm();
  playSound(state.endReason === "water" ? "gameover" : "finish");
  const humanScore = state.players[0].score;
  bestScore = Math.max(bestScore, humanScore);
  localStorage.setItem("riseRiseBest", String(bestScore));
  bestScoreLabel.textContent = formatMeters(bestScore);
  state.lastShareScore = humanScore;

  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  const rank = sorted.findIndex((player) => player.isHuman) + 1;

  $("#result-title").textContent = formatMeters(humanScore);
  $("#final-score").textContent = formatMeters(humanScore);
  $("#final-best").textContent = formatMeters(bestScore);
  $("#final-rank").textContent = "싱글";
  $("#result-summary").textContent = makeResultSummary(humanScore, rank);
  showScreen(resultScreen);
}

function makeResultSummary(score, rank) {
  if (state.endReason === "water") return "물이 탑 높이를 넘어왔습니다. 다음에는 더 빠르고 정확하게 쌓아보세요.";
  if (score >= 80) return "좋은 균형 감각입니다. 분할 화면에서도 오래 버틸 수 있는 기록이에요.";
  if (score >= 45) return "감이 살아났습니다. 조금 더 안정적으로 쌓으면 더 높은 기록을 만들 수 있어요.";
  return "초반 가구는 중앙에 맞추는 연습이 중요합니다. 한 번 더 도전해보세요.";
}

function ensureAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
      bgmGain = audioCtx.createGain();
      bgmGain.gain.value = 0;
      bgmGain.connect(audioCtx.destination);
    }
  }
  if (audioCtx?.state === "suspended") audioCtx.resume();
}

function startBgm() {
  if (!audioCtx || bgmTimer) return;
  bgmStep = 0;
  const now = audioCtx.currentTime;
  bgmGain.gain.cancelScheduledValues(now);
  bgmGain.gain.setValueAtTime(bgmGain.gain.value, now);
  bgmGain.gain.linearRampToValueAtTime(0.045, now + 0.45);
  scheduleBgmStep();
  bgmTimer = window.setInterval(scheduleBgmStep, 150);
}

function stopBgm() {
  if (!audioCtx || !bgmGain) return;
  if (bgmTimer) {
    clearInterval(bgmTimer);
    bgmTimer = null;
  }
  const now = audioCtx.currentTime;
  bgmGain.gain.cancelScheduledValues(now);
  bgmGain.gain.setValueAtTime(bgmGain.gain.value, now);
  bgmGain.gain.linearRampToValueAtTime(0.0001, now + 0.35);
}

function scheduleBgmStep() {
  if (!audioCtx || !bgmGain) return;
  const step = bgmStep % 32;
  const start = audioCtx.currentTime + 0.035;
  const melody = [659, 0, 784, 659, 880, 0, 784, 0, 587, 659, 0, 523, 587, 0, 659, 0, 784, 0, 988, 880, 784, 0, 659, 0, 587, 0, 659, 784, 880, 0, 784, 0];
  const bass = [165, 0, 0, 196, 0, 0, 220, 0, 147, 0, 0, 196, 0, 0, 165, 0, 196, 0, 0, 247, 0, 0, 220, 0, 147, 0, 0, 165, 0, 0, 196, 0];
  const note = melody[step];
  const bassNote = bass[step];
  if (note) bgmTone(note, 0.115, "square", start, 0.22);
  if (bassNote) bgmTone(bassNote, 0.13, "triangle", start, 0.24);
  if (step % 4 === 0) bgmClick(start, 0.08);
  bgmStep += 1;
}

function bgmTone(frequency, duration, type, start, gainAmount) {
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  filter.type = "lowpass";
  filter.frequency.value = 1600;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainAmount, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(bgmGain);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function bgmClick(start, gainAmount) {
  const sampleRate = audioCtx.sampleRate;
  const duration = 0.025;
  const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  filter.type = "highpass";
  filter.frequency.value = 1800;
  gain.gain.setValueAtTime(gainAmount, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(bgmGain);
  source.start(start);
}

function playSound(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const master = audioCtx.createGain();
  master.gain.value = 0.05;
  master.connect(audioCtx.destination);

  if (type === "drop") {
    tone(520, 0.045, "triangle", now, master, 0.7);
    tone(330, 0.05, "sine", now + 0.025, master, 0.45);
  } else if (type === "place") {
    tone(260, 0.055, "sine", now, master, 0.8);
    tone(390, 0.06, "triangle", now + 0.035, master, 0.5);
  } else if (type === "cut") {
    noise(0.07, now, master, 0.5);
    tone(720, 0.04, "square", now, master, 0.18);
  } else if (type === "miss") {
    tone(160, 0.13, "sawtooth", now, master, 0.35);
    noise(0.09, now + 0.02, master, 0.25);
  } else if (type === "start") {
    tone(420, 0.07, "triangle", now, master, 0.45);
    tone(620, 0.08, "triangle", now + 0.06, master, 0.45);
  } else if (type === "milestone") {
    tone(620, 0.06, "triangle", now, master, 0.38);
    tone(820, 0.08, "triangle", now + 0.05, master, 0.34);
    tone(1040, 0.09, "sine", now + 0.12, master, 0.24);
  } else if (type === "finish") {
    tone(500, 0.08, "triangle", now, master, 0.45);
    tone(660, 0.1, "triangle", now + 0.07, master, 0.42);
  } else if (type === "gameover") {
    tone(220, 0.12, "sawtooth", now, master, 0.38);
    tone(130, 0.18, "sine", now + 0.08, master, 0.5);
    noise(0.16, now + 0.02, master, 0.2);
  }
}

function tone(frequency, duration, type, start, destination, gainAmount) {
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(gainAmount, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(duration, start, destination, gainAmount) {
  const sampleRate = audioCtx.sampleRate;
  const buffer = audioCtx.createBuffer(1, Math.max(1, sampleRate * duration), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = audioCtx.createBufferSource();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  filter.type = "highpass";
  filter.frequency.value = 520;
  gain.gain.setValueAtTime(gainAmount, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  source.start(start);
}

function showScreen(target) {
  [startScreen, playScreen, resultScreen].forEach((screen) => {
    screen.classList.toggle("active", screen === target);
  });
  requestAnimationFrame(() => {
    document.querySelector(".shell")?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

function shareText(score = 0) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("from", "share");
  if (score) url.searchParams.set("score", score.toFixed(1));

  const scoreText = score ? formatMeters(score) + " 기록 달성!" : "친구에게 보내는 도전장";
  return {
    title: "RISE RISE! - " + scoreText,
    text: "RISE RISE!에서 " + scoreText + " 물이 차오르기 전에 가구를 쌓아 내 기록에 도전해보세요.",
    url: url.toString()
  };
}

async function shareScore(score) {
  const payload = shareText(score);
  if (navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  await copyText(payload.title + "\n" + payload.text + "\n" + payload.url);
  showToast("기록과 도전 링크를 복사했습니다.");
}

function openShareWindow(service, score) {
  const payload = shareText(score);
  const encodedUrl = encodeURIComponent(payload.url);
  const encodedText = encodeURIComponent(payload.title + "\n" + payload.text);
  const shareUrl = service === "x"
    ? "https://twitter.com/intent/tweet?text=" + encodedText + "&url=" + encodedUrl
    : "https://www.facebook.com/sharer/sharer.php?u=" + encodedUrl;
  window.open(shareUrl, "_blank", "noopener,noreferrer,width=720,height=560");
}

async function copyShareLink(score) {
  const payload = shareText(score);
  await copyText(payload.title + "\n" + payload.text + "\n" + payload.url);
  showToast("공유 문구와 링크를 복사했습니다.");
}

async function copyText(text) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function applySharedStart() {
  const params = new URLSearchParams(window.location.search);
  const score = Number(params.get("score"));
  if (params.get("from") === "share") {
    const suffix = score ? "친구 기록은 " + formatMeters(score) + "입니다. " : "";
    requestAnimationFrame(() => showToast(suffix + "시작 버튼으로 바로 도전해보세요."));
  }
}

function formatMeters(value) {
  return `${Math.max(0, value).toFixed(1)} m`;
}

function formatTime(seconds) {
  const minute = Math.floor(seconds / 60);
  const second = Math.floor(seconds % 60);
  return `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const index = PANEL_KEYS.indexOf(key);
  if (index === -1) return;
  event.preventDefault();
  dropHumanPanel(index);
});

canvas.addEventListener("pointerdown", (event) => {
  if (!state || !state.running) return;
  const activeCount = getActivePanelCount();
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const panelIndex = Math.min(activeCount - 1, Math.floor(x / (rect.width / activeCount)));
  dropHumanPanel(panelIndex);
});


$("#start-button").addEventListener("click", startGame);
$("#restart-button").addEventListener("click", startGame);
$("#home-button").addEventListener("click", () => {
  if (state) state.running = false;
  cancelAnimationFrame(animationId);
  stopBgm();
  showScreen(startScreen);
});
$("#share-score-button").addEventListener("click", () => shareScore(state?.lastShareScore || 0));
$("#copy-result-button").addEventListener("click", () => copyShareLink(state?.lastShareScore || 0));
$("#x-share-button").addEventListener("click", () => openShareWindow("x", state?.lastShareScore || 0));
$("#facebook-share-button").addEventListener("click", () => openShareWindow("facebook", state?.lastShareScore || 0));
$("#share-start-button").addEventListener("click", async () => {
  const payload = shareText(0);
  await copyText(payload.title + "\n" + payload.text + "\n" + payload.url);
  showToast("친구에게 보낼 도전 링크를 복사했습니다.");
});
