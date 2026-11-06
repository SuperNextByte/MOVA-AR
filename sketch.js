/* =========================================================
   MOVA AR · "Atrapa els cors"
   Frontend: navegació entre pantalles, càmera, realitat
   augmentada amb p5.js i detecció del cos amb ml5.js bodyPose.
   ========================================================= */

/* ---------- Configuració ---------- */
const CONFIG = {
  duration: 30,            // segons de l'exercici
  minConfidence: 0.3,      // confiança mínima d'un punt del cos
  readyHold: 600,          // ms que cal estar ben col·locat per activar el botó
  handHold: 1500,          // ms amb la mà sobre COMENÇAR! per començar sense ratolí
  heartLife: 7000,         // ms abans que un cor no atrapat canviï de lloc
  colors: {
    black: "#101012",
    grey: "#423f3c",
    pink: "#ff3b6b",
    pinkSoft: "#ff789f",
    white: "#ffffff",
    ok: "#3ddc84",
  },
};

// Parelles de punts per dibuixar l'esquelet (només la part superior del cos)
const BONES = [
  ["left_shoulder", "right_shoulder"],
  ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
  ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
  ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
  ["left_hip", "right_hip"],
];

/* ---------- Estat de l'aplicació ---------- */
let state = "off";         // off | loading | setup | countdown | play | end
let session = 0;           // evita errors si l'usuari surt mentre es carrega
let bodyPose = null;       // model ml5
let modelReady = false;
let videoEl = null;        // element <video> de la webcam
let stream = null;
let pose = null;           // última postura detectada
let lastPoseAt = 0;
const smoothPts = {};         // posicions suavitzades dels punts

let readySince = 0;
let handOverSince = 0;
let countdownStart = 0;
let playStart = 0;
let score = 0;
let heart = null;
let nextSide = 1;          // 1 = dreta de la pantalla, -1 = esquerra
let particles = [];
let floaters = [];

const $ = (id) => document.getElementById(id);

/* =========================================================
   NAVEGACIÓ ENTRE PANTALLES
   ========================================================= */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
}

function show(id, visible) { $(id).hidden = !visible; }

function goMenu() {
  stopCamera();
  state = "off";
  showScreen("screen-menu");
  renderBest();
  $("btn-start").focus();
}

function renderBest() {
  const best = getBest();
  const el = $("best-score");
  if (best > 0) {
    el.innerHTML = `Millor puntuació en aquest ordinador: <strong>${best}</strong> cors`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function getBest() {
  try { return parseInt(localStorage.getItem("mova-best") || "0", 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { if (v > getBest()) localStorage.setItem("mova-best", String(v)); } catch (e) { /* sense emmagatzematge */ }
}

/* =========================================================
   CÀMERA I MODEL
   ========================================================= */
async function startExercise() {
  Sound.unlock();
  const mySession = ++session;
  showScreen("screen-game");
  ["setup-ui", "hud", "countdown", "end-ui", "cam-error"].forEach((id) => show(id, false));
  show("loading", true);
  $("loading-text").textContent = "Engegant la càmera…";
  state = "loading";
  resetGame();
  loop();

  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Aquest navegador no permet fer servir la càmera. Prova amb Chrome o Edge actualitzats.");
    }
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: false,
    });
    if (mySession !== session) { stopTracks(stream); return; }

    videoEl = document.createElement("video");
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.srcObject = stream;
    await videoEl.play();
    await waitForVideoSize(videoEl);
    if (mySession !== session) return;
    // ml5 fa servir width/height de l'element per escalar els punts del cos:
    // un <video> creat amb JavaScript els té a 0 si no els posem
    videoEl.width = videoEl.videoWidth;
    videoEl.height = videoEl.videoHeight;

    $("loading-text").textContent = "Preparant la intel·ligència artificial…";
    await loadBodyPose();
    if (mySession !== session) return;

    bodyPose.detectStart(videoEl, gotPoses);
    show("loading", false);
    enterSetup();
  } catch (err) {
    if (mySession !== session) return;
    console.error("[MOVA AR] Error en començar l'exercici:", err && err.stack ? err.stack : err);
    show("loading", false);
    $("cam-error-text").textContent = friendlyError(err);
    show("cam-error", true);
    state = "off";
  }
}

function waitForVideoSize(v) {
  return new Promise((resolve) => {
    if (v.videoWidth > 0) return resolve();
    v.addEventListener("loadedmetadata", () => resolve(), { once: true });
  });
}

function loadBodyPose() {
  if (modelReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (typeof ml5 === "undefined") {
      reject(new Error("No s'ha pogut carregar ml5.js. Comprova la connexió a Internet."));
      return;
    }
    bodyPose = ml5.bodyPose("MoveNet", { modelType: "SINGLEPOSE_LIGHTNING", enableSmoothing: true }, () => {
      modelReady = true;
      resolve();
    });
  });
}

function gotPoses(results) {
  pose = results && results.length ? results[0] : null;
  if (pose) lastPoseAt = millis();
}

function stopTracks(s) { if (s) s.getTracks().forEach((t) => t.stop()); }

function stopCamera() {
  session++;
  if (bodyPose && modelReady) { try { bodyPose.detectStop(); } catch (e) { /* ja aturat */ } }
  stopTracks(stream);
  stream = null;
  if (videoEl) { videoEl.srcObject = null; videoEl = null; }
  pose = null;
  for (const k in smoothPts) delete smoothPts[k];
  noLoop();
  if (typeof clear === "function") clear();
}

function friendlyError(err) {
  const name = err && err.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Cal donar permís per fer servir la càmera. Fes clic a la icona de la càmera de la barra d'adreces, tria «Permetre» i torna-ho a provar.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No hem trobat cap càmera. Connecta una webcam i torna-ho a provar.";
  }
  if (name === "NotReadableError") {
    return "Una altra aplicació està fent servir la càmera. Tanca-la i torna-ho a provar.";
  }
  return (err && err.message) || "Hi ha hagut un problema inesperat.";
}

/* =========================================================
   P5.JS
   ========================================================= */
function setup() {
  const c = createCanvas(windowWidth, windowHeight);
  c.parent("stage");
  pixelDensity(1);
  textFont("Bebas Neue");
  noLoop();
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }

function draw() {
  clear();
  background(CONFIG.colors.black);
  if (!videoEl) return;

  drawVideo();
  updateSmoothedPoints();

  if (state === "setup") drawSetup();
  else if (state === "countdown") drawCountdown();
  else if (state === "play") drawPlay();

  if (state === "setup" || state === "countdown" || state === "play") drawSkeleton();
  drawParticles();
}

/* ---------- Vídeo en mode mirall i a pantalla completa ---------- */
function videoBox() {
  const vw = videoEl.videoWidth || 1280;
  const vh = videoEl.videoHeight || 720;
  const s = Math.max(width / vw, height / vh);
  const dw = vw * s, dh = vh * s;
  return { vw, vh, s, dw, dh, ox: (width - dw) / 2, oy: (height - dh) / 2 };
}

function drawVideo() {
  const b = videoBox();
  push();
  translate(b.ox + b.dw, b.oy);
  scale(-1, 1);                       // efecte mirall
  drawingContext.drawImage(videoEl, 0, 0, b.dw, b.dh);
  pop();
  // vel fosc perquè destaquin els elements de realitat augmentada
  noStroke();
  fill(16, 16, 18, state === "play" ? 70 : 110);
  rect(0, 0, width, height);
}

/* ---------- Punts del cos ---------- */
function updateSmoothedPoints() {
  if (!pose || millis() - lastPoseAt > 600) {
    for (const k in smoothPts) smoothPts[k].visible = false;
    return;
  }
  const b = videoBox();
  for (const kp of pose.keypoints) {
    const ok = (kp.confidence ?? kp.score ?? 0) >= CONFIG.minConfidence;
    const x = b.ox + (b.vw - kp.x) * b.s;   // invertim X per fer de mirall
    const y = b.oy + kp.y * b.s;
    const prev = smoothPts[kp.name];
    if (!prev) {
      smoothPts[kp.name] = { x, y, visible: ok };
    } else {
      prev.x = lerp(prev.x, x, 0.55);
      prev.y = lerp(prev.y, y, 0.55);
      prev.visible = ok;
    }
  }
}

function getPoint(name) {
  const p = smoothPts[name];
  return p && p.visible ? p : null;
}

// Punt aproximat de la mà: allarguem l'avantbraç una mica més enllà del canell
function handPoint(side) {
  const w = getPoint(side + "_wrist");
  if (!w) return null;
  const e = getPoint(side + "_elbow");
  if (!e) return { x: w.x, y: w.y };
  return { x: w.x + (w.x - e.x) * 0.3, y: w.y + (w.y - e.y) * 0.3 };
}

function shoulderWidth() {
  const l = getPoint("left_shoulder"), r = getPoint("right_shoulder");
  return l && r ? dist(l.x, l.y, r.x, r.y) : null;
}

/* ---------- Esquelet de realitat augmentada ---------- */
function drawSkeleton() {
  strokeCap(ROUND);
  for (const [a, c] of BONES) {
    const p1 = getPoint(a), p2 = getPoint(c);
    if (!p1 || !p2) continue;
    stroke(255, 120, 159, 200);
    strokeWeight(7);
    line(p1.x, p1.y, p2.x, p2.y);
  }
  noStroke();
  for (const n of ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_hip", "right_hip"]) {
    const p = getPoint(n);
    if (p) { fill(CONFIG.colors.white); circle(p.x, p.y, 16); }
  }
  // mans: cercles brillants
  for (const side of ["left", "right"]) {
    const h = handPoint(side);
    if (!h) continue;
    const pulse = 1 + 0.08 * Math.sin(millis() / 180);
    drawingContext.shadowBlur = 30;
    drawingContext.shadowColor = CONFIG.colors.pink;
    fill(255, 59, 107, 170);
    circle(h.x, h.y, 64 * pulse);
    drawingContext.shadowBlur = 0;
    fill(CONFIG.colors.white);
    circle(h.x, h.y, 22);
  }
  // cap: petit indicador sobre el nas
  const nose = getPoint("nose");
  if (nose) { noFill(); stroke(255, 255, 255, 120); strokeWeight(3); circle(nose.x, nose.y, 26); }
}

/* =========================================================
   FASE 1: COL·LOCACIÓ DE L'USUARI
   ========================================================= */
function enterSetup() {
  state = "setup";
  readySince = 0;
  handOverSince = 0;
  show("setup-ui", true);
  setGoEnabled(false);
}

function guideGeometry() {
  const h = height, cx = width / 2;
  const headR = h * 0.085;
  return {
    cx, headR,
    headY: h * 0.33,
    shoulderY: h * 0.55,
    shoulderHalf: Math.min(width * 0.17, h * 0.26),
  };
}

function checkPosition() {
  const nose = getPoint("nose");
  const ls = getPoint("left_shoulder"), rs = getPoint("right_shoulder");
  const res = { body: false, center: false, dist: false, hint: "Col·loca't dins la silueta" };

  if (!nose || !ls || !rs) {
    res.hint = pose ? "Necessitem veure't el cap i les espatlles" : "No et veiem. Posa't davant la càmera";
    return res;
  }
  res.body = true;

  const midX = (ls.x + rs.x) / 2;
  const sw = dist(ls.x, ls.y, rs.x, rs.y) / width;
  res.center = Math.abs(midX - width / 2) < width * 0.12 && nose.y > height * 0.1 && nose.y < height * 0.55;
  res.dist = sw > 0.12 && sw < 0.42;

  if (!res.dist) res.hint = sw >= 0.42 ? "Allunya't una mica de la pantalla" : "Apropa't una mica a la pantalla";
  else if (!res.center) {
    if (midX < width / 2 - width * 0.12) res.hint = "Mou-te una mica cap a la dreta";
    else if (midX > width / 2 + width * 0.12) res.hint = "Mou-te una mica cap a l'esquerra";
    else res.hint = nose.y <= height * 0.1 ? "Abaixa una mica la càmera o seu" : "Aixeca una mica la càmera o el cap";
  } else res.hint = "Perfecte! Ja pots començar";
  return res;
}

function drawSetup() {
  const r = checkPosition();
  const allOk = r.body && r.center && r.dist;

  // estat dels indicadors
  $("chk-body").classList.toggle("ok", r.body);
  $("chk-center").classList.toggle("ok", r.center);
  $("chk-dist").classList.toggle("ok", r.dist);
  const msg = $("setup-msg");
  msg.textContent = r.hint;
  msg.classList.toggle("ok", allOk);

  // silueta de referència
  const g = guideGeometry();
  const col = allOk ? CONFIG.colors.ok : CONFIG.colors.pink;
  const t = millis() / 1000;
  push();
  drawingContext.setLineDash([18, 14]);
  drawingContext.lineDashOffset = -t * 30;
  noFill();
  stroke(col);
  strokeWeight(6);
  circle(g.cx, g.headY, g.headR * 2);
  const sh = g.shoulderHalf;
  beginShape();
  vertex(g.cx - sh * 1.15, height + 10);
  vertex(g.cx - sh * 1.05, g.shoulderY + sh * 0.35);
  bezierVertex(g.cx - sh * 1.0, g.shoulderY - sh * 0.05, g.cx - sh * 0.7, g.shoulderY - sh * 0.18, g.cx - sh * 0.32, g.shoulderY - sh * 0.2);
  vertex(g.cx - sh * 0.22, g.headY + g.headR * 1.25);
  vertex(g.cx + sh * 0.22, g.headY + g.headR * 1.25);
  vertex(g.cx + sh * 0.32, g.shoulderY - sh * 0.2);
  bezierVertex(g.cx + sh * 0.7, g.shoulderY - sh * 0.18, g.cx + sh * 1.0, g.shoulderY - sh * 0.05, g.cx + sh * 1.05, g.shoulderY + sh * 0.35);
  vertex(g.cx + sh * 1.15, height + 10);
  endShape();
  drawingContext.setLineDash([]);
  pop();

  // activació del botó COMENÇAR!
  const now = millis();
  if (allOk) { if (!readySince) readySince = now; } else readySince = 0;
  const ready = readySince && now - readySince > CONFIG.readyHold;
  setGoEnabled(ready);

  // seleccionar el botó amb la mà (sense ratolí)
  if (ready && handOverButton()) {
    if (!handOverSince) handOverSince = now;
    const p = constrain((now - handOverSince) / CONFIG.handHold, 0, 1);
    $("btn-go").style.setProperty("--hold", p);
    if (p >= 1) startCountdown();
  } else {
    handOverSince = 0;
    $("btn-go").style.setProperty("--hold", 0);
  }
}

function handOverButton() {
  const r = $("btn-go").getBoundingClientRect();
  const cr = document.querySelector("#stage canvas").getBoundingClientRect();
  const pad = 20;
  return ["left", "right"].some((side) => {
    const h = handPoint(side);
    if (!h) return false;
    const x = cr.left + h.x * (cr.width / width);
    const y = cr.top + h.y * (cr.height / height);
    return x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad;
  });
}

function setGoEnabled(on) {
  const b = $("btn-go");
  if (b.disabled === !on) return;
  b.disabled = !on;
}

/* =========================================================
   FASE 2: COMPTE ENRERE 3-2-1
   ========================================================= */
let lastCount = null;
function startCountdown() {
  if (state !== "setup") return;
  Sound.unlock();
  state = "countdown";
  countdownStart = millis();
  lastCount = null;
  show("setup-ui", false);
  show("countdown", true);
}

function drawCountdown() {
  const elapsed = millis() - countdownStart;
  const n = 3 - Math.floor(elapsed / 1000);
  const label = n > 0 ? String(n) : "JA!";
  if (label !== lastCount) {
    lastCount = label;
    $("countdown").innerHTML = `<span>${label}</span>`;
    Sound.beep(n <= 0);
  }
  if (elapsed > 3700) startPlay();
}

/* =========================================================
   FASE 3: EXERCICI "ATRAPA ELS CORS"
   ========================================================= */
function resetGame() {
  score = 0;
  heart = null;
  particles = [];
  floaters = [];
  nextSide = Math.random() < 0.5 ? 1 : -1;
  $("hud-score").textContent = "0";
  $("hud-time").textContent = CONFIG.duration;
  $("ring-fg").style.strokeDashoffset = 0;
  $("btn-go").style.setProperty("--hold", 0);
}

function startPlay() {
  show("countdown", false);
  show("hud", true);
  state = "play";
  playStart = millis();
  spawnHeart();
}

// Cada cor apareix a l'abast del braç, alternant costat i alçada
function spawnHeart() {
  const ls = getPoint("left_shoulder"), rs = getPoint("right_shoulder");
  let sx, sy, sw;
  if (ls && rs) {
    sw = Math.max(dist(ls.x, ls.y, rs.x, rs.y), width * 0.1);
    const s = nextSide === 1 ? (ls.x > rs.x ? ls : rs) : (ls.x > rs.x ? rs : ls);
    sx = s.x; sy = s.y;
  } else {
    const g = guideGeometry();
    sw = g.shoulderHalf * 2;
    sx = g.cx + nextSide * g.shoulderHalf;
    sy = g.shoulderY;
  }
  // angles (graus) des de l'horitzontal: de costat, en diagonal i per sobre del cap
  const angles = [10, 35, 60, 85];
  const a = radians(random(angles) + random(-6, 6));
  const reach = sw * random(1.15, 1.45);
  const size = constrain(sw * 0.3, 42, 110);
  const x = constrain(sx + nextSide * Math.cos(a) * reach, size * 1.2, width - size * 1.2);
  const y = constrain(sy - Math.sin(a) * reach, size * 1.6 + 120, height - size * 1.2);

  heart = { x, y, size, born: millis(), caught: false };
  nextSide *= -1;     // el següent, a l'altre costat: es treballen els dos braços
}

function drawPlay() {
  const now = millis();
  const left = Math.max(0, CONFIG.duration - (now - playStart) / 1000);

  // compte enrere visible
  const secs = Math.ceil(left);
  const timeEl = $("hud-time");
  if (timeEl.textContent !== String(secs)) timeEl.textContent = secs;
  $("ring-fg").style.strokeDashoffset = 119.4 * (1 - left / CONFIG.duration);
  timeEl.parentElement.classList.toggle("hurry", left <= 5);

  if (left <= 0) { endGame(); return; }

  // el cor canvia de lloc si porta massa estona sense atrapar
  if (heart && now - heart.born > CONFIG.heartLife) spawnHeart();

  if (heart) {
    // línia d'ajuda des de la mà més propera
    const hands = ["left", "right"].map(handPoint).filter(Boolean);
    if (hands.length) {
      const closest = hands.reduce((a, b) => (dist(a.x, a.y, heart.x, heart.y) < dist(b.x, b.y, heart.x, heart.y) ? a : b));
      push();
      drawingContext.setLineDash([4, 14]);
      stroke(255, 255, 255, 90);
      strokeWeight(4);
      line(closest.x, closest.y, heart.x, heart.y);
      drawingContext.setLineDash([]);
      pop();
    }

    drawHeart(heart, now);

    // col·lisió mà – cor
    for (const h of hands) {
      if (dist(h.x, h.y, heart.x, heart.y) < heart.size * 1.15) { catchHeart(); break; }
    }
  }

  if (!pose || now - lastPoseAt > 600) {
    push();
    textAlign(CENTER, CENTER);
    textSize(54);
    fill(CONFIG.colors.white);
    stroke(CONFIG.colors.black);
    strokeWeight(6);
    text("No et veiem! Torna davant la càmera", width / 2, height - 80);
    pop();
  }
}

function drawHeart(hObj, now) {
  const age = (now - hObj.born) / 1000;
  const appear = constrain(age / 0.35, 0, 1);
  const beat = 1 + 0.09 * Math.sin(now / 140) * Math.sin(now / 140);
  const s = hObj.size * beat * (0.4 + 0.6 * appear);
  const bob = Math.sin(now / 500) * 6;
  push();
  translate(hObj.x, hObj.y + bob);
  // halo
  noStroke();
  fill(255, 59, 107, 45);
  circle(0, 0, s * 3.1);
  drawingContext.shadowBlur = 40;
  drawingContext.shadowColor = CONFIG.colors.pink;
  fill(CONFIG.colors.pink);
  heartShape(0, s * 0.15, s);
  drawingContext.shadowBlur = 0;
  fill(255, 255, 255, 170);
  ellipse(-s * 0.42, -s * 0.38, s * 0.32, s * 0.2);
  // anell de temps restant del cor
  noFill();
  stroke(255, 255, 255, 140);
  strokeWeight(4);
  const lifeLeft = 1 - (now - hObj.born) / CONFIG.heartLife;
  arc(0, 0, s * 2.7, s * 2.7, -HALF_PI, -HALF_PI + TWO_PI * lifeLeft);
  pop();
}

function heartShape(x, y, s) {
  beginShape();
  vertex(x, y + s * 0.7);
  bezierVertex(x - s * 1.3, y - s * 0.1, x - s * 0.6, y - s * 1.15, x, y - s * 0.45);
  bezierVertex(x + s * 0.6, y - s * 1.15, x + s * 1.3, y - s * 0.1, x, y + s * 0.7);
  endShape(CLOSE);
}

function catchHeart() {
  score++;
  Sound.pop();
  const el = $("hud-score");
  el.textContent = score;
  el.classList.remove("bump");
  void el.offsetWidth;          // reinicia l'animació CSS
  el.classList.add("bump");

  burst(heart.x, heart.y);
  floaters.push({ x: heart.x, y: heart.y, born: millis() });
  heart = null;
  setTimeout(() => { if (state === "play") spawnHeart(); }, 350);
}

/* ---------- Partícules i "+1" ---------- */
function burst(x, y) {
  for (let i = 0; i < 26; i++) {
    const a = random(TWO_PI), sp = random(3, 11);
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
      life: 1, size: random(8, 20),
      col: random() < 0.5 ? CONFIG.colors.pink : CONFIG.colors.pinkSoft,
      heart: random() < 0.35,
    });
  }
}

function drawParticles() {
  noStroke();
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.35; p.vx *= 0.98;
    p.life -= 0.025;
    const c = color(p.col);
    c.setAlpha(255 * Math.max(p.life, 0));
    fill(c);
    if (p.heart) heartShape(p.x, p.y, p.size * 0.5);
    else circle(p.x, p.y, p.size * p.life);
  }
  particles = particles.filter((p) => p.life > 0);

  const now = millis();
  for (const f of floaters) {
    const t = (now - f.born) / 900;
    push();
    textAlign(CENTER, CENTER);
    textSize(80 + t * 20);
    fill(255, 255, 255, 255 * (1 - t));
    stroke(255, 59, 107, 255 * (1 - t));
    strokeWeight(6);
    text("+1", f.x, f.y - 60 - t * 90);
    pop();
  }
  floaters = floaters.filter((f) => now - f.born < 900);
}

/* =========================================================
   FASE 4: FINAL
   ========================================================= */
function endGame() {
  state = "end";
  heart = null;
  Sound.whistle();
  show("hud", false);
  $("end-score").textContent = score;
  $("end-msg").textContent = endMessage(score);
  show("end-ui", true);
  saveBest(score);
  if (bodyPose && modelReady) { try { bodyPose.detectStop(); } catch (e) { /* ja aturat */ } }
  $("btn-finish").focus();
}

function endMessage(n) {
  if (n === 0) return "No passa res! La pròxima vegada segur que n'atrapes uns quants.";
  if (n < 6) return "Molt bé! Has mogut els braços i això ja és un gran pas.";
  if (n < 12) return "Fantàstic! Els teus braços estan ben actius avui.";
  return "Increïble! Ets un campió o una campiona del moviment!";
}

/* =========================================================
   ESDEVENIMENTS DELS BOTONS
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  renderBest();
  $("btn-start").addEventListener("click", startExercise);
  $("btn-help").addEventListener("click", () => { showScreen("screen-help"); $("screen-help").scrollTop = 0; $("btn-back").focus({ preventScroll: true }); });
  $("btn-back").addEventListener("click", goMenu);
  $("btn-go").addEventListener("click", startCountdown);
  $("btn-finish").addEventListener("click", goMenu);
  document.querySelectorAll('[data-action="menu"]').forEach((b) => b.addEventListener("click", goMenu));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("screen-menu").classList.contains("active")) goMenu();
  });
});
