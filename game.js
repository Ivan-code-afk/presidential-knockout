"use strict";
/* ПРЕЗИДЕНТСКИЙ НОКАУТ — движок файтинга на одном canvas.
 * Все времена в секундах, скорости в px/s: игра идёт одинаково на 60 и 144 Гц.
 * Пока нет спрайтов и фонов, бойцы и арены рисуются кодом (заглушки).
 * Как только в sprites.js / assets/arenas появятся картинки, движок подхватит их сам. */
(() => {
const D = window.GAME_DATA;
const SPR = window.SPRITES || {};
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = 1280, H = 720;
const FLOOR = 640;
const GRAV = 3300, JUMP_V = 1220, WALK = 290;
const WALL_L = 70, WALL_R = W - 70;
const ROUND_TIME = 60, WINS_NEEDED = 2, MAX_ROUNDS = 5;
const FONT = '"Arial Black", "Arial Bold", Arial, system-ui, sans-serif';
const GOLD = "#ffd54a", RED = "#e53935", BLUE = "#4a7cf0", WHITE = "#ffffff", INK = "#0b0f24";

/* ------------------------------------------------------------------ */
/* Утилиты                                                            */
/* ------------------------------------------------------------------ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const store = {
  get(k, d) { try { const v = localStorage.getItem("pk_" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("pk_" + k, JSON.stringify(v)); } catch (e) {} },
};

/* ------------------------------------------------------------------ */
/* Картинки: если файла нет, рисуется заглушка                        */
/* ------------------------------------------------------------------ */
const IMG = {};
function loadImg(key, src) {
  if (!src) return;
  const im = new Image();
  im.onload = () => { IMG[key] = im; };
  im.src = src;
}
for (const [id, a] of Object.entries(D.arenas)) { loadImg("arena_" + id, a.bg); loadImg("arena_" + id + "_alt", a.bgAlt); }
for (const [id, poses] of Object.entries(SPR)) for (const [pose, s] of Object.entries(poses)) loadImg(`spr_${id}_${pose}`, s.src);

/* ------------------------------------------------------------------ */
/* Звук: простые синтезированные эффекты (позже заменим на файлы)     */
/* ------------------------------------------------------------------ */
let actx = null;
let muted = store.get("muted", false);
function audioInit() {
  if (actx) { if (actx.state === "suspended") actx.resume(); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
function tone(freq, dur, type = "square", vol = 0.06, slide = 0, delay = 0) {
  if (!actx || muted) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise(dur, vol = 0.1) {
  if (!actx || muted) return;
  if (!noiseBuf) {
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = actx.createBufferSource(), g = actx.createGain(), t = actx.currentTime;
  s.buffer = noiseBuf;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(g); g.connect(actx.destination);
  s.start(t); s.stop(t + dur + 0.02);
}
const SFX = {
  hit()     { noise(0.07, 0.16); tone(170, 0.08, "square", 0.05, 0.5); },
  heavy()   { noise(0.12, 0.22); tone(110, 0.16, "sawtooth", 0.07, 0.4); },
  block()   { tone(700, 0.05, "triangle", 0.06); tone(500, 0.05, "triangle", 0.04, 1, 0.03); },
  whoosh()  { noise(0.05, 0.03); },
  jump()    { tone(300, 0.08, "triangle", 0.03, 1.6); },
  land()    { noise(0.04, 0.04); },
  special() { tone(420, 0.22, "sawtooth", 0.05, 2.2); },
  superGo() { tone(180, 0.5, "sawtooth", 0.07, 4); tone(90, 0.6, "square", 0.05, 2); },
  ko()      { tone(320, 0.7, "sawtooth", 0.08, 0.15); noise(0.3, 0.12); },
  menu()    { tone(880, 0.04, "square", 0.03); },
  ok()      { tone(660, 0.08, "square", 0.05); tone(990, 0.1, "square", 0.05, 1, 0.07); },
  back()    { tone(400, 0.08, "square", 0.04, 0.7); },
  round()   { tone(523, 0.12, "square", 0.05); tone(784, 0.2, "square", 0.05, 1, 0.13); },
  win()     { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, "square", 0.05, 1, i * 0.12)); },
  fatal()   { tone(80, 1.2, "sawtooth", 0.09, 0.5); noise(0.8, 0.1); },
};

/* ------------------------------------------------------------------ */
/* Управление: клавиатура, сенсорные кнопки, бот                      */
/* ------------------------------------------------------------------ */
const keys = new Set(), justPressed = new Set();
addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) justPressed.add(e.code);
  keys.add(e.code);
  audioInit();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => { keys.clear(); if (G.screen === "fight" && !G.paused) G.paused = true; });

const MAPS = {
  solo: { left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp", "Space"], down: ["ArrowDown"],
          punch: ["KeyA", "KeyJ"], kick: ["KeyS", "KeyK"], special: ["KeyD", "KeyL"], super: ["KeyF", "KeyI"] },
  p1:   { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"],
          punch: ["KeyF"], kick: ["KeyG"], special: ["KeyH"], super: ["KeyT"] },
  p2:   { left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"],
          punch: ["KeyJ", "Numpad1"], kick: ["KeyK", "Numpad2"], special: ["KeyL", "Numpad3"], super: ["KeyI", "Numpad4"] },
};
const ACTIONS = ["left", "right", "up", "down", "punch", "kick", "special", "super"];

const touch = { h: {}, p: {} };
const isTouch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
if (isTouch) document.body.classList.add("touch");

class Ctl {
  constructor(map, useTouch) { this.map = map; this.useTouch = useTouch; this.h = {}; this.p = {}; }
  poll() {
    for (const a of ACTIONS) {
      let h = false, p = false;
      if (this.map) for (const k of this.map[a]) { if (keys.has(k)) h = true; if (justPressed.has(k)) p = true; }
      if (this.useTouch) { if (touch.h[a]) h = true; if (touch.p[a]) p = true; }
      this.h[a] = h; this.p[a] = p;
    }
  }
}

// Сенсорный джойстик и кнопки
(function setupTouch() {
  const stick = document.getElementById("stick"), knob = document.getElementById("stickKnob");
  let sid = null;
  const setStick = (e) => {
    const r = stick.getBoundingClientRect();
    const R = r.width / 2, cx = r.left + R, cy = r.top + R;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const len = Math.hypot(dx, dy), lim = R * 0.6;
    if (len > lim) { dx = dx / len * lim; dy = dy / len * lim; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const th = R * 0.22;
    touch.h.left = dx < -th; touch.h.right = dx > th;
    touch.h.down = dy > R * 0.3;
    const up = dy < -R * 0.32;
    if (up && !touch.h.up) touch.p.up = true;
    touch.h.up = up;
  };
  const resetStick = () => { sid = null; knob.style.transform = ""; touch.h.left = touch.h.right = touch.h.up = touch.h.down = false; };
  stick.addEventListener("pointerdown", (e) => { sid = e.pointerId; stick.setPointerCapture(sid); setStick(e); audioInit(); });
  stick.addEventListener("pointermove", (e) => { if (e.pointerId === sid) setStick(e); });
  stick.addEventListener("pointerup", resetStick);
  stick.addEventListener("pointercancel", resetStick);
  document.querySelectorAll("#touch button").forEach((b) => {
    const act = b.dataset.act;
    const down = (e) => { e.preventDefault(); touch.h[act] = true; touch.p[act] = true; b.classList.add("on"); audioInit(); if (navigator.vibrate) navigator.vibrate(8); };
    const up = () => { touch.h[act] = false; b.classList.remove("on"); };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("pointerleave", up);
  });
})();

// Полный экран и горизонтальная ориентация на телефоне
function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: "hide" }).then(() => {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
  }).catch(() => {});
}
document.getElementById("goFull").addEventListener("click", () => { audioInit(); goFullscreen(); });

// Касание и клики по меню (координаты переводятся в систему 1280×720)
canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  G.click = { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  audioInit();
  if (isTouch && innerWidth > innerHeight) goFullscreen();
});

/* ------------------------------------------------------------------ */
/* Состояние игры                                                     */
/* ------------------------------------------------------------------ */
const G = {
  screen: "title", time: 0, click: null, hits: [], paused: false, pauseSel: 0,
  mode: "arcade", diff: store.get("diff", 1), menuSel: 0,
  sel: { step: 0, cur: 0, picks: [] }, arenaSel: 0,
  ladder: null, screenT: 0, msg: null,
  bossUnlocked: store.get("boss", false),
};
let F = null; // текущий бой

const DIFF_NAMES = ["EASY", "NORMAL", "HARD"];

function go(screen) { G.screen = screen; G.screenT = 0; G.menuSel = 0; document.body.classList.toggle("fighting", screen === "fight"); }

/* ------------------------------------------------------------------ */
/* Бойцы                                                              */
/* ------------------------------------------------------------------ */
const MOVES = {
  punch:  { start: 0.07, act: 0.08, rec: 0.15, dmg: 5, range: 108, hgt: "high", stun: 0.28, push: 170, meter: 8, sfx: "hit" },
  kick:   { start: 0.11, act: 0.09, rec: 0.24, dmg: 8, range: 128, hgt: "low",  stun: 0.34, push: 210, meter: 10, sfx: "heavy" },
  cpunch: { start: 0.06, act: 0.07, rec: 0.14, dmg: 4, range: 104, hgt: "low",  stun: 0.24, push: 130, meter: 6, sfx: "hit" },
  akick:  { start: 0.05, act: 0.6,  rec: 0,    dmg: 7, range: 112, hgt: "over", stun: 0.30, push: 160, meter: 8, sfx: "heavy", air: true },
};

function makeFighter(id, side, ctl, level) {
  const d = D.fighters[id];
  const maxHp = Math.round(100 * d.health);
  const f = {
    id, d, side, ctl, level, bot: level !== null && level !== undefined,
    maxHp, hp: maxHp, shownHp: maxHp, meter: 0, wins: 0,
    ai: { t: 0, hold: {} },
  };
  resetFighter(f);
  return f;
}
function resetFighter(f) {
  Object.assign(f, {
    x: f.side === 0 ? W * 0.32 : W * 0.68, y: FLOOR, vx: 0, vy: 0, face: f.side === 0 ? 1 : -1, onGround: true,
    hp: f.maxHp, shownHp: f.maxHp, st: "idle", stT: 0, atk: null, stun: 0, cd: 0, combo: 0, comboT: 0,
    inv: 0, reflectT: 0, flash: 0, walkPh: 0, airAtk: false, crouchBlock: false, crouchHurt: false, alpha: 1,
  });
  f.ai = { t: 0.4, hold: {} };
}
function setSt(f, s) { if (f.st !== s) { f.st = s; f.stT = 0; } }
function other(f) { return F.p[0] === f ? F.p[1] : F.p[0]; }
function isCrouching(f) {
  return f.st === "crouch" || (f.st === "block" && f.crouchBlock) || (f.st === "hurt" && f.crouchHurt) ||
    (f.st === "atk" && f.atk && f.atk.crouch) || (f.st === "atk" && f.atk && f.atk.type === "parry");
}
function canBlock(def, att, hgt) {
  if (!["idle", "walk", "crouch", "block"].includes(def.st) || !def.onGround) return false;
  const away = att.x > def.x ? "left" : "right";
  if (isCrouching(def)) return hgt === "low" || hgt === "mid";
  return def.ctl.h[away] && hgt !== "low";
}

function startAtk(f, kind, extra) {
  const m = MOVES[kind] || { start: 0.15, act: 0.1, rec: 0.3 };
  f.atk = Object.assign({ kind, m, t: 0, hit: false, fired: false, crouch: f.st === "crouch" || kind === "cpunch" }, extra || {});
  setSt(f, "atk");
  if (!m.air) f.vx = 0;
  SFX.whoosh();
}

function startSpecial(f) {
  const type = f.d.special.type;
  f.cd = f.d.specialCd;
  startAtk(f, "special", { type, crouch: false });
  f.atk.m = type === "parry" ? { start: 0.05, act: 0.5, rec: 0.25 }
          : type === "teleport" ? { start: 0.32, act: 0.14, rec: 0.3 }
          : { start: 0.16, act: 0.1, rec: 0.3 };
  popText(f.d.special.name, f.x, f.y - 290, WHITE, 0.9);
  SFX.special();
}

function startSuper(f) {
  f.meter = 0;
  startAtk(f, "super", { type: f.d.superMove.type, crouch: false });
  f.atk.m = { start: 0.45, act: 0.7, rec: 0.35 };
  f.inv = 0.5;
  F.superFlash = { who: f, t: 1.2 };
  F.slow = 0.35; F.slowT = 0.45;
  SFX.superGo();
}

function handleInput(f, o, c) {
  const back = f.face === 1 ? "left" : "right", fwd = f.face === 1 ? "right" : "left";
  if (f.st === "jump") {
    if ((c.p.kick || c.p.punch) && !f.airAtk) { f.airAtk = true; startAtk(f, "akick"); }
    return;
  }
  const wantSuper = c.p.super || (c.p.punch && c.h.kick) || (c.p.kick && c.h.punch);
  if (wantSuper && f.meter >= 100) { startSuper(f); return; }
  if (c.p.special && f.cd <= 0) { startSpecial(f); return; }
  if (c.p.up) {
    const dir = c.h[fwd] ? 1 : c.h[back] ? -1 : 0;
    f.vy = -JUMP_V; f.vx = dir * f.face * WALK * 1.15 * f.d.speed;
    f.onGround = false; f.airAtk = false;
    setSt(f, "jump"); SFX.jump();
    return;
  }
  if (c.h.down) {
    f.vx = 0;
    if (c.p.punch || c.p.kick) { setSt(f, "crouch"); startAtk(f, c.p.kick ? "kick" : "cpunch"); f.atk.crouch = true; return; }
    setSt(f, "crouch");
    return;
  }
  if (c.p.punch) { startAtk(f, "punch"); return; }
  if (c.p.kick) { startAtk(f, "kick"); return; }
  const dir = (c.h[fwd] ? 1 : 0) - (c.h[back] ? 1 : 0);
  f.vx = dir * f.face * WALK * f.d.speed * (dir < 0 ? 0.8 : 1);
  setSt(f, dir ? "walk" : "idle");
}

function updateFighter(f, o, dt) {
  f.flash = Math.max(0, f.flash - dt);
  f.inv = Math.max(0, f.inv - dt);
  f.reflectT = Math.max(0, f.reflectT - dt);
  f.cd = Math.max(0, f.cd - dt);
  f.comboT -= dt; if (f.comboT <= 0) f.combo = 0;
  f.stT += dt;
  f.shownHp += (f.hp - f.shownHp) * Math.min(1, dt * 3);
  if (f.alpha < 1 && !(f.st === "atk" && f.atk && f.atk.type === "teleport")) f.alpha = Math.min(1, f.alpha + dt * 4);

  const free = f.st === "idle" || f.st === "walk" || f.st === "crouch";
  if (free && f.onGround) f.face = o.x >= f.x ? 1 : -1;

  switch (f.st) {
    case "hurt": case "block":
      f.stun -= dt;
      if (f.stun <= 0) setSt(f, f.onGround ? "idle" : "jump");
      break;
    case "down":
      if (f.onGround && f.stT > 0.75) { if (f.hp <= 0) setSt(f, "ko"); else if (F.phase === "fight") setSt(f, "getup"); }
      break;
    case "getup":
      f.inv = 0.25;
      if (f.stT > 0.38) setSt(f, "idle");
      break;
    case "atk": updateAttack(f, o, dt); break;
  }

  if (F.phase === "fight" && (f.st === "idle" || f.st === "walk" || f.st === "crouch" || f.st === "jump")) handleInput(f, o, f.ctl);
  if (F.phase !== "fight" && (f.st === "walk" || f.st === "crouch")) { setSt(f, "idle"); f.vx = 0; }

  // физика
  if (!f.onGround) f.vy += GRAV * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  if (f.y >= FLOOR) {
    f.y = FLOOR;
    if (!f.onGround) {
      f.onGround = true; f.vy = 0;
      if (f.st === "jump") { setSt(f, "idle"); f.vx = 0; }
      if (f.st === "atk" && f.atk && f.atk.kind === "akick") { f.atk = null; setSt(f, "idle"); f.vx = 0; }
      if (f.st === "down") { f.vx *= 0.4; F.shake = Math.max(F.shake, 6); spawnDust(f.x); }
      SFX.land();
    }
  }
  if (f.onGround && f.st !== "walk" && !(f.st === "atk" && f.atk && f.atk.dash)) f.vx -= f.vx * Math.min(1, dt * 9);
  f.x = clamp(f.x, WALL_L, WALL_R);
  if (f.walkPh !== undefined && f.st === "walk") f.walkPh += dt * 2.2 * f.d.speed;
}

function updateAttack(f, o, dt) {
  const a = f.atk, m = a.m;
  a.t += dt;
  if (a.kind === "akick") { if (!a.hit && a.t >= m.start) tryHit(f, o, m, a); return; }
  if (a.kind === "special") { updateSpecial(f, o, dt); return; }
  if (a.kind === "super") { updateSuper(f, o, dt); return; }
  if (!a.hit && a.t >= m.start && a.t < m.start + m.act) tryHit(f, o, m, a);
  if (a.t >= m.start + m.act + m.rec) { const cr = a.crouch && f.ctl.h.down; f.atk = null; setSt(f, cr ? "crouch" : "idle"); }
}

function tryHit(f, o, m, a) {
  if (o.st === "down" || o.st === "ko" || o.inv > 0) return;
  const dx = (o.x - f.x) * f.face;
  if (dx < -20 || dx > m.range + 34) return;
  if (Math.abs(o.y - f.y) > (m.air ? 240 : 150)) return;
  if (m.air && f.y < FLOOR - 300) return;
  if (m.hgt === "high" && isCrouching(o)) return; // ушёл в присед
  a.hit = true;
  hit(f, o, {
    dmg: m.dmg, hgt: m.hgt, stun: m.stun, push: m.push, meter: m.meter, sfx: m.sfx,
    x: f.x + f.face * m.range * 0.85, y: f.y - (m.hgt === "low" ? 50 : m.air ? 120 : 165),
  });
}

function hit(att, def, h) {
  if (def.inv > 0 || def.st === "ko" || def.st === "down") return false;
  // Буш: уклон от ботинка и контрудар
  if (def.st === "atk" && def.atk && def.atk.type === "parry" && def.atk.t >= 0.05 && def.atk.t < 0.6 && !h.unparryable) {
    bushCounter(def, att);
    return false;
  }
  // Клинтон: «Я чувствую вашу боль» — урон уходит обратно
  if (def.reflectT > 0 && !h.reflected) {
    popText("REFLECTED!", def.x, def.y - 280, GOLD);
    spark(def.x, def.y - 150, "gold");
    return hit(def, att, Object.assign({}, h, { reflected: true, unparryable: true, unblockable: true, x: att.x, y: att.y - 150 }));
  }
  if (!h.unblockable && canBlock(def, att, h.hgt)) {
    def.crouchBlock = isCrouching(def);
    setSt(def, "block");
    def.stun = (h.stun || 0.25) * 0.7;
    const dirB = Math.sign(def.x - att.x) || att.face;
    def.vx = dirB * (h.push || 160) * 0.7;
    if (h.chip) def.hp = Math.max(1, def.hp - h.dmg * 0.12);
    att.meter = Math.min(100, att.meter + 3);
    def.meter = Math.min(100, def.meter + 4);
    spark(h.x ?? def.x, h.y ?? def.y - 150, "block");
    SFX.block();
    F.hitstop = 0.04;
    return false;
  }
  const scale = Math.max(0.5, 1 - att.combo * 0.1);
  const dmg = h.dmg * att.d.power * scale;
  def.hp = Math.max(0, def.hp - dmg);
  def.flash = 0.12;
  att.combo++; att.comboT = 1.1;
  if (att.combo >= 2) F.comboShow = { who: att, n: att.combo, t: 1.2 };
  att.meter = Math.min(100, att.meter + (h.meter ?? 8));
  def.meter = Math.min(100, def.meter + 5);
  const dir = Math.sign(def.x - att.x) || att.face;
  def.crouchHurt = isCrouching(def);
  def.atk = null;
  if (def.hp <= 0 || h.knock) {
    setSt(def, "down");
    def.vy = -700; def.vx = dir * 380; def.onGround = false;
  } else {
    setSt(def, "hurt");
    def.stun = h.stun || 0.3;
    def.vx = dir * (h.push || 160);
  }
  if (h.pull && def.hp > 0) { def.vx = -dir * 1100; def.stun = 0.6; popText("GET OVER HERE!", att.x, att.y - 290, GOLD, 0.8); }
  spark(h.x ?? def.x, h.y ?? def.y - 150, "hit");
  (SFX[h.sfx] || SFX.hit)();
  F.hitstop = h.knock ? 0.11 : 0.06;
  F.shake = Math.max(F.shake, h.knock ? 13 : 5);
  if (navigator.vibrate && isTouch && !def.bot) navigator.vibrate(h.knock ? 40 : 15);
  if (def.hp <= 0 && F.phase === "fight") onKO(att, def);
  return true;
}

function bushCounter(b, att) {
  popText("DODGED!", b.x, b.y - 290, GOLD);
  b.face = Math.sign(att.x - b.x) || b.face;
  b.atk = { kind: "special", type: "counter", m: { start: 0.07, act: 0.12, rec: 0.3 }, t: 0, hit: false, fired: false, crouch: false };
  setSt(b, "atk");
  b.inv = 0.25;
  F.hitstop = 0.09;
  SFX.block();
}

function updateSpecial(f, o, dt) {
  const a = f.atk, m = a.m;
  if (a.type === "teleport" && !a.fired) f.alpha = clamp(1 - a.t / 0.28, 0.08, 1);
  if (!a.fired && a.t >= m.start) { a.fired = true; fireSpecial(f, o, a.type); }
  if (a.type === "teleport" && a.fired && !a.hit && a.t >= m.start + 0.06) {
    a.hit = true;
    if (Math.abs(o.x - f.x) < 160) hit(f, o, { dmg: 12, hgt: "mid", stun: 0.4, push: 260, meter: 10, sfx: "heavy", x: o.x, y: o.y - 150 });
  }
  if (a.type === "counter" && !a.hit && a.t >= m.start) {
    a.hit = true;
    if (Math.abs(o.x - f.x) < 190) hit(f, o, { dmg: 14, hgt: "mid", knock: true, unparryable: true, unblockable: true, meter: 12, sfx: "heavy", x: o.x, y: o.y - 190 });
  }
  if (a.t >= m.start + m.act + m.rec) { f.atk = null; setSt(f, "idle"); }
}

function fireSpecial(f, o, type) {
  const x = f.x + f.face * 70;
  switch (type) {
    case "notes": addProj(f, { kind: "notes", x, y: f.y - 150, vx: f.face * 540, w: 70, h: 70, dmg: 9, hgt: "mid", stun: 0.35, push: 200, life: 2.6 }); break;
    case "fired": addProj(f, { kind: "fired", x, y: f.y - 120, vx: f.face * 800, w: 60, h: 160, dmg: 10, hgt: "mid", stun: 0.4, push: 320, life: 0.55 }); break;
    case "lasso": addProj(f, { kind: "lasso", x, y: f.y - 170, vx: f.face * 1150, w: 50, h: 44, dmg: 9, hgt: "high", stun: 0.6, push: 0, pull: true, life: 0.42, from: f }); break;
    case "ball": addProj(f, { kind: "ball", x, y: f.y - 210, vx: f.face * 560, vy: -760, g: 2000, w: 46, h: 46, dmg: 12, hgt: "over", stun: 0.4, push: 220, life: 3 }); break;
    case "teleport": {
      const side = Math.sign(o.x - f.x) || 1;
      f.x = clamp(o.x + side * 100, WALL_L, WALL_R);
      f.face = Math.sign(o.x - f.x) || -side;
      f.alpha = 1;
      spark(f.x, f.y - 150, "tv");
      break;
    }
  }
}

function updateSuper(f, o, dt) {
  const a = f.atk, m = a.m;
  if (!a.fired && a.t >= m.start) {
    a.fired = true;
    popText(f.d.superMove.name, W / 2, 230, GOLD, 1.4, 54);
    switch (a.type) {
      case "dropBanner": addProj(f, { kind: "banner", x: o.x, y: -60, vy: 1500, w: 300, h: 56, dmg: 22, hgt: "over", knock: true, life: 1.5, fall: true, meter: 0 }); break;
      case "dropWall":   addProj(f, { kind: "wall", x: o.x, y: -170, vy: 1700, w: 170, h: 300, dmg: 24, hgt: "over", knock: true, life: 1.5, fall: true, meter: 0 }); break;
      case "reflect":    f.reflectT = 3; break;
      case "wave":       addProj(f, { kind: "wave", x: f.x + f.face * 80, y: f.y - 150, vx: f.face * 950, w: 110, h: 300, dmg: 20, hgt: "mid", knock: true, chip: true, life: 1.6, meter: 0 }); break;
      case "rain":
        for (let i = 0; i < 5; i++) addProj(f, { kind: "arrow", x: clamp(o.x + rnd(-170, 170), 60, W - 60), y: -80 - i * 230, vy: 1300, w: 44, h: 96, dmg: 8, hgt: "over", life: 2.6, fall: true, meter: 0 });
        break;
      case "dash": a.dash = true; break;
    }
  }
  if (a.dash) {
    if (a.t < m.start + 0.55) {
      f.vx = f.face * 1350;
      if (!a.hit && Math.abs(o.x - f.x) < 110 && Math.abs(o.y - f.y) < 160) {
        a.hit = true;
        hit(f, o, { dmg: 24, knock: true, hgt: "mid", stun: 0.5, push: 400, meter: 0, sfx: "heavy", x: o.x, y: o.y - 170 });
      }
      if (G.time % 0.05 < 0.02) spawnDust(f.x - f.face * 30);
    } else { a.dash = false; f.vx *= 0.3; }
  }
  if (a.t >= m.start + m.act + m.rec) { f.atk = null; setSt(f, "idle"); f.vx = 0; }
}

/* ------------------------------------------------------------------ */
/* Снаряды и частицы                                                  */
/* ------------------------------------------------------------------ */
function addProj(owner, p) { p.owner = owner; p.t = 0; p.vy = p.vy || 0; p.vx = p.vx || 0; F.proj.push(p); }
function fighterBox(f) {
  const h = (f.st === "down" || f.st === "ko") ? 70 : isCrouching(f) ? 135 : 230;
  return { x: f.x - 38, y: f.y - h, w: 76, h };
}
function overlap(p, b) {
  return p.x + p.w / 2 > b.x && p.x - p.w / 2 < b.x + b.w && p.y + p.h / 2 > b.y && p.y - p.h / 2 < b.y + b.h;
}
function updateProj(dt) {
  for (const p of F.proj) {
    p.t += dt;
    if (p.g) p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > p.life || p.x < -250 || p.x > W + 250) p.dead = true;
    if (p.kind === "ball" && p.y > FLOOR - 24) { p.dead = true; spark(p.x, FLOOR - 20, "dust"); }
    if (p.fall && p.y > FLOOR - p.h / 2) { p.dead = true; spawnDust(p.x); F.shake = Math.max(F.shake, 9); SFX.heavy(); }
    if (p.dead) continue;
    const def = other(p.owner);
    if (def.st !== "down" && def.st !== "ko" && def.inv <= 0 && overlap(p, fighterBox(def))) {
      p.dead = true;
      hit(p.owner, def, Object.assign({}, p, { x: p.x, y: p.y }));
    }
  }
  // встречные снаряды гасят друг друга
  for (const a of F.proj) for (const b of F.proj) {
    if (a !== b && !a.dead && !b.dead && a.owner !== b.owner && !a.fall && !b.fall && overlap(a, { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h })) {
      a.dead = b.dead = true; spark((a.x + b.x) / 2, (a.y + b.y) / 2, "gold"); SFX.block();
    }
  }
  F.proj = F.proj.filter((p) => !p.dead);
}

function spark(x, y, kind) {
  const col = { hit: ["#fff7a8", "#ffd54a", "#ff8a3d"], block: ["#bfe3ff", "#6fb6ff", "#ffffff"], gold: ["#ffd54a", "#fff3b0"], dust: ["#cdbb9a", "#a8967a"], tv: ["#6fd3ff", "#ffffff", "#2a6fff"] }[kind] || ["#fff"];
  const n = kind === "dust" ? 8 : 14;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(120, kind === "dust" ? 260 : 560);
    F.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === "dust" ? 120 : 0), life: rnd(0.18, 0.4), t: 0, c: pick(col), s: rnd(4, 9) });
  }
}
function spawnDust(x) { spark(x, FLOOR - 6, "dust"); }
function popText(s, x, y, c = WHITE, life = 1, size = 34) { F.texts.push({ s, x: clamp(x, 160, W - 160), y, c, t: 0, life, size }); }

/* ------------------------------------------------------------------ */
/* Бот                                                                */
/* ------------------------------------------------------------------ */
const LV = [
  { react: 0.42, block: 0.2, aggr: 0.45, sup: 0.35 },
  { react: 0.26, block: 0.45, aggr: 0.6, sup: 0.65 },
  { react: 0.15, block: 0.72, aggr: 0.75, sup: 0.9 },
];
function aiUpdate(f, o, dt) {
  const c = f.ctl, L = LV[f.level], ai = f.ai;
  for (const a of ACTIONS) c.p[a] = false;
  c.h.punch = c.h.kick = c.h.special = c.h.super = c.h.up = false;
  if (F.phase !== "fight") { c.h.left = c.h.right = c.h.down = false; return; }
  const back = f.face === 1 ? "left" : "right", fwd = f.face === 1 ? "right" : "left";
  const dist = Math.abs(o.x - f.x);
  const press = (a) => { c.p[a] = true; c.h[a] = true; };
  // удар ногой в прыжке
  if (f.st === "jump" && !f.airAtk && f.vy > -250 && dist < 180 && Math.random() < 0.15 + L.aggr * 0.5) { press("kick"); return; }
  ai.t -= dt;
  if (ai.t > 0) { c.h.left = !!ai.hold.left; c.h.right = !!ai.hold.right; c.h.down = !!ai.hold.down; return; }
  ai.t = L.react * rnd(0.6, 1.4);
  ai.hold = {};
  const apply = () => { c.h.left = !!ai.hold.left; c.h.right = !!ai.hold.right; c.h.down = !!ai.hold.down; };

  const threat = F.proj.find((p) => p.owner === o && !p.fall && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - f.x) < 400)
              || F.proj.find((p) => p.owner === o && p.fall && Math.abs(p.x - f.x) < 220);
  if (threat && Math.random() < L.block + 0.1) {
    if (threat.fall || threat.hgt === "over") ai.hold[back] = true;
    else if (threat.hgt === "high") ai.hold.down = true;
    else if (Math.random() < 0.4) press("up");
    else ai.hold.down = true;
    apply(); return;
  }
  if (o.reflectT > 0 && Math.random() < L.block + 0.2) { ai.hold[back] = true; apply(); return; } // не бить в отражение
  const oAtk = o.st === "atk" && o.atk && o.atk.t < o.atk.m.start + (o.atk.m.act || 0) && o.atk.kind !== "special";
  if (oAtk && dist < 200 && Math.random() < L.block) {
    if (f.d.special.type === "parry" && f.cd <= 0 && Math.random() < 0.6) { press("special"); return; }
    if (o.atk.kind === "kick" || o.atk.kind === "cpunch") ai.hold.down = true; else ai.hold[back] = true;
    apply(); return;
  }
  if (f.meter >= 100 && dist < 430 && Math.random() < L.sup) { press("super"); return; }
  const sp = f.d.special.type;
  if (f.cd <= 0) {
    if ((sp === "notes" || sp === "ball" || sp === "fired") && dist > 260 && Math.random() < 0.45) { press("special"); return; }
    if (sp === "lasso" && dist > 200 && dist < 470 && Math.random() < 0.5) { press("special"); return; }
    if (sp === "teleport" && dist > 240 && Math.random() < 0.35) { press("special"); return; }
  }
  if (dist > 150) {
    if (Math.random() < L.aggr) {
      ai.hold[fwd] = true;
      if (dist < 320 && Math.random() < 0.14) { press("up"); c.h[fwd] = true; }
    } else if (Math.random() < 0.35) ai.hold[back] = true;
  } else {
    const r = Math.random();
    if (r < L.aggr) {
      const k = Math.random();
      if (k < 0.45) press("punch");
      else if (k < 0.8) press("kick");
      else { ai.hold.down = true; press("punch"); }
    } else if (r < L.aggr + 0.2) ai.hold[back] = true;
  }
  apply();
}

/* ------------------------------------------------------------------ */
/* Бой: раунды, нокаут, добивание                                     */
/* ------------------------------------------------------------------ */
function newFight(opts) {
  const c1 = opts.level1 == null ? new Ctl(opts.mode === "vs" ? MAPS.p1 : MAPS.solo, true) : new Ctl(null, false);
  const c2 = opts.level2 == null ? new Ctl(MAPS.p2, false) : new Ctl(null, false);
  F = {
    opts, p: [makeFighter(opts.p1, 0, c1, opts.level1), makeFighter(opts.p2, 1, c2, opts.level2)],
    arena: opts.arena, round: 1, proj: [], parts: [], texts: [],
    phase: "intro", phaseT: 0, timer: ROUND_TIME, hitstop: 0, shake: 0, slow: 1, slowT: 0,
    isBoss: !!opts.boss, altBg: false, winner: null, matchWinner: null, comboShow: null, superFlash: null, flashScreen: 0,
  };
  G.paused = false;
  go("fight");
  SFX.round();
}

function onKO(att, def) {
  F.phase = "ko"; F.phaseT = 0; F.winner = att;
  F.slow = 0.3; F.slowT = 1.0;
  SFX.ko();
}

function timeUp() {
  const [a, b] = F.p;
  const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp;
  F.winner = ra > rb ? a : rb > ra ? b : null;
  F.phase = "timeup"; F.phaseT = 0;
  SFX.ko();
}

function endRound() {
  const w = F.winner;
  if (w) w.wins++;
  if (w && w.wins >= WINS_NEEDED) {
    F.matchWinner = w;
    F.phase = "finish"; F.phaseT = 0;
    if (w.hp >= w.maxHp) popText(D.texts.perfect, W / 2, 300, GOLD, 1.6, 48);
    return;
  }
  if (F.round >= MAX_ROUNDS) {
    const [a, b] = F.p;
    F.matchWinner = a.wins > b.wins ? a : b.wins > a.wins ? b : (a.hp >= b.hp ? a : b);
    F.phase = "over"; F.phaseT = 0;
    return;
  }
  F.round++;
  for (const f of F.p) { const m = f.meter; resetFighter(f); f.meter = m; }
  F.proj = []; F.timer = ROUND_TIME; F.winner = null;
  F.phase = "intro"; F.phaseT = 0;
  SFX.round();
}

function updateFight(dt) {
  if (G.paused) return updatePause();
  if (justPressed.has("Escape") || justPressed.has("KeyP") || touch.p.pause) { G.paused = true; G.pauseSel = 0; SFX.back(); return; }
  for (const f of F.p) { if (f.bot) aiUpdate(f, other(f), dt); else f.ctl.poll(); }

  F.texts.forEach((t) => (t.t += dt));
  F.texts = F.texts.filter((t) => t.t < t.life);
  if (F.superFlash) { F.superFlash.t -= dt; if (F.superFlash.t <= 0) F.superFlash = null; }
  if (F.comboShow) { F.comboShow.t -= dt; if (F.comboShow.t <= 0) F.comboShow = null; }
  F.flashScreen = Math.max(0, F.flashScreen - dt);
  F.shake = Math.max(0, F.shake - dt * 40);

  if (F.hitstop > 0) { F.hitstop -= dt; return; }
  if (F.slowT > 0) { F.slowT -= dt; dt *= F.slow; }
  F.phaseT += dt;

  switch (F.phase) {
    case "intro":
      if (F.phaseT > 1.8) { F.phase = "fight"; F.phaseT = 0; }
      break;
    case "fight":
      F.timer -= dt;
      if (F.timer <= 0) { F.timer = 0; timeUp(); }
      break;
    case "ko": case "timeup":
      if (F.phaseT > 1.0 && F.winner && F.winner.st !== "win" && F.winner.onGround && !F.winner.atk) setSt(F.winner, "win");
      if (F.phaseT > 2.2) endRound();
      break;
    case "finish": {
      const w = F.matchWinner, l = other(w);
      if (l.st !== "ko" && l.st !== "down") { setSt(l, "lose"); l.vx = 0; }
      const press = w.bot ? (F.phaseT > 0.9 && Math.random() < 0.02) : (w.ctl.p.special || w.ctl.p.super);
      if (press) { F.phase = "fatality"; F.phaseT = 0; SFX.fatal(); F.flashScreen = 0.5; }
      else if (F.phaseT > 2.6) { F.phase = "over"; F.phaseT = 0; SFX.win(); }
      break;
    }
    case "fatality":
      if (F.phaseT > 4.2) { F.phase = "over"; F.phaseT = 0; SFX.win(); }
      break;
    case "over":
      if (F.phaseT > 0.6 && F.matchWinner.st !== "win") setSt(F.matchWinner, "win");
      if (F.phaseT > 2.6) finishMatch();
      break;
  }

  updateFighter(F.p[0], F.p[1], dt);
  updateFighter(F.p[1], F.p[0], dt);

  // бойцы не проходят друг сквозь друга
  const [a, b] = F.p;
  const dashing = (f) => f.st === "atk" && f.atk && f.atk.dash;
  if (a.onGround && b.onGround && !dashing(a) && !dashing(b) && a.st !== "down" && b.st !== "down" && a.st !== "ko" && b.st !== "ko") {
    const dx = b.x - a.x, minD = 78;
    if (Math.abs(dx) < minD) {
      const push = (minD - Math.abs(dx)) / 2, s = dx >= 0 ? 1 : -1;
      a.x = clamp(a.x - s * push, WALL_L, WALL_R); b.x = clamp(b.x + s * push, WALL_L, WALL_R);
    }
  }
  updateProj(dt);
  for (const p of F.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; }
  F.parts = F.parts.filter((p) => p.t < p.life);

  // Босс: на половине здоровья кабинет превращается в студию
  if (F.isBoss && !F.altBg && F.p[1].hp < F.p[1].maxHp * 0.5) {
    F.altBg = true; F.flashScreen = 0.6;
    popText(D.texts.adBreak, W / 2, 260, "#6fd3ff", 2, 56);
    SFX.special();
  }
}

function finishMatch() {
  const humanWon = F.matchWinner === F.p[0];
  if (F.opts.mode === "arcade") {
    if (humanWon) {
      G.ladder.idx++;
      if (G.ladder.idx >= G.ladder.list.length) {
        G.newUnlock = !G.bossUnlocked && G.ladder.pid !== "rating";
        G.bossUnlocked = true; store.set("boss", true);
        go("ending");
      } else go("ladder");
    } else go("continue");
  } else {
    G.lastWinner = F.matchWinner;
    go("result");
  }
}

function updatePause() {
  const n = nav();
  const items = ["RESUME", "SOUND: " + (muted ? "OFF" : "ON"), "QUIT TO MENU"];
  if (n.up) { G.pauseSel = (G.pauseSel + items.length - 1) % items.length; SFX.menu(); }
  if (n.down) { G.pauseSel = (G.pauseSel + 1) % items.length; SFX.menu(); }
  const choose = (i) => {
    if (i === 0) { G.paused = false; SFX.ok(); }
    if (i === 1) { muted = !muted; store.set("muted", muted); SFX.ok(); }
    if (i === 2) { G.paused = false; go("title"); SFX.back(); }
  };
  if (n.click !== null) choose(n.click);
  else if (n.ok) choose(G.pauseSel);
  else if (n.back || touch.p.pause) { G.paused = false; }
}

/* ------------------------------------------------------------------ */
/* Меню                                                               */
/* ------------------------------------------------------------------ */
function nav() {
  const jp = (...c) => c.some((k) => justPressed.has(k));
  let click = null;
  if (G.click) for (const h of G.hits) if (G.click.x >= h.x && G.click.x <= h.x + h.w && G.click.y >= h.y && G.click.y <= h.y + h.h) { click = h.i; break; }
  return {
    up: jp("ArrowUp", "KeyW"), down: jp("ArrowDown", "KeyS"), left: jp("ArrowLeft", "KeyA"), right: jp("ArrowRight", "KeyD"),
    ok: jp("Enter", "Space", "KeyJ", "KeyF", "NumpadEnter"), back: jp("Escape", "Backspace"),
    any: justPressed.size > 0 || !!G.click, click, tapped: !!G.click,
  };
}

function makeLadder(pid) {
  const others = D.roster.filter((id) => id !== pid && !D.fighters[id].boss);
  let opps = [];
  while (opps.length < D.arcade.tours.length) opps = opps.concat(shuffle(others));
  opps.length = D.arcade.tours.length;
  const list = D.arcade.tours.map((tour, i) => ({
    opp: opps[i], tour,
    arena: pick(Object.keys(D.arenas).filter((k) => D.arenas[k].tour === tour)),
    level: clamp(D.arcade.levels[i] + G.diff - 1, 0, 2),
  }));
  const b = D.arcade.boss;
  list.push({ opp: b.fighter, arena: b.arena, level: clamp(b.level + G.diff - 1, 1, 2), tour: 4, boss: true });
  return { pid, list, idx: 0 };
}

function startLadderFight() {
  const L = G.ladder, s = L.list[L.idx];
  newFight({ mode: "arcade", p1: L.pid, p2: s.opp, arena: s.arena, level1: null, level2: s.level, boss: !!s.boss });
}

function rosterVisible() { return D.roster; }
function locked(id) { return D.fighters[id].boss && !G.bossUnlocked; }

function updateMenus(dt) {
  G.screenT += dt;
  const n = nav();
  switch (G.screen) {
    case "title":
      if (G.screenT > 0.3 && n.any) { go("mode"); SFX.ok(); }
      break;
    case "mode": {
      const items = 5;
      if (n.up) { G.menuSel = (G.menuSel + items - 1) % items; SFX.menu(); }
      if (n.down) { G.menuSel = (G.menuSel + 1) % items; SFX.menu(); }
      let choice = n.click !== null ? n.click : n.ok ? G.menuSel : null;
      if ((n.left || n.right) && G.menuSel === 3) choice = 3;
      if (n.back) { go("title"); SFX.back(); }
      if (choice === 0 || choice === 1 || choice === 2) {
        G.mode = ["arcade", "cpu", "vs"][choice];
        G.sel = { step: 0, cur: 0, picks: [] };
        go("select"); SFX.ok();
      } else if (choice === 3) {
        G.diff = n.left ? (G.diff + 2) % 3 : (G.diff + 1) % 3; store.set("diff", G.diff); SFX.menu(); G.menuSel = 3;
      } else if (choice === 4) {
        muted = !muted; store.set("muted", muted); SFX.ok(); G.menuSel = 4;
      }
      break;
    }
    case "select": {
      const R = rosterVisible(), s = G.sel;
      if (n.left) { s.cur = (s.cur + R.length - 1) % R.length; SFX.menu(); }
      if (n.right) { s.cur = (s.cur + 1) % R.length; SFX.menu(); }
      if (n.up || n.down) { s.cur = (s.cur + 3) % R.length; SFX.menu(); }
      let choose = null;
      if (n.click !== null && n.click >= 0) { s.cur = n.click; choose = n.click; }
      else if (n.ok) choose = s.cur;
      if (n.back || n.click === -99) {
        if (s.step > 0) { s.step--; s.picks.pop(); SFX.back(); } else { go("mode"); SFX.back(); }
      } else if (choose !== null) {
        const id = R[choose];
        if (locked(id)) { SFX.back(); break; }
        s.picks.push(id); SFX.ok();
        const need = G.mode === "arcade" ? 1 : 2;
        if (s.picks.length >= need) {
          if (G.mode === "arcade") { G.ladder = makeLadder(s.picks[0]); go("ladder"); }
          else { G.arenaSel = 0; go("arena"); }
        } else { s.step++; s.cur = (choose + 1) % R.length; }
      }
      break;
    }
    case "arena": {
      const ids = Object.keys(D.arenas), count = ids.length + 1;
      if (n.up) { G.arenaSel = (G.arenaSel + count - 1) % count; SFX.menu(); }
      if (n.down) { G.arenaSel = (G.arenaSel + 1) % count; SFX.menu(); }
      if (n.left) { G.arenaSel = (G.arenaSel + count - 5) % count; SFX.menu(); }
      if (n.right) { G.arenaSel = (G.arenaSel + 5) % count; SFX.menu(); }
      let choose = n.click !== null && n.click >= 0 ? n.click : n.ok ? G.arenaSel : null;
      if (n.back || n.click === -99) { G.sel.picks.pop(); go("select"); G.sel.step = G.sel.picks.length; SFX.back(); break; }
      if (choose !== null) {
        const arena = choose === ids.length ? pick(ids) : ids[choose];
        G.pending = { mode: G.mode, p1: G.sel.picks[0], p2: G.sel.picks[1], arena,
          level1: null, level2: G.mode === "cpu" ? G.diff : null };
        go("vs"); SFX.ok();
      }
      break;
    }
    case "ladder":
      if (n.back) { go("title"); SFX.back(); break; }
      if (G.screenT > 0.4 && (n.ok || n.tapped)) {
        const s = G.ladder.list[G.ladder.idx];
        G.pending = { mode: "arcade", p1: G.ladder.pid, p2: s.opp, arena: s.arena, level1: null, level2: s.level, boss: !!s.boss };
        go("vs"); SFX.ok();
      }
      break;
    case "vs":
      if (G.screenT > 2.4 || (G.screenT > 0.6 && (n.ok || n.tapped))) newFight(G.pending);
      break;
    case "continue":
      if (n.up || n.down || n.left || n.right) { G.menuSel = 1 - G.menuSel; SFX.menu(); }
      {
        const c = n.click !== null ? n.click : n.ok ? G.menuSel : null;
        if (c === 0) { startLadderFight(); }
        if (c === 1 || n.back) { go("title"); SFX.back(); }
      }
      break;
    case "result": {
      const items = 3;
      if (n.up) { G.menuSel = (G.menuSel + items - 1) % items; SFX.menu(); }
      if (n.down) { G.menuSel = (G.menuSel + 1) % items; SFX.menu(); }
      const c = n.click !== null ? n.click : n.ok ? G.menuSel : null;
      if (c === 0) newFight(F.opts);
      if (c === 1) { G.sel = { step: 0, cur: 0, picks: [] }; go("select"); SFX.ok(); }
      if (c === 2 || n.back) { go("title"); SFX.back(); }
      break;
    }
    case "ending":
      if (G.screenT > 1.2 && n.any) { go("title"); SFX.ok(); }
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Рисование: бойцы-заглушки                                          */
/* ------------------------------------------------------------------ */
function poseOf(f) {
  const p = { key: "idle", cr: 0, lean: 0, arms: "guard", legs: "stand", lying: 0, bob: Math.sin(G.time * 4 + f.side) * 2 };
  const a = f.atk;
  switch (f.st) {
    case "walk": p.key = "walk_" + (1 + (Math.floor(f.walkPh * 4) % 4)); p.legs = "walk"; break;
    case "crouch": p.key = "crouch"; p.cr = 1; break;
    case "jump": p.key = "jump"; p.legs = "tuck"; break;
    case "block": p.key = f.crouchBlock ? "crouch_block" : "block"; p.arms = "block"; p.cr = f.crouchBlock ? 1 : 0; p.lean = -0.15; break;
    case "hurt": p.key = "hurt"; p.arms = "flail"; p.lean = -0.35; p.cr = f.crouchHurt ? 0.8 : 0; break;
    case "down": p.key = f.onGround ? "ko" : "fall"; p.lying = f.onGround ? 1 : clamp(f.stT / 0.3, 0, 1); p.arms = "flail"; break;
    case "ko": p.key = "ko"; p.lying = 1; p.arms = "down"; break;
    case "getup": p.key = "getup"; p.cr = 0.7; p.arms = "down"; break;
    case "win": p.key = "win"; p.arms = "up"; break;
    case "lose": p.key = "lose"; p.cr = 0.75; p.arms = "down"; p.lean = 0.35; break;
    case "atk": {
      const inStart = a.t < a.m.start;
      if (a.kind === "punch") { p.key = inStart ? "punch_0" : "punch"; p.arms = inStart ? "wind" : "punch"; p.lean = inStart ? -0.1 : 0.2; }
      else if (a.kind === "kick") { p.key = a.crouch ? "ckick" : "kick"; p.legs = inStart ? "stand" : "kick"; p.cr = a.crouch ? 1 : 0; p.lean = -0.15; }
      else if (a.kind === "cpunch") { p.key = "cpunch"; p.cr = 1; p.arms = inStart ? "guard" : "punch"; }
      else if (a.kind === "akick") { p.key = "akick"; p.legs = "akick"; p.arms = "block"; }
      else if (a.kind === "special") {
        p.key = "special";
        if (a.type === "parry") { p.cr = 0.55; p.lean = -0.45; p.arms = "guard"; p.key = "parry"; }
        else if (a.type === "counter") { p.arms = "upper"; p.lean = 0.25; p.key = "counter"; }
        else if (a.type === "ball") p.arms = inStart ? "chest" : "shoot";
        else if (a.type === "fired") p.arms = inStart ? "wind" : "point";
        else if (a.type === "lasso") p.arms = inStart ? "twirl" : "point";
        else p.arms = "cast";
      } else if (a.kind === "super") {
        p.key = "super";
        if (a.type === "dash") { p.arms = "side"; p.lean = 0.35; p.legs = "walk"; }
        else if (a.type === "reflect") p.arms = "heart";
        else p.arms = inStart ? "up" : "cast";
      }
      break;
    }
  }
  return p;
}

function drawFighter(f) {
  const shadowK = clamp(1 - (FLOOR - f.y) / 500, 0.3, 1);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 3, 58 * shadowK, 11 * shadowK, 0, 0, Math.PI * 2); ctx.fill();

  const pose = poseOf(f);
  ctx.save();
  ctx.translate(Math.round(f.x), Math.round(f.y));
  ctx.globalAlpha = f.alpha;
  ctx.scale(f.face, 1);
  const set = SPR[f.id];
  const key = set && set[pose.key] ? pose.key : set && set.idle ? "idle" : null;
  const img = key && IMG[`spr_${f.id}_${key}`];
  if (img) {
    const s = set[key], k = s.scale || 1;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -s.ax * k, -s.ay * k, img.width * k, img.height * k);
    if (f.flash > 0) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5; ctx.drawImage(img, -s.ax * k, -s.ay * k, img.width * k, img.height * k); }
  } else {
    drawDummy(f.d, pose, f.flash > 0, f.st === "walk" ? f.walkPh : 0);
  }
  ctx.restore();

  if (f.reflectT > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(G.time * 12);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 120, 80, 140, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

// Боец-заглушка: простая фигура в цветах персонажа. Нос/лицо всегда смотрят в +x.
function drawDummy(d, p, flash, walkPh) {
  const C = d.colors, L = d.look || {};
  const col = (c) => (flash ? "#ffffff" : c);
  const cr = p.cr;
  ctx.save();
  if (p.lying) { ctx.translate(0, -26 * p.lying); ctx.rotate(-Math.PI / 2 * p.lying); }
  const hipY = -100 + 42 * cr, shY = -178 + 58 * cr + p.bob, headY = shY - 40;
  const lx = p.lean * 46;
  // ноги
  let bf = [-24, 0], ff = [24, 0];
  if (p.legs === "walk") { const s = Math.sin(walkPh * Math.PI * 2) * 26; bf = [-14 - s, 0]; ff = [14 + s, 0]; }
  if (p.legs === "tuck") { bf = [-18, hipY + 48]; ff = [20, hipY + 40]; }
  if (p.legs === "kick") { ff = [112, cr ? -14 : -62]; bf = [-34, 0]; }
  if (p.legs === "akick") { ff = [92, hipY + 72]; bf = [-14, hipY + 46]; }
  if (cr > 0.5 && p.legs === "stand") { bf = [-38, 0]; ff = [36, 0]; }
  const leg = (foot, knOff) => {
    const kx = (foot[0] + 0) / 2 + knOff, ky = (hipY + foot[1]) / 2 - 6 + cr * 10;
    ctx.strokeStyle = col(C.pants); ctx.lineWidth = 21; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(foot[0] > 0 ? 9 : -9, hipY); ctx.lineTo(kx, ky); ctx.lineTo(foot[0], foot[1] - 6); ctx.stroke();
    ctx.fillStyle = col(C.shoes); ctx.fillRect(foot[0] - 12, foot[1] - 12, 30, 12);
  };
  // руки
  const hands = {
    guard: [[22, shY + 22], [40, shY + 6]], wind: [[16, shY + 24], [-14, shY + 18]], punch: [[20, shY + 22], [112, shY + 8]],
    block: [[34, shY - 4], [30, shY + 12]], up: [[-24, shY - 74], [26, shY - 78]], flail: [[-54, shY - 30], [44, shY - 42]],
    down: [[-10, hipY + 10], [14, hipY + 12]], cast: [[72, shY + 12], [66, shY + 28]], chest: [[24, shY + 30], [34, shY + 30]],
    shoot: [[60, shY - 60], [70, shY - 70]], point: [[16, shY + 30], [118, shY - 2]], twirl: [[16, shY + 30], [20, shY - 80]],
    side: [[-10, shY + 30], [116, shY + 4]], upper: [[18, shY + 20], [60, shY - 90]], heart: [[22, shY + 26], [70, shY + 4]],
  }[p.arms] || [[22, shY + 22], [40, shY + 6]];
  const arm = (sx, h) => {
    ctx.strokeStyle = col(C.shirt); ctx.lineWidth = 15; ctx.lineCap = "round";
    const ex = (sx + h[0] + lx) / 2 - 6, ey = (shY + 10 + h[1]) / 2 + 10;
    ctx.beginPath(); ctx.moveTo(sx + lx, shY + 10); ctx.lineTo(ex, ey); ctx.lineTo(h[0] + lx * 0.5, h[1]); ctx.stroke();
    ctx.fillStyle = col(C.skin); ctx.beginPath(); ctx.arc(h[0] + lx * 0.5, h[1], 9, 0, Math.PI * 2); ctx.fill();
  };
  arm(-16, hands[0]);
  leg(bf, -8);
  // торс
  ctx.fillStyle = col(C.shirt);
  roundRect(lx * 0.6 - 30, shY - 4, 60, hipY - shY + 14, 12); ctx.fill();
  if (L.tie) {
    ctx.fillStyle = col(L.tie);
    ctx.fillRect(lx * 0.6 + 4, shY + 4, 9, L.longTie ? hipY - shY + 14 : (hipY - shY) * 0.65);
    if (!flash && (d.colors.shirt !== "#f2f2f2")) { ctx.fillStyle = "#f4f4f4"; ctx.fillRect(lx * 0.6 - 4, shY - 2, 18, 8); }
  }
  if (L.bolo) { ctx.fillStyle = col("#f4f4f4"); ctx.fillRect(lx * 0.6 - 6, shY - 2, 22, 30); ctx.fillStyle = col("#c9a227"); ctx.fillRect(lx * 0.6 + 3, shY + 10, 6, 6); }
  if (L.belt || L.champBelt) { ctx.fillStyle = col(L.champBelt ? "#d4a017" : L.belt); ctx.fillRect(lx * 0.6 - 31, hipY - 4, 62, L.champBelt ? 16 : 8); }
  if (L.sax) { ctx.fillStyle = col("#e0b33a"); ctx.save(); ctx.translate(lx * 0.6 + 14, shY + 34); ctx.rotate(0.35); ctx.fillRect(-4, -26, 9, 52); ctx.beginPath(); ctx.arc(4, 28, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  if (L.lasso && p.arms !== "point" && p.arms !== "twirl") { ctx.strokeStyle = col("#d9a54a"); ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(hands[1][0] + lx * 0.5, hands[1][1] + 26, 14, 24, 0, 0, Math.PI * 2); ctx.stroke(); }
  leg(ff, 10);
  // голова
  const hx = lx + 4;
  if (L.tvHead) {
    ctx.fillStyle = col("#2b2b2b"); roundRect(hx - 40, headY - 36, 80, 66, 8); ctx.fill();
    ctx.fillStyle = col("#6fd3ff"); ctx.fillRect(hx - 30, headY - 27, 60, 46);
    ctx.strokeStyle = col("#ff3b3b"); ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(hx - 26, headY + 10); ctx.lineTo(hx - 10, headY - 4); ctx.lineTo(hx + 4, headY + 4); ctx.lineTo(hx + 26, headY - 20); ctx.stroke();
    ctx.strokeStyle = col("#888"); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hx - 10, headY - 36); ctx.lineTo(hx - 24, headY - 58); ctx.moveTo(hx + 10, headY - 36); ctx.lineTo(hx + 26, headY - 60); ctx.stroke();
  } else {
    ctx.fillStyle = col(C.skin); ctx.beginPath(); ctx.arc(hx, headY, 30, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col(C.hair);
    if (d.colors.hair === "#f2c94c") { // пышная зачёсанная причёска
      ctx.beginPath(); ctx.ellipse(hx - 4, headY - 22, 36, 16, -0.15, Math.PI, Math.PI * 2.05); ctx.fill();
      ctx.fillRect(hx - 34, headY - 24, 10, 22);
    } else {
      ctx.beginPath(); ctx.arc(hx, headY - 4, 31, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      ctx.fillRect(hx - 31, headY - 6, 12, 16);
    }
    // лицо
    ctx.fillStyle = col("#1a1a1a"); ctx.fillRect(hx + 12, headY - 6, 5, 6); ctx.fillRect(hx + 24, headY - 6, 4, 6);
    ctx.fillStyle = col("#7a2e22"); ctx.fillRect(hx + 12, headY + 12, 14, 3);
    if (L.shades) { ctx.fillStyle = col("#111"); ctx.fillRect(hx - 6, headY - 26, 34, 8); }
    if (L.hat) {
      ctx.fillStyle = col(L.hat);
      ctx.beginPath(); ctx.ellipse(hx, headY - 24, 46, 9, 0, 0, Math.PI * 2); ctx.fill();
      roundRect(hx - 24, headY - 52, 48, 30, 8); ctx.fill();
      ctx.fillStyle = col("#7a5a3a"); ctx.fillRect(hx - 24, headY - 30, 48, 5);
    }
  }
  arm(16, hands[1]);
  if (L.watch && !flash) { ctx.fillStyle = "#c0c0c0"; ctx.fillRect(hands[0][0] + lx * 0.5 - 6, hands[0][1] - 18, 10, 6); }
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Маленькая голова-портрет для меню и рам в Овальном кабинете
function drawPortrait(id, x, y, size, dim) {
  const set = SPR[id], img = set && set.portrait && IMG[`spr_${id}_portrait`];
  ctx.save();
  if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, x, y, size, size); }
  else {
    ctx.translate(x + size / 2, y + size * 2.14);
    const k = size / 120; ctx.scale(k, k);
    drawDummy(D.fighters[id], { cr: 0, lean: 0, arms: "down", legs: "stand", lying: 0, bob: 0 }, false, 0);
  }
  ctx.restore();
  if (dim) { ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x, y, size, size); }
}

/* ------------------------------------------------------------------ */
/* Рисование: арены-заглушки                                          */
/* ------------------------------------------------------------------ */
function grad(y0, y1, stops) { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); return g; }
function sky(stops) { ctx.fillStyle = grad(0, FLOOR, stops); ctx.fillRect(0, 0, W, FLOOR); }
function ground(c1, c2) { ctx.fillStyle = grad(FLOOR - 10, H, [c1, c2]); ctx.fillRect(0, FLOOR - 10, W, H - FLOOR + 10); }
function crowd(y, rows, cols, palette, t) {
  for (let r = 0; r < rows; r++) for (let i = 0; i < cols; i++) {
    const x = (i + (r % 2) * 0.5) * (W / cols), yy = y + r * 26 + Math.sin(G.time * 6 + i * 1.7 + r) * (t || 2);
    ctx.fillStyle = palette[(i * 7 + r * 3) % palette.length];
    ctx.fillRect(x, yy, 16, 22); ctx.beginPath(); ctx.arc(x + 8, yy - 5, 7, 0, Math.PI * 2); ctx.fill();
  }
}
function ferris(cx, cy, r) {
  ctx.save(); ctx.strokeStyle = "#e8e2d0"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const rot = G.time * 0.15;
  for (let i = 0; i < 12; i++) {
    const a = rot + i * Math.PI / 6, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = ["#e74c3c", "#f1c40f", "#3498db", "#2ecc71"][i % 4]; ctx.fillRect(x - 10, y, 20, 16);
  }
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - 70, FLOOR - 10); ctx.moveTo(cx, cy); ctx.lineTo(cx + 70, FLOOR - 10); ctx.stroke();
  ctx.restore();
}
function ropes(colors) {
  colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(30, FLOOR - 150 + i * 42, W - 60, 6); });
  ctx.fillStyle = "#bbb"; ctx.fillRect(22, FLOOR - 170, 16, 170); ctx.fillRect(W - 38, FLOOR - 170, 16, 170);
}
function label(s, x, y, size, color) { ctx.font = `${size}px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = color; ctx.fillText(s, x, y); }

const THEMES = {
  fair() {
    sky(["#3b2a6b", "#c4527a", "#ffb067"]);
    ctx.fillStyle = "#4f6b3a"; ctx.beginPath(); ctx.ellipse(300, FLOOR - 20, 520, 90, 0, Math.PI, 0); ctx.ellipse(1000, FLOOR - 20, 480, 70, 0, Math.PI, 0); ctx.fill();
    ferris(1010, 300, 170);
    ctx.fillStyle = "#f4e3b5"; ctx.fillRect(120, 420, 260, 200); ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.moveTo(100, 420); ctx.lineTo(250, 340); ctx.lineTo(400, 420); ctx.fill();
    ctx.fillStyle = "#ffe08a"; ctx.beginPath(); ctx.ellipse(250, 540, 60, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(205, 560, 10, 36); ctx.fillRect(285, 560, 10, 36);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = "#d9b45a"; ctx.fillRect(470 + i * 80, FLOOR - 52, 64, 42); ctx.fillStyle = "#b8923e"; ctx.fillRect(470 + i * 80, FLOOR - 40, 64, 4); }
    ground("#8b6a3e", "#5e4527");
  },
  texas() {
    sky(["#2f77c9", "#7fb8ec", "#d8ecff"]);
    ferris(1050, 280, 160);
    ctx.fillStyle = "#3a5fa8"; ctx.fillRect(180, 240, 70, 230); ctx.fillStyle = "#c62828"; ctx.fillRect(180, 240, 70, 90);
    ctx.fillStyle = "#e8a97c"; ctx.beginPath(); ctx.arc(215, 200, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f5f0e0"; ctx.beginPath(); ctx.ellipse(215, 172, 80, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(185, 128, 60, 44);
    ctx.fillStyle = "#3a5fa8"; ctx.fillRect(185, 470, 28, 150); ctx.fillRect(222, 470, 28, 150);
    ["#e74c3c", "#f39c12", "#16a085"].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(420 + i * 170, 480, 150, 100); ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(450 + i * 170, 585, 16, 0, 7); ctx.arc(540 + i * 170, 585, 16, 0, 7); ctx.fill(); });
    ground("#a07c4c", "#6e5230");
  },
  carnival() {
    sky(["#1d1440", "#4a2a7a", "#a85a8a"]);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? "#f5f5f5" : "#d63031"; ctx.beginPath(); ctx.moveTo(380 + i * 60, 260); ctx.lineTo(410 + i * 60, 160); ctx.lineTo(440 + i * 60, 260); ctx.fill(); }
    ctx.fillStyle = "#f6e58d"; ctx.fillRect(380, 260, 540, 20); ctx.fillStyle = "#2d1b4e"; ctx.fillRect(400, 280, 500, 260);
    for (let i = 0; i < 6; i++) { const y = 470 + Math.sin(G.time * 2 + i) * 18; ctx.fillStyle = ["#fff", "#f9ca24", "#e17055"][i % 3]; ctx.fillRect(430 + i * 80, y, 40, 26); ctx.fillStyle = "#ccc"; ctx.fillRect(448 + i * 80, 300, 4, y - 300); }
    ctx.fillStyle = "#6c5ce7"; ctx.fillRect(60, 380, 230, 240); ctx.fillStyle = "#ffeaa7"; ctx.fillRect(80, 410, 190, 70);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = "#a0522d"; ctx.fillRect(90 + i * 36, 440, 24, 30); }
    for (let i = 0; i < 18; i++) { ctx.fillStyle = `hsl(${i * 40},90%,65%)`; ctx.beginPath(); ctx.arc(70 + i * 68, 120 + Math.sin(i) * 20, 5 + (Math.sin(G.time * 5 + i) > 0 ? 2 : 0), 0, 7); ctx.fill(); }
    ground("#3f6b2a", "#25411a");
  },
  boxing() {
    sky(["#05060d", "#151933", "#1c2142"]);
    crowd(330, 6, 40, ["#2c3e50", "#34495e", "#5d6d7e", "#7f8c8d", "#922b21"]);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = "rgba(255,255,220,.07)"; ctx.beginPath(); ctx.moveTo(200 + i * 300, 0); ctx.lineTo(120 + i * 300, FLOOR); ctx.lineTo(320 + i * 300, FLOOR); ctx.fill(); }
    ctx.fillStyle = "#111"; ctx.fillRect(500, 40, 280, 110); ctx.fillStyle = "#ff3b3b"; label("12 : 00", 640, 115, 48, "#ff3b3b");
    ropes(["#c0392b", "#f5f5f5", "#2e5cb8"]);
    ground("#d9d2c0", "#a59d88");
  },
  wrestling() {
    sky(["#020208", "#0f1235", "#251a4a"]);
    crowd(250, 9, 46, ["#4a4a6a", "#6a3a5a", "#2a4a6a", "#8a7a3a", "#5a5a5a"], 4);
    for (let i = 0; i < 2; i++) { const x = i ? 1100 : 180, f = 60 + Math.sin(G.time * 18) * 20; ctx.fillStyle = "#ff8f1f"; ctx.beginPath(); ctx.moveTo(x - 25, FLOOR - 170); ctx.lineTo(x, FLOOR - 170 - f); ctx.lineTo(x + 25, FLOOR - 170); ctx.fill(); }
    ctx.fillStyle = "#222"; ctx.fillRect(40, FLOOR - 120, 260, 110); ctx.fillStyle = "#444"; ctx.fillRect(40, FLOOR - 120, 260, 14);
    ropes(["#f1c40f", "#e74c3c", "#f1c40f"]);
    ground("#2a4fa8", "#1a3170");
  },
  vegas() {
    sky(["#05030f", "#1a0b2e", "#3a1046"]);
    const neon = [["#ff4fd8", 120, 140, 260, 80], ["#4ff3ff", 470, 90, 340, 90], ["#ffe14f", 900, 150, 260, 80]];
    for (const [c, x, y, w, h] of neon) { ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.shadowColor = c; ctx.shadowBlur = 18 + Math.sin(G.time * 8 + x) * 6; ctx.strokeRect(x, y, w, h); }
    ctx.shadowBlur = 0;
    for (let i = 0; i < 7; i++) { ctx.fillStyle = "#3b3b4f"; ctx.fillRect(80 + i * 170, 420, 110, 190); ctx.fillStyle = "#111"; ctx.fillRect(95 + i * 170, 450, 80, 40); ctx.fillStyle = ["#e74c3c", "#f1c40f", "#2ecc71"][(i + Math.floor(G.time * 4)) % 3]; ctx.fillRect(105 + i * 170, 458, 18, 24); ctx.fillRect(127 + i * 170, 458, 18, 24); ctx.fillRect(149 + i * 170, 458, 18, 24); }
    ground("#7a1020", "#3d0810");
  },
  tvshow() {
    sky(["#0a1030", "#14205a", "#1f2f7a"]);
    for (let i = 0; i < 16; i++) { ctx.fillStyle = "#0d1640"; const h = 120 + (i * 37) % 160; ctx.fillRect(i * 82, FLOOR - 200 - h, 70, h); ctx.fillStyle = "#ffd76a"; for (let j = 0; j < h / 30; j++) if ((i + j) % 3) ctx.fillRect(i * 82 + 12, FLOOR - 190 - h + j * 30, 10, 12); }
    ctx.fillStyle = "#3a2a1a"; ctx.fillRect(900, 470, 300, 140); ctx.fillStyle = "#5a4028"; ctx.fillRect(890, 460, 320, 20);
    ctx.fillStyle = "#7a2030"; roundRect(60, 500, 230, 90, 20); ctx.fill();
    const on = Math.sin(G.time * 3) > 0;
    ctx.fillStyle = on ? "#ff2a2a" : "#5a1010"; ctx.fillRect(520, 40, 240, 70); label("APPLAUSE", 640, 90, 34, on ? "#fff" : "#999");
    ground("#6b4a2a", "#3e2a16");
  },
  ballroom() {
    sky(["#3a2410", "#7a5226", "#b78a4a"]);
    for (let i = 0; i < 3; i++) { const x = 250 + i * 390; ctx.fillStyle = "#ffe9a8"; ctx.beginPath(); ctx.arc(x, 110, 46, 0, 7); ctx.fill(); for (let j = 0; j < 8; j++) { ctx.fillStyle = "#fff6d0"; ctx.beginPath(); ctx.arc(x + Math.cos(j) * 60, 130 + Math.sin(j) * 14, 6, 0, 7); ctx.fill(); } ctx.fillStyle = "#c9a227"; ctx.fillRect(x - 2, 0, 4, 70); }
    for (let i = 0; i < 6; i++) { ctx.fillStyle = "#f4f1ea"; ctx.beginPath(); ctx.ellipse(110 + i * 215, 540, 80, 22, 0, 0, 7); ctx.fill(); ctx.fillRect(40 + i * 215, 540, 140, 50); }
    ctx.fillStyle = "#5a3a1a"; ctx.fillRect(590, 380, 100, 140); ctx.fillStyle = "#c9a227"; ctx.beginPath(); ctx.arc(640, 430, 22, 0, 7); ctx.fill();
    ground("#8a5a2a", "#4a2e12");
  },
  oval(alt) {
    // изогнутая стена
    ctx.fillStyle = alt ? "#1a2240" : "#efe2c4"; ctx.fillRect(0, 0, W, FLOOR);
    ctx.fillStyle = alt ? "#141b34" : "#e3d3ae"; for (let i = 0; i < 14; i++) ctx.fillRect(i * 96, 0, 8, FLOOR);
    for (let i = 0; i < 3; i++) {
      const x = 470 + i * 120;
      ctx.fillStyle = alt ? "#0a1028" : "#a8d8f0"; ctx.fillRect(x, 120, 90, 230);
      ctx.fillStyle = alt ? "#10204a" : "#5fa84a"; ctx.fillRect(x, 300, 90, 50);
      ctx.fillStyle = "#c9a227"; ctx.fillRect(x - 14, 110, 18, 250); ctx.fillRect(x + 86, 110, 18, 250);
    }
    ctx.fillStyle = "#6a3e1e"; ctx.fillRect(520, 410, 240, 110); ctx.fillStyle = "#4a2a12"; ctx.fillRect(510, 400, 260, 18);
    [[400, "#c62828"], [880, "#1e3a8a"]].forEach(([x]) => { ctx.fillStyle = "#c9a227"; ctx.fillRect(x, 160, 6, 360); ctx.fillStyle = "#b22234"; ctx.fillRect(x + 6, 170, 60, 70); ctx.fillStyle = "#fff"; for (let j = 0; j < 4; j++) ctx.fillRect(x + 6, 180 + j * 16, 60, 6); ctx.fillStyle = "#3c3b6e"; ctx.fillRect(x + 6, 170, 26, 34); });
    ctx.fillStyle = alt ? "#2a2a3a" : "#f5f5f5"; ctx.fillRect(40, 380, 200, 230); ctx.fillStyle = "#1a1a1a"; ctx.fillRect(80, 470, 120, 140);
    ctx.fillStyle = "#5a3a1e"; ctx.fillRect(1050, 300, 200, 320); for (let j = 0; j < 4; j++) for (let k = 0; k < 6; k++) { ctx.fillStyle = ["#8e2c2c", "#2c4a8e", "#2c8e4a", "#8e7a2c"][(j + k) % 4]; ctx.fillRect(1062 + k * 30, 316 + j * 74, 20, 56); }
    // рамы с портретами бойцов
    const ids = D.roster.filter((id) => !D.fighters[id].boss).slice(0, 4);
    [[120, 150], [250, 150], [920, 150], [1050, 150]].forEach(([x, y], i) => {
      ctx.fillStyle = "#c9a227"; ctx.fillRect(x - 8, y - 8, 106, 126);
      ctx.fillStyle = alt ? "#202a4a" : "#3a2a1a"; ctx.fillRect(x, y, 90, 110);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, 90, 110); ctx.clip();
      const cheer = F && F.phase === "over" ? Math.abs(Math.sin(G.time * 10)) * 6 : 0;
      drawPortrait(ids[i], x - 5, y + 8 - cheer, 100, false);
      ctx.restore();
    });
    if (alt) {
      for (let i = 0; i < 10; i++) {
        const x = 20 + i * 130, y = 540 - (i % 2) * 56;
        ctx.fillStyle = "#2b2b2b"; ctx.fillRect(x, y, 96, 76);
        ctx.fillStyle = Math.random() < 0.2 ? "#bfe9ff" : "#4fb8ff"; ctx.fillRect(x + 8, y + 8, 80, 56);
      }
      ctx.strokeStyle = "#000"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, FLOOR + 30); ctx.bezierCurveTo(300, FLOOR + 10, 500, FLOOR + 60, W, FLOOR + 25); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.fillStyle = "rgba(120,200,255,.08)"; ctx.beginPath(); ctx.moveTo(300 + i * 340, 0); ctx.lineTo(200 + i * 340, FLOOR); ctx.lineTo(420 + i * 340, FLOOR); ctx.fill(); }
    }
    ground(alt ? "#16244a" : "#24407a", alt ? "#0a1228" : "#152a55");
    ctx.fillStyle = alt ? "#1d2f5a" : "#2c4d8e"; ctx.beginPath(); ctx.ellipse(W / 2, FLOOR + 40, 520, 52, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = "#c9a227"; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(W / 2, FLOOR + 40, 120, 24, 0, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(W / 2, FLOOR + 40, 80, 15, 0, 0, 7); ctx.stroke();
  },
};

function drawArena(id, alt) {
  const a = D.arenas[id];
  const img = (alt && IMG["arena_" + id + "_alt"]) || IMG["arena_" + id];
  if (img) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, W, H); return; }
  (THEMES[a.theme] || THEMES.fair)(alt);
}

/* ------------------------------------------------------------------ */
/* Рисование: бой и интерфейс                                         */
/* ------------------------------------------------------------------ */
function drawProj(p) {
  ctx.save();
  ctx.translate(p.x, p.y);
  const dir = Math.sign(p.vx) || 1;
  switch (p.kind) {
    case "notes":
      ctx.fillStyle = "#ffe14f"; ctx.font = `48px ${FONT}`; ctx.textAlign = "center";
      ctx.fillText("♪", -14, 10 + Math.sin(p.t * 20) * 6); ctx.fillText("♫", 16, -6 + Math.cos(p.t * 20) * 6);
      ctx.strokeStyle = "rgba(255,225,79,.5)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(-dir * 20, 0, 34, -1, 1); ctx.stroke();
      break;
    case "fired":
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.strokeStyle = "#ff5a3a"; ctx.lineWidth = 8;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(-dir * i * 22, 0, 16 + i * 6, 70 - i * 12, 0, dir > 0 ? -1.2 : 1.9, dir > 0 ? 1.2 : 4.4); ctx.stroke(); }
      label("FIRED!", 0, -96, 26, "#fff");
      break;
    case "lasso": {
      const f = p.from;
      ctx.restore(); ctx.save();
      ctx.strokeStyle = "#d9a54a"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(f.x + f.face * 40, f.y - 160); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 22, 16, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case "ball":
      ctx.rotate(p.t * 10 * dir);
      ctx.fillStyle = "#e8742a"; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#3a1a0a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(22, 0); ctx.moveTo(0, -22); ctx.lineTo(0, 22); ctx.stroke();
      break;
    case "banner":
      ctx.fillStyle = "#f5f5f5"; ctx.fillRect(-150, -28, 300, 56);
      for (let i = 0; i < 4; i++) { ctx.fillStyle = "#b22234"; ctx.fillRect(-150, -28 + i * 14, 300, 6); }
      ctx.fillStyle = "#3c3b6e"; ctx.fillRect(-150, -28, 70, 30);
      label("MISSION ACCOMPLISHED", 30, 8, 17, "#111");
      break;
    case "wall":
      for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) { ctx.fillStyle = (r + c) % 2 ? "#8a8a8a" : "#9e9e9e"; ctx.fillRect(-85 + c * 57 + (r % 2) * 10, -150 + r * 50, 54, 47); }
      break;
    case "wave":
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#ff3b3b"; ctx.lineWidth = 10;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-dir * i * 26, 0, 20 + i * 10, 140 - i * 14, 0, dir > 0 ? -1.3 : 1.8, dir > 0 ? 1.3 : 4.5); ctx.stroke(); }
      label("!!!", 0, -160, 40, "#fff");
      break;
    case "arrow":
      ctx.fillStyle = "#ff2a2a";
      ctx.beginPath(); ctx.moveTo(-14, -48); ctx.lineTo(14, -48); ctx.lineTo(14, 10); ctx.lineTo(28, 10); ctx.lineTo(0, 48); ctx.lineTo(-28, 10); ctx.lineTo(-14, 10); ctx.closePath(); ctx.fill();
      break;
  }
  ctx.restore();
}

function hpBar(f, x, flip) {
  const w = 500, h = 30, y = 34;
  ctx.save();
  ctx.translate(x, y);
  if (flip) { ctx.scale(-1, 1); }
  ctx.fillStyle = "#1a1a2e"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w - 16, h); ctx.lineTo(-16, h); ctx.closePath(); ctx.fill();
  const kShown = f.shownHp / f.maxHp, k = f.hp / f.maxHp;
  ctx.fillStyle = "#c0392b"; ctx.fillRect(4, 4, (w - 24) * kShown, h - 8);
  ctx.fillStyle = k > 0.3 ? GOLD : "#ff7a2a"; ctx.fillRect(4, 4, (w - 24) * k, h - 8);
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w - 16, h); ctx.lineTo(-16, h); ctx.closePath(); ctx.stroke();
  ctx.restore();
  ctx.font = `22px ${FONT}`; ctx.textAlign = flip ? "right" : "left"; ctx.fillStyle = WHITE;
  ctx.fillText(f.d.name, flip ? x - 4 : x + 4, 92);
  for (let i = 0; i < WINS_NEEDED; i++) {
    ctx.fillStyle = i < f.wins ? GOLD : "rgba(255,255,255,.25)";
    ctx.beginPath(); ctx.arc(flip ? x - 470 + i * 26 : x + 470 - i * 26, 82, 9, 0, Math.PI * 2); ctx.fill();
  }
}
function meterBar(f, x, flip) {
  const w = 300, y = 690;
  const k = f.meter / 100;
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(flip ? x - w : x, y - 14, w, 18);
  const full = k >= 1;
  ctx.fillStyle = full ? (Math.sin(G.time * 12) > 0 ? "#ff5a3a" : GOLD) : "#4a7cf0";
  ctx.fillRect(flip ? x - w * k : x, y - 12, w * k, 14);
  ctx.font = `16px ${FONT}`; ctx.textAlign = flip ? "right" : "left"; ctx.fillStyle = full ? GOLD : "#cfd8ff";
  ctx.fillText(full ? "SUPER READY!" : "SUPER", flip ? x - w - 10 : x + w + 10, y);
  if (f.cd > 0) { ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.fillRect(flip ? x - w : x, y - 20, w * (1 - f.cd / f.d.specialCd), 3); }
}
function bigText(s, y, size, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = "center";
  ctx.lineWidth = Math.max(4, size / 8); ctx.strokeStyle = INK; ctx.strokeText(s, W / 2, y);
  ctx.fillStyle = color; ctx.fillText(s, W / 2, y);
  ctx.restore();
}
function wrapText(s, x, y, maxW, lh) {
  const words = s.split(" "); let line = "", yy = y;
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; } else line = t;
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}

function drawFight() {
  ctx.save();
  if (F.shake > 0) ctx.translate(rnd(-F.shake, F.shake), rnd(-F.shake, F.shake));
  drawArena(F.arena, F.altBg);
  // атакующий рисуется поверх
  const order = F.p[0].st === "atk" ? [F.p[1], F.p[0]] : [F.p[0], F.p[1]];
  if (F.phase === "fatality") drawFatality();
  else for (const f of order) drawFighter(f);
  for (const p of F.proj) drawProj(p);
  for (const p of F.parts) { ctx.globalAlpha = 1 - p.t / p.life; ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); }
  ctx.globalAlpha = 1;
  for (const t of F.texts) {
    const k = t.t / t.life;
    ctx.save(); ctx.globalAlpha = 1 - k * k;
    ctx.font = `${t.size}px ${FONT}`; ctx.textAlign = "center"; ctx.lineWidth = 6; ctx.strokeStyle = INK;
    ctx.strokeText(t.s, t.x, t.y - k * 30); ctx.fillStyle = t.c; ctx.fillText(t.s, t.x, t.y - k * 30);
    ctx.restore();
  }
  ctx.restore();

  // супер-приём: затемнение и имя
  if (F.superFlash) {
    const k = clamp(F.superFlash.t / 1.2, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`; ctx.fillRect(0, 0, W, H);
  }
  if (F.flashScreen > 0) { ctx.fillStyle = `rgba(255,255,255,${F.flashScreen})`; ctx.fillRect(0, 0, W, H); }

  // интерфейс
  hpBar(F.p[0], 50, false);
  hpBar(F.p[1], W - 50, true);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(W / 2, 52, 38, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = `34px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = F.timer < 10 ? RED : WHITE;
  ctx.fillText(String(Math.ceil(F.timer)), W / 2, 64);
  meterBar(F.p[0], 40, false);
  meterBar(F.p[1], W - 40, true);
  ctx.font = `16px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.textAlign = "center";
  ctx.fillText(D.arenas[F.arena].name, W / 2, 112);
  if (F.comboShow && F.comboShow.n >= 2) {
    const left = F.comboShow.who === F.p[0];
    ctx.save(); ctx.font = `40px ${FONT}`; ctx.textAlign = left ? "left" : "right";
    ctx.lineWidth = 6; ctx.strokeStyle = INK; const s = `${F.comboShow.n} HITS!`;
    ctx.strokeText(s, left ? 40 : W - 40, 200); ctx.fillStyle = GOLD; ctx.fillText(s, left ? 40 : W - 40, 200);
    ctx.restore();
  }

  // надписи фаз
  if (F.phase === "intro") {
    if (F.phaseT < 1.1) bigText(F.round === MAX_ROUNDS ? "FINAL ROUND" : "ROUND " + F.round, 330, 72, WHITE);
    else bigText(D.texts.fight, 340, 110, GOLD);
  }
  if (F.phase === "ko") bigText(D.texts.ko, 340, 110, RED, clamp(F.phaseT * 3, 0, 1));
  if (F.phase === "timeup") bigText(D.texts.timeUp, 340, 100, WHITE);
  if (F.phase === "finish") {
    bigText(D.texts.finish, 320, 100, RED, 0.6 + 0.4 * Math.sin(G.time * 10));
    if (!F.matchWinner.bot) bigText(isTouch ? "PRESS SPEC!" : "PRESS SPECIAL!", 390, 34, WHITE);
  }
  if (F.phase === "over") {
    bigText(F.matchWinner.d.name + " WINS!", 300, 64, GOLD);
    bigText(F.matchWinner.d.win, 360, 30, WHITE);
  }
  if (G.paused) drawPause();
}

function drawFatality() {
  const w = F.matchWinner, l = other(w), t = F.phaseT;
  ctx.fillStyle = `rgba(80,0,0,${Math.min(0.55, t * 0.5)})`; ctx.fillRect(0, 0, W, H);
  drawFighter(w);
  // проигравший исчезает
  ctx.save();
  ctx.globalAlpha = clamp(1 - (t - 1.4) / 1.2, 0, 1);
  const k = clamp(1 - (t - 1.4) / 1.8, 0.2, 1);
  ctx.translate(l.x, l.y); ctx.scale(l.face * k, k);
  drawDummyOrSprite(l, { cr: 0, lean: -0.2, arms: "flail", legs: "stand", lying: 0, bob: Math.sin(t * 20) * 4, key: "hurt" });
  ctx.restore();
  if (t > 1.4 && t < 2.6) for (let i = 0; i < 3; i++) spark(l.x + rnd(-40, 40), l.y - rnd(40, 220), w.id === "rating" ? "tv" : "gold");
  bigText(D.texts.fatality, 230, 90, RED);
  ctx.font = `26px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = WHITE;
  wrapText(w.d.fatality, W / 2, 300, 900, 34);
}
function drawDummyOrSprite(f, pose) {
  const set = SPR[f.id], img = set && set.hurt && IMG[`spr_${f.id}_hurt`];
  if (img) { const s = set.hurt, k = s.scale || 1; ctx.drawImage(img, -s.ax * k, -s.ay * k, img.width * k, img.height * k); }
  else drawDummy(f.d, pose, false, 0);
}

function drawPause() {
  ctx.fillStyle = "rgba(5,6,20,.75)"; ctx.fillRect(0, 0, W, H);
  bigText("PAUSED", 220, 80, GOLD);
  menuList(["RESUME", "SOUND: " + (muted ? "OFF" : "ON"), "QUIT TO MENU"], G.pauseSel, W / 2, 300, 420, 64);
  ctx.font = `18px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.7)";
  const help = F.opts.mode === "vs"
    ? ["1P: W A S D move, F punch, G kick, H special, T super", "2P: arrows move, J punch, K kick, L special, I super"]
    : ["Arrows move, Up/Space jump, Down crouch (blocks low)", "A punch, S kick, D special, A+S or F super. Hold back to block"];
  help.forEach((s, i) => ctx.fillText(s, W / 2, 560 + i * 30));
}

/* ------------------------------------------------------------------ */
/* Рисование: меню                                                    */
/* ------------------------------------------------------------------ */
function menuBg() {
  ctx.fillStyle = grad(0, H, ["#0b0f24", "#1a1f4a", "#3a1030"]); ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    const x = (i * 211) % W, y = (i * 97) % 420, tw = Math.sin(G.time * 2 + i) > 0.6;
    ctx.fillStyle = tw ? "#fff" : "rgba(255,255,255,.4)"; ctx.fillRect(x, y, tw ? 3 : 2, tw ? 3 : 2);
  }
  // полосы флага
  ctx.save(); ctx.globalAlpha = 0.12;
  for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? "#ffffff" : "#b22234"; ctx.fillRect(0, 440 + i * 40, W, 40); }
  ctx.restore();
}
function menuList(items, sel, cx, y, w, h, gap = 14) {
  items.forEach((s, i) => {
    const yy = y + i * (h + gap), on = i === sel;
    ctx.fillStyle = on ? "rgba(255,213,74,.95)" : "rgba(20,26,60,.85)";
    ctx.fillRect(cx - w / 2, yy, w, h);
    ctx.strokeStyle = on ? "#fff" : "rgba(255,255,255,.3)"; ctx.lineWidth = 2; ctx.strokeRect(cx - w / 2, yy, w, h);
    ctx.font = `${Math.round(h * 0.42)}px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = on ? INK : WHITE;
    ctx.fillText(s, cx, yy + h * 0.66);
    G.hits.push({ x: cx - w / 2, y: yy, w, h, i });
  });
}
function drawLogo(y, size) {
  ctx.save();
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = "center";
  ctx.lineWidth = size / 6; ctx.strokeStyle = INK;
  ctx.strokeText("PRESIDENTIAL", W / 2, y); ctx.fillStyle = WHITE; ctx.fillText("PRESIDENTIAL", W / 2, y);
  ctx.font = `${size * 1.35}px ${FONT}`;
  ctx.strokeText("KNOCKOUT", W / 2, y + size * 1.35); ctx.fillStyle = RED; ctx.fillText("KNOCKOUT", W / 2, y + size * 1.35);
  ctx.restore();
}

function drawTitle() {
  menuBg();
  // бойцы на сцене
  const ids = D.roster.filter((id) => !D.fighters[id].boss);
  ids.forEach((id, i) => {
    ctx.save(); ctx.translate(200 + i * 220, 650); ctx.scale(i < 2 ? 1 : i === 2 ? 1 : -1, 1);
    const win = Math.sin(G.time * 0.8 + i * 1.3) > 0.85;
    drawDummy(D.fighters[id], { cr: 0, lean: 0, arms: win ? "up" : "guard", legs: "stand", lying: 0, bob: Math.sin(G.time * 4 + i) * 2 }, false, 0);
    ctx.restore();
  });
  drawLogo(150, 64);
  if (Math.sin(G.time * 5) > -0.3) bigText(isTouch ? "TAP TO START" : "PRESS ANY KEY", 330, 30, GOLD);
  ctx.font = `14px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.55)";
  ctx.fillText(D.disclaimer + "  ·  early build", W / 2, 708);
}

function drawMode() {
  menuBg();
  drawLogo(110, 40);
  menuList(["ARCADE", "VS CPU", "2 PLAYERS", "DIFFICULTY: " + DIFF_NAMES[G.diff], "SOUND: " + (muted ? "OFF" : "ON")], G.menuSel, W / 2, 250, 460, 62);
  ctx.font = `16px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.65)";
  const hint = ["7 fights in a row. Final boss in the Oval Office", "Free fight against the computer on any arena", "Two players on one keyboard", "Affects the CPU in arcade and VS CPU", ""][G.menuSel];
  ctx.fillText(hint, W / 2, 650);
}

function drawSelect() {
  menuBg();
  const R = rosterVisible(), s = G.sel;
  const who = G.mode === "arcade" ? "CHOOSE YOUR FIGHTER" : s.step === 0 ? (G.mode === "vs" ? "PLAYER 1: CHOOSE" : "CHOOSE YOUR FIGHTER") : (G.mode === "vs" ? "PLAYER 2: CHOOSE" : "CHOOSE YOUR OPPONENT");
  bigText(who, 70, 40, s.step === 0 ? GOLD : "#ff7a7a");
  // сетка 3×2
  R.forEach((id, i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 70 + col * 190, y = 120 + row * 250, w = 170, h = 230;
    const lk = locked(id), on = i === s.cur;
    ctx.fillStyle = on ? "rgba(255,213,74,.25)" : "rgba(20,26,60,.85)"; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (lk) { ctx.fillStyle = "#111"; ctx.fillRect(x, y, w, h); label("?", x + w / 2, y + 140, 100, "#444"); }
    else drawPortrait(id, x + 10, y + 10, 150, false);
    ctx.restore();
    ctx.strokeStyle = on ? (s.step === 0 ? GOLD : "#ff7a7a") : "rgba(255,255,255,.3)"; ctx.lineWidth = on ? 5 : 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x, y + h - 38, w, 38);
    label(lk ? "???" : D.fighters[id].name, x + w / 2, y + h - 12, D.fighters[id].name.length > 9 ? 15 : 22, WHITE);
    s.picks.forEach((pid, k) => { if (pid === id) label(k === 0 ? "1P" : G.mode === "vs" ? "2P" : "CPU", x + 30, y + 30, 22, k === 0 ? GOLD : "#ff7a7a"); });
    G.hits.push({ x, y, w, h, i });
  });
  // карточка бойца
  const id = R[s.cur], d = D.fighters[id], lk = locked(id);
  ctx.fillStyle = "rgba(10,14,40,.85)"; ctx.fillRect(660, 120, 570, 480);
  if (!lk) {
    ctx.save(); ctx.translate(800, 560); ctx.scale(1.3, 1.3);
    const a = Math.sin(G.time * 1.5) > 0.7;
    drawDummy(d, { cr: 0, lean: 0, arms: a ? "punch" : "guard", legs: "stand", lying: 0, bob: Math.sin(G.time * 4) * 2 }, false, 0);
    ctx.restore();
    ctx.textAlign = "left"; ctx.font = `30px ${FONT}`; ctx.fillStyle = GOLD; ctx.fillText(d.name, 920, 170);
    ctx.font = `16px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillText(d.full, 920, 196);
    const stats = [["SPEED", d.speed], ["POWER", d.power], ["HEALTH", d.health]];
    stats.forEach(([n, v], i) => {
      const y = 240 + i * 48; ctx.fillStyle = WHITE; ctx.font = `15px ${FONT}`; ctx.fillText(n, 920, y);
      ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.fillRect(920, y + 8, 280, 14);
      ctx.fillStyle = GOLD; ctx.fillRect(920, y + 8, 280 * clamp((v - 0.7) / 0.5, 0.1, 1), 14);
    });
    ctx.font = `15px ${FONT}`; ctx.fillStyle = "#9fc2ff"; ctx.fillText("SPECIAL:", 920, 410); ctx.fillStyle = WHITE; ctx.fillText(d.special.name, 1010, 410);
    ctx.fillStyle = "#ff9a9a"; ctx.fillText("SUPER:", 920, 440); ctx.fillStyle = WHITE;
    ctx.font = `14px ${FONT}`; wrapText(d.superMove.name, 1010, 440, 210, 20);
  } else {
    label("SECRET FIGHTER", 945, 330, 34, GOLD);
    ctx.font = `18px ${FONT}`; ctx.fillStyle = WHITE; ctx.textAlign = "center";
    ctx.fillText("Beat the arcade to unlock", 945, 380);
  }
  ctx.font = `15px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillText(isTouch ? "Tap a fighter to choose" : "Arrows to move, Enter to choose, Esc to go back", W / 2, 640);
  if (isTouch) { G.hits.push({ x: 20, y: 660, w: 160, h: 50, i: -99 }); label("‹ BACK", 100, 694, 20, WHITE); }
}

function drawArenaSelect() {
  const ids = Object.keys(D.arenas);
  const cur = G.arenaSel < ids.length ? ids[G.arenaSel] : null;
  if (cur) drawArena(cur, false); else menuBg();
  ctx.fillStyle = "rgba(5,6,20,.55)"; ctx.fillRect(0, 0, W, H);
  bigText("CHOOSE AN ARENA", 70, 40, GOLD);
  const items = ids.map((k) => D.arenas[k].name).concat(["RANDOM"]);
  items.forEach((s, i) => {
    const col = Math.floor(i / 5), row = i % 5;
    const x = 140 + col * 520, y = 130 + row * 92, w = 480, h = 72, on = i === G.arenaSel;
    ctx.fillStyle = on ? "rgba(255,213,74,.95)" : "rgba(20,26,60,.85)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = on ? "#fff" : "rgba(255,255,255,.3)"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.font = `24px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = on ? INK : WHITE; ctx.fillText(s, x + 20, y + 46);
    const a = D.arenas[ids[i]];
    if (a && a.home) { ctx.font = `13px ${FONT}`; ctx.textAlign = "right"; ctx.fillStyle = on ? INK : "rgba(255,255,255,.6)"; ctx.fillText("HOME: " + D.fighters[a.home].name, x + w - 14, y + 44); }
    G.hits.push({ x, y, w, h, i });
  });
  if (isTouch) { G.hits.push({ x: 20, y: 660, w: 160, h: 50, i: -99 }); label("‹ BACK", 100, 694, 20, WHITE); }
}

function drawLadder() {
  menuBg();
  const L = G.ladder;
  bigText("ROAD TO THE FIFTH TERM", 70, 40, GOLD);
  L.list.forEach((s, i) => {
    const y = 110 + i * 74, done = i < L.idx, cur = i === L.idx;
    ctx.fillStyle = cur ? "rgba(255,213,74,.95)" : done ? "rgba(40,90,50,.85)" : "rgba(20,26,60,.85)";
    ctx.fillRect(230, y, 820, 62);
    ctx.save(); ctx.beginPath(); ctx.rect(240, y + 2, 60, 58); ctx.clip(); drawPortrait(s.opp, 236, y + 2, 66, false); ctx.restore();
    ctx.font = `22px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = cur ? INK : WHITE;
    ctx.fillText(`${i + 1}. ${s.boss ? "BOSS: " : ""}${D.fighters[s.opp].name}`, 320, y + 30);
    ctx.font = `14px ${FONT}`; ctx.fillStyle = cur ? INK : "rgba(255,255,255,.65)";
    ctx.fillText(`${D.arcade.tourNames[s.tour]} · ${D.arenas[s.arena].name}`, 320, y + 52);
    if (done) label("✓", 1010, y + 44, 34, "#7dff9a");
  });
  if (Math.sin(G.time * 5) > -0.3) bigText(isTouch ? "TAP TO FIGHT" : "PRESS ENTER TO FIGHT", 690, 28, WHITE);
}

function drawVS() {
  const p = G.pending;
  drawArena(p.arena, false);
  ctx.fillStyle = "rgba(5,6,20,.6)"; ctx.fillRect(0, 0, W, H);
  const k = clamp(G.screenT * 3, 0, 1);
  [[p.p1, 330 - (1 - k) * 400, 1], [p.p2, 950 + (1 - k) * 400, -1]].forEach(([id, x, face]) => {
    ctx.save(); ctx.translate(x, 600); ctx.scale(1.6 * face, 1.6);
    drawDummy(D.fighters[id], { cr: 0, lean: 0, arms: "guard", legs: "stand", lying: 0, bob: Math.sin(G.time * 4) * 2 }, false, 0);
    ctx.restore();
    ctx.font = `40px ${FONT}`; ctx.textAlign = "center"; ctx.lineWidth = 6; ctx.strokeStyle = INK;
    ctx.strokeText(D.fighters[id].name, x, 660); ctx.fillStyle = GOLD; ctx.fillText(D.fighters[id].name, x, 660);
  });
  bigText("VS", 360, 140 * (0.7 + 0.3 * k), RED);
  bigText(D.arenas[p.arena].name, 80, 32, WHITE);
}

function drawContinue() {
  menuBg();
  bigText(D.texts.impeach, 200, 90, RED);
  bigText("CONTINUE?", 300, 44, WHITE);
  menuList(["YES — TRY AGAIN", "NO — MAIN MENU"], G.menuSel, W / 2, 360, 420, 64);
}

function drawResult() {
  menuBg();
  const w = G.lastWinner;
  ctx.save(); ctx.translate(W / 2, 470); ctx.scale(1.5, 1.5);
  drawDummy(w.d, { cr: 0, lean: 0, arms: "up", legs: "stand", lying: 0, bob: Math.sin(G.time * 6) * 3 }, false, 0);
  ctx.restore();
  bigText(w.d.name + " WINS!", 90, 56, GOLD);
  menuList(["REMATCH", "CHANGE FIGHTERS", "MAIN MENU"], G.menuSel, W / 2, 500, 400, 52, 10);
}

function drawEnding() {
  menuBg();
  const d = D.fighters[G.ladder.pid];
  ctx.save(); ctx.translate(W / 2, 470); ctx.scale(1.6, 1.6);
  drawDummy(d, { cr: 0, lean: 0, arms: "up", legs: "stand", lying: 0, bob: Math.sin(G.time * 6) * 3 }, false, 0);
  ctx.restore();
  bigText(D.texts.champion, 100, 80, GOLD);
  ctx.font = `24px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = WHITE;
  wrapText(d.ending, W / 2, 530, 980, 32);
  if (G.newUnlock) bigText("NEW FIGHTER UNLOCKED: MR. RATING", 660, 26, "#6fd3ff");
}

/* ------------------------------------------------------------------ */
/* Главный цикл                                                       */
/* ------------------------------------------------------------------ */
function update(dt) {
  if (G.screen === "fight") updateFight(dt);
  else updateMenus(dt);
}
function draw() {
  G.hits = [];
  ctx.imageSmoothingEnabled = true;
  ctx.textBaseline = "alphabetic";
  switch (G.screen) {
    case "title": drawTitle(); break;
    case "mode": drawMode(); break;
    case "select": drawSelect(); break;
    case "arena": drawArenaSelect(); break;
    case "ladder": drawLadder(); break;
    case "vs": drawVS(); break;
    case "fight": drawFight(); break;
    case "continue": drawContinue(); break;
    case "result": drawResult(); break;
    case "ending": drawEnding(); break;
  }
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  G.time += dt;
  try { update(dt); draw(); } catch (e) { console.error(e); }
  justPressed.clear();
  touch.p = {};
  G.click = null;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Отладка и автотесты: window.PK
window.PK = {
  G, get F() { return F; }, D, newFight, makeLadder, go,
  sim(seconds, step = 1 / 60) { for (let t = 0; t < seconds; t += step) { G.time += step; update(step); justPressed.clear(); touch.p = {}; G.click = null; } draw(); },
  botVsBot(p1 = "bush", p2 = "trump", arena = "detroit") {
    newFight({ mode: "cpu", p1, p2, arena, level1: 2, level2: 2 });
    F.p[0].bot = true; F.p[0].level = 2;
  },
};
})();
