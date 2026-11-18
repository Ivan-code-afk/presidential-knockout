"use strict";
/* ПРЕЗИДЕНТСКИЙ НОКАУТ — движок файтинга на одном canvas.
 * Все времена в секундах, скорости в px/s: игра идёт одинаково на 60 и 144 Гц.
 * Пока нет спрайтов и фонов, бойцы и арены рисуются кодом (заглушки).
 * Как только в sprites.js / assets/arenas появятся картинки, движок подхватит их сам. */
(() => {
const D = window.GAME_DATA;
for (const id in D.fighters) D.fighters[id].id = id;
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

// Голоса: только файлы из sounds/voices.js
const VOICE_OK = new Set(window.VOICES || []), VOICE = {};
function voice(key) {
  if (muted || !key || !VOICE_OK.has(key)) return;
  let a = VOICE[key];
  if (!a) { a = VOICE[key] = new Audio(`sounds/voice/${key}.mp3`); a.preload = "auto"; }
  try { a.currentTime = 0; const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {}
}
// Реплика героя: {s: текст, key: имя голосового файла}
function lineOf(id, kind) {
  const L = D.fighters[id] && D.fighters[id].lines;
  if (!L || !L[kind]) return null;
  if (Array.isArray(L[kind])) { const i = Math.floor(Math.random() * L[kind].length); return { s: L[kind][i], key: `${id}_${kind}${i}` }; }
  return { s: L[kind], key: `${id}_${kind}` };
}
// Перед боем: особая пара или обычные приветствия
function makeTalk(a, b) {
  const R = D.rivalries || [];
  const find = (x, y, any) => R.find((r) => r.a === x && (any ? r.b === "*" : r.b === y));
  let r = find(a, b), flip = false;
  if (!r) { r = find(b, a); flip = !!r; }
  if (!r) { r = find(a, b, true); }
  if (!r) { r = find(b, a, true); flip = !!r; }
  if (r) {
    const tag = `${r.a}_vs_${r.b === "*" ? "any" : r.b}`;
    const L = [{ s: r.lines[0], key: tag + "_0" }, { s: r.lines[1], key: tag + "_1" }];
    return { rivals: true, lines: flip ? [L[1], L[0]] : L, order: flip ? [1, 0] : [0, 1] };
  }
  return { rivals: false, lines: [lineOf(a, "intro"), lineOf(b, "intro")], order: [0, 1] };
}

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
          punch: ["KeyA", "KeyJ"], kick: ["KeyS", "KeyK"], special: ["KeyD", "KeyL"], super: ["KeyF", "KeyI"], assist: ["KeyE", "KeyU"] },
  p1:   { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"],
          punch: ["KeyF"], kick: ["KeyG"], special: ["KeyH"], super: ["KeyT"], assist: ["KeyR"] },
  p2:   { left: ["ArrowLeft"], right: ["ArrowRight"], up: ["ArrowUp"], down: ["ArrowDown"],
          punch: ["KeyJ", "Numpad1"], kick: ["KeyK", "Numpad2"], special: ["KeyL", "Numpad3"], super: ["KeyI", "Numpad4"], assist: ["KeyU", "Numpad5"] },
};
const ACTIONS = ["left", "right", "up", "down", "punch", "kick", "special", "super", "assist"];

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
  impeachUnlocked: store.get("impeach", false),
  clears: store.get("clears", {}),
  skins: store.get("skins", {}),
  best: store.get("best", {}),        // лучший рейтинг одобрения в аркаде   // лучший пройденный уровень аркады для каждого бойца
  loseStreak: 0,
};
let F = null; // текущий бой

const DIFF_NAMES = ["INTERN", "SENATOR", "COMMANDER-IN-CHIEF", "IMPEACHMENT MODE"];
const DIFF_HINTS = [
  "Easy. The CPU goes softer if you keep losing",
  "Normal. A fair fight",
  "Hard. The CPU blocks, combos and punishes",
  "Secret. Stronger CPU, more health, NO continues",
];
// Звания за прохождение аркады на каждом уровне
const TITLES = ["JUNIOR STAFFER", "MAJORITY LEADER", "LEADER OF THE FREE WORLD", "PRESIDENT FOR LIFE"];
const MEDAL_COLORS = ["#c98a4b", "#d7dde6", GOLD, "#ff4d6d"];
function diffCount() { return G.impeachUnlocked ? 4 : 3; }
if (G.diff > 2 && !G.impeachUnlocked) G.diff = 2;
const TIPS = [
  "Block by holding BACK. Hold DOWN+BACK against low kicks.",
  "Throw: FORWARD+PUNCH up close. Press PUNCH to break a throw.",
  "Hit with a punch, then press SPEC right away to cancel into a special.",
  "A full meter lets you fire SUPER (PUNCH+KICK).",
  "Knocked into the air? Your opponent can juggle you twice. Block on landing.",
  "Each fighter has 3 specials: SPEC, FWD+SPEC and DOWN+SPEC.",
];

function go(screen) { G.screen = screen; G.screenT = 0; G.menuSel = 0; document.body.classList.toggle("fighting", screen === "fight"); }

/* ------------------------------------------------------------------ */
/* Бойцы                                                              */
/* ------------------------------------------------------------------ */
const MOVES = {
  punch:  { start: 0.07, act: 0.08, rec: 0.15, dmg: 5, range: 108, hgt: "high", stun: 0.28, push: 170, meter: 8, sfx: "hit" },
  kick:   { start: 0.11, act: 0.09, rec: 0.24, dmg: 8, range: 128, hgt: "low",  stun: 0.34, push: 210, meter: 10, sfx: "heavy" },
  cpunch: { start: 0.06, act: 0.07, rec: 0.14, dmg: 4, range: 104, hgt: "low",  stun: 0.24, push: 130, meter: 6, sfx: "hit" },
  akick:  { start: 0.05, act: 0.6,  rec: 0,    dmg: 7, range: 112, hgt: "over", stun: 0.30, push: 160, meter: 8, sfx: "heavy", air: true },
  throw:  { start: 0.06, act: 0.05, rec: 0.4,  range: 104 },
};
// Тайминги спецприёмов: подготовка, активная фаза, восстановление (сек)
const SP_TIME = {
  parry: { start: 0.05, act: 0.5, rec: 0.25 },     counter: { start: 0.07, act: 0.12, rec: 0.3 },
  brush: { start: 0.1, act: 0.24, rec: 0.3 },      decider: { start: 0.12, act: 0.1, rec: 0.2 },
  notes: { start: 0.16, act: 0.1, rec: 0.3 },      jog: { start: 0.06, act: 0.36, rec: 0.2 },
  townhall: { start: 0.1, act: 0.7, rec: 0.25 },   fired: { start: 0.16, act: 0.1, rec: 0.3 },
  deal: { start: 0.12, act: 0.08, rec: 0.55 },     bigleague: { start: 0.34, act: 0.1, rec: 0.35 },
  lasso: { start: 0.16, act: 0.1, rec: 0.3 },      hat: { start: 0.14, act: 0.1, rec: 0.3 },
  beans: { start: 0.18, act: 0.1, rec: 0.35 },     ball: { start: 0.16, act: 0.1, rec: 0.3 },
  fastbreak: { start: 0.08, act: 0.3, rec: 0.3 },  yeswecan: { start: 0.2, act: 0.1, rec: 0.2 },
  teleport: { start: 0.32, act: 0.14, rec: 0.3 },  tv: { start: 0.16, act: 0.1, rec: 0.3 },
  spike: { start: 0.08, act: 0.22, rec: 0.35 },
  tape: { start: 0.18, act: 0.1, rec: 0.32 }, subpoena: { start: 0.16, act: 0.1, rec: 0.3 },
  lights: { start: 0.2, act: 0.1, rec: 0.32 }, broccoli: { start: 0.18, act: 0.1, rec: 0.34 }, lips: { start: 0.25, act: 0.1, rec: 0.35 },
  pingpong: { start: 0.12, act: 0.1, rec: 0.26 }, checkers: { start: 0.2, act: 0.1, rec: 0.32 }, record: { start: 0.22, act: 0.1, rec: 0.3 },
};
const SLOTS = ["n", "f", "d"];

// Предметы бонус-этапов ведут себя как неподвижный «боец»
const OBJ_BASE = { full: "", speed: 0, power: 0, specials: {}, passive: { name: "", desc: "" }, superMove: { name: "", type: "none" },
  colors: { shirt: "#888", pants: "#555", skin: "#ccc", hair: "#333", accent: "#fff", shoes: "#222" }, look: {}, win: "", fatality: "", ending: "", obj: true };
const BONUS_DEFS = {
  teleprompter: Object.assign({}, OBJ_BASE, { name: "TELEPROMPTER", health: 1.4, kind: "teleprompter" }),
  ballots: Object.assign({}, OBJ_BASE, { name: "BALLOT BOX", health: 1, kind: "ballots", inv: true }),
  hands: Object.assign({}, OBJ_BASE, { name: "CROWD", health: 1, kind: "hands", inv: true, hidden: true }),
};
const BONUS_TIME = 20;

// Костюмы за медали: 0 — обычный, 1 — золотой (COMMANDER-IN-CHIEF), 2 — красный (IMPEACHMENT MODE)
const SKINS = [
  { name: "CLASSIC" },
  { name: "GOLD EDITION", need: 2, colors: { shirt: "#e2b13c", pants: "#7a5a12", accent: "#fff3b0", shoes: "#3a2a08" } },
  { name: "RED EDITION", need: 3, colors: { shirt: "#b3122e", pants: "#1a1a1a", accent: "#ffd54a", shoes: "#111111" } },
];
function skinsOpen(id) { const c = G.clears[id]; return SKINS.filter((k, i) => i === 0 || (c !== undefined && c >= k.need)).length; }
function skinOf(id) { return Math.min((G.skins && G.skins[id]) || 0, skinsOpen(id) - 1); }
function skinned(d, k) {
  if (!k || !SKINS[k] || !SKINS[k].colors) return d;
  return Object.assign({}, d, { colors: Object.assign({}, d.colors, SKINS[k].colors), skin: k });
}

function makeFighter(id, side, ctl, level, skin) {
  const d = skinned(D.fighters[id] || BONUS_DEFS[id], skin);
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
    hp: f.maxHp, shownHp: f.maxHp, st: "idle", stT: 0, atk: null, stun: 0, cds: { n: 0, f: 0, d: 0 }, combo: 0, comboT: 0,
    inv: 0, reflectT: 0, flash: 0, walkPh: 0, airAtk: false, crouchBlock: false, crouchHurt: false, alpha: 1,
    armor: 0, buffT: 0, deciderT: 0, juggle: 0, jumps: 0, recent: [], tyga: false, lastPunchT: -9, ghost: false,
    vpUsed: false, slowT: 0, hidden: false, chute: null, crookUsed: false, crookT: 0, dmgLog: [],
  });
  f.ai = { t: 0.4, hold: {} };
}
function setSt(f, s) { if (f.st !== s) { f.st = s; f.stT = 0; } }
function other(f) { return F.p[0] === f ? F.p[1] : F.p[0]; }
function isCrouching(f) {
  return f.st === "crouch" || (f.st === "block" && f.crouchBlock) || (f.st === "hurt" && f.crouchHurt) ||
    (f.st === "atk" && f.atk && (f.atk.crouch || f.atk.type === "parry" || f.atk.type === "fastbreak"));
}
function canBlock(def, att, hgt) {
  if (!["idle", "walk", "crouch", "block"].includes(def.st) || !def.onGround) return false;
  const away = att.x > def.x ? "left" : "right";
  if (isCrouching(def)) return hgt === "low" || hgt === "mid";
  return def.ctl.h[away] && hgt !== "low";
}
function canBeThrown(o) {
  return !o.d.obj && o.onGround && o.inv <= 0 && ["idle", "walk", "crouch", "block", "atk"].includes(o.st) && !(o.st === "atk" && o.atk && o.atk.kind === "super");
}
function powerOf(att) {
  let p = att.d.power;
  if (att.id === "clinton") p *= 1 + 0.5 * (1 - att.hp / att.maxHp);       // Comeback Kid
  if (att.buffT > 0) p *= 1.15;                                             // Yes We Can
  return p;
}
// Рейган: «There you go again» — соперник трижды подряд сделал одно и то же
function noteMove(f, key) {
  const o = other(f);
  if (o.id !== "reagan" || o.tyga) return;
  o.recent.push(key);
  if (o.recent.length > 3) o.recent.shift();
  if (o.recent.length === 3 && o.recent.every((k) => k === key)) {
    o.tyga = true; o.recent = [];
    popText("THERE YOU GO AGAIN!", o.x, o.y - 300, GOLD, 1.4, 30);
  }
}

function startAtk(f, kind, extra) {
  const m = MOVES[kind] || { start: 0.15, act: 0.1, rec: 0.3 };
  if (kind === "punch") { f.punchAlt = G.time - (f.lastPunchAt ?? -9) < 0.9 ? !f.punchAlt : false; f.lastPunchAt = G.time; }
  f.atk = Object.assign({ kind, m, t: 0, hit: false, fired: false, crouch: f.st === "crouch" || kind === "cpunch" }, extra || {});
  setSt(f, "atk");
  if (!m.air) f.vx = 0;
  if (kind !== "special" && kind !== "super") noteMove(f, kind);
  SFX.whoosh();
}

function slotFrom(c, fwd) { return c.h.down ? "d" : c.h[fwd] ? "f" : "n"; }
function startSpecial(f, slot) {
  const sp = f.d.specials[slot];
  if (!sp || f.cds[slot] > 0) return false;
  f.cds[slot] = sp.cd;
  startAtk(f, "special", { type: sp.type, slot, crouch: false });
  f.atk.m = SP_TIME[sp.type] || { start: 0.16, act: 0.1, rec: 0.3 };
  if (sp.type === "bigleague") { f.armor = 1; popText("ARMOR", f.x, f.y - 250, "#ffb04a", 0.6, 22); }
  noteMove(f, "sp_" + sp.type);
  popText(sp.name, f.x, f.y - 290, WHITE, 0.9);
  SFX.special();
  return true;
}

// Вице-президент: раз за раунд вбегает из-за края экрана и бьёт один раз
function callVP(f, o) {
  f.vpUsed = true;
  const d = D.fighters[f.vp];
  F.assists.push({ owner: f, target: o, d, id: f.vp, x: f.face === 1 ? -70 : W + 70, dir: f.face, st: "run", t: 0, walkPh: 0, hit: false });
  popText("RUNNING MATE: " + d.name + "!", f.x, f.y - 300, "#9fe8ff", 1.0, 24);
  const l = lineOf(f.vp, "intro"); if (l) voice(l.key);
  SFX.special();
}
function updateAssists(dt) {
  for (const a of F.assists) {
    a.t += dt;
    const o = a.target;
    if (a.st === "run") {
      a.x += a.dir * 950 * dt; a.walkPh += dt * 4;
      if ((o.x - a.x) * a.dir < 110 || a.t > 2.2) { a.st = "atk"; a.t = 0; SFX.whoosh(); }
    } else if (a.st === "atk") {
      if (!a.hit && a.t > 0.12) {
        a.hit = true;
        if (F.phase === "fight" && Math.abs(o.x - a.x) < 175 && Math.abs(o.y - FLOOR) < 200)
          hit(a.owner, o, { dmg: 8, hgt: "mid", knock: true, meter: 4, sfx: "heavy", assist: true, unparryable: true, x: o.x - a.dir * 30, y: o.y - 160 });
      }
      if (a.t > 0.45) { a.st = "leave"; a.t = 0; a.dir = -a.dir; }
    } else { a.x += a.dir * 1100 * dt; a.walkPh += dt * 4; }
  }
  F.assists = F.assists.filter((a) => !(a.st === "leave" && (a.x < -140 || a.x > W + 140)));
}
function drawAssist(a) {
  ctx.save(); ctx.translate(a.x, FLOOR); ctx.scale(a.dir * 0.85, 0.85);
  drawDummy(a.d, { cr: 0, lean: a.st === "atk" ? 0.2 : 0.12, arms: a.st === "atk" ? "punch" : "guard", legs: a.st === "atk" ? "stand" : "walk", lying: 0, bob: 0 }, false, a.walkPh);
  ctx.restore();
  label("VP", a.x, FLOOR - 240, 18, "#9fe8ff");
}
function randomVP(...exclude) {
  const c = D.roster.filter((id) => !exclude.includes(id) && !locked(id) && !D.fighters[id].boss);
  return c.length ? pick(c) : null;
}

function startSuper(f) {
  f.meter = 0;
  startAtk(f, "super", { type: f.d.superMove.type, crouch: false });
  f.atk.m = { start: 0.45, act: 0.7, rec: 0.35 };
  f.inv = 0.5;
  F.superFlash = { who: f, t: 1.2 };
  say(f, lineOf(f.id, "super"));
  F.slow = 0.35; F.slowT = 0.45;
  SFX.superGo();
}

function handleInput(f, o, c) {
  if (c.p.assist && f.vp && !f.vpUsed && F.phase === "fight") callVP(f, o);
  const back = f.face === 1 ? "left" : "right", fwd = f.face === 1 ? "right" : "left";
  if (f.st === "jump") {
    if (c.p.up && f.id === "obama" && f.jumps < 1) { // двойной прыжок
      f.jumps++; f.vy = -JUMP_V * 0.85; f.airAtk = false;
      f.vx = (c.h[fwd] ? 1 : c.h[back] ? -1 : 0) * f.face * WALK * 1.2 * f.d.speed * (f.slowT > 0 ? 0.55 : 1);
      spark(f.x, f.y, "dust"); SFX.jump();
      return;
    }
    if ((c.p.kick || c.p.punch) && !f.airAtk) { f.airAtk = true; startAtk(f, "akick"); }
    return;
  }
  const wantSuper = c.p.super || (c.p.punch && c.h.kick) || (c.p.kick && c.h.punch);
  if (wantSuper && f.meter >= 100) { startSuper(f); return; }
  if (c.p.special && startSpecial(f, slotFrom(c, fwd))) return;
  if (c.p.up) {
    const dir = c.h[fwd] ? 1 : c.h[back] ? -1 : 0;
    const sp = f.buffT > 0 ? 1.25 : 1;
    f.vy = -JUMP_V * (f.slowT > 0 ? 0.85 : 1); f.vx = dir * f.face * WALK * 1.15 * f.d.speed * sp * (f.slowT > 0 ? 0.55 : 1);
    f.onGround = false; f.airAtk = false; f.jumps = 0;
    setSt(f, "jump"); SFX.jump();
    return;
  }
  if (c.h.down) {
    f.vx = 0;
    if (c.p.punch || c.p.kick) { setSt(f, "crouch"); startAtk(f, c.p.kick ? "kick" : "cpunch"); f.atk.crouch = true; return; }
    setSt(f, "crouch");
    return;
  }
  // бросок вплотную: вперёд/назад + PUNCH
  if (c.p.punch && (c.h[fwd] || c.h[back]) && Math.abs(o.x - f.x) < MOVES.throw.range && canBeThrown(o)) {
    startAtk(f, "throw", { backThrow: !!c.h[back] });
    return;
  }
  if (c.p.punch) { startAtk(f, "punch"); return; }
  if (c.p.kick) { startAtk(f, "kick"); return; }
  const dir = (c.h[fwd] ? 1 : 0) - (c.h[back] ? 1 : 0);
  f.vx = dir * f.face * WALK * f.d.speed * (dir < 0 ? 0.8 : 1) * (f.buffT > 0 ? 1.25 : 1) * (f.slowT > 0 ? 0.55 : 1);
  setSt(f, dir ? "walk" : "idle");
}

function updateFighter(f, o, dt) {
  f.flash = Math.max(0, f.flash - dt);
  f.inv = Math.max(0, f.inv - dt);
  f.reflectT = Math.max(0, f.reflectT - dt);
  f.buffT = Math.max(0, f.buffT - dt);
  f.deciderT = Math.max(0, f.deciderT - dt);
  for (const s of SLOTS) f.cds[s] = Math.max(0, f.cds[s] - dt);
  f.comboT -= dt; if (f.comboT <= 0) f.combo = 0;
  f.stT += dt;
  if (f.ctl.p.punch) f.lastPunchT = G.time;
  f.shownHp += (f.hp - f.shownHp) * Math.min(1, dt * 3);
  if (f.slowT > 0) f.slowT -= dt;
  if (f.crookT > 0) f.crookT -= dt;
  if (f.chute && (f.chute.dead || !F.proj.includes(f.chute))) {
    f.x = clamp(f.chute.x, WALL_L, WALL_R); f.y = FLOOR; f.vy = 0; f.onGround = true;
    f.hidden = false; f.chute = null; f.inv = 0.3; spark(f.x, f.y - 60, "gold");
  }
  if (f.alpha < 1 && !(f.st === "atk" && f.atk && f.atk.type === "teleport")) f.alpha = Math.min(1, f.alpha + dt * 4);

  const free = f.st === "idle" || f.st === "walk" || f.st === "crouch";
  if (free && f.onGround) f.face = o.x >= f.x ? 1 : -1;

  switch (f.st) {
    case "hurt": case "block":
      f.stun -= dt;
      if (f.stun <= 0) setSt(f, f.onGround ? "idle" : "jump");
      break;
    case "down":
      if (f.onGround && f.stT > 0.75) { f.juggle = 0; if (f.hp <= 0) setSt(f, "ko"); else if (F.phase === "fight") setSt(f, "getup"); }
      break;
    case "getup":
      f.inv = 0.25;
      if (f.stT > 0.38) setSt(f, "idle");
      break;
    case "atk": if (f.atk) updateAttack(f, o, dt); else setSt(f, "idle"); break;
  }

  if (F.phase === "fight" && (f.st === "idle" || f.st === "walk" || f.st === "crouch" || f.st === "jump")) handleInput(f, o, f.ctl);
  if (F.phase !== "fight" && (f.st === "walk" || f.st === "crouch")) { setSt(f, "idle"); f.vx = 0; }

  // физика
  if (!f.onGround) f.vy += GRAV * (F.grav || 1) * dt;
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
  const dashing = f.st === "atk" && f.atk && (f.atk.dash || f.atk.moving);
  if (f.onGround && f.st !== "walk" && !dashing) f.vx -= f.vx * Math.min(1, dt * 9);
  f.x = clamp(f.x, WALL_L, WALL_R);
  if (f.st === "walk") f.walkPh += dt * 2.2 * f.d.speed;
}

function updateAttack(f, o, dt) {
  const a = f.atk, m = a.m, c = f.ctl;
  a.t += dt;
  if (a.kind === "akick") { if (!a.hit && a.t >= m.start) tryHit(f, o, m, a); return; }
  if (a.kind === "special") { updateSpecial(f, o, dt); return; }
  if (a.kind === "super") { updateSuper(f, o, dt); return; }
  if (a.kind === "throw") { updateThrow(f, o, a); return; }
  if (!a.hit && a.t >= m.start && a.t < m.start + m.act) tryHit(f, o, m, a);
  // отмена удара в спецприём (после попадания или блока)
  if (a.hit && c.p.special && a.t < m.start + m.act + m.rec * 0.75) {
    const fwd = f.face === 1 ? "right" : "left";
    if (startSpecial(f, slotFrom(c, fwd))) { popText("CANCEL!", f.x, f.y - 250, "#9fe8ff", 0.5, 20); return; }
  }
  if (a.t >= m.start + m.act + m.rec) { const cr = a.crouch && c.h.down; f.atk = null; setSt(f, cr ? "crouch" : "idle"); }
}

function updateThrow(f, o, a) {
  if (!a.hit && a.t >= a.m.start) {
    a.hit = true;
    if (Math.abs(o.x - f.x) < a.m.range + 10 && canBeThrown(o)) {
      if (G.time - o.lastPunchT < 0.2 && !o.bot) { throwBreak(f, o); return; }
      if (o.bot && o.level > 0 && Math.random() < (o.level >= 3 ? 0.6 : 0.12 * o.level)) { throwBreak(f, o); return; }
      const mul = f.id === "trump" ? 1.2 : 1;
      if (a.backThrow) { o.x = clamp(f.x - f.face * 70, WALL_L, WALL_R); }
      hit(f, o, { dmg: 10 * mul, unblockable: true, unparryable: true, knock: true, throw: true, meter: 10, sfx: "heavy", x: o.x, y: o.y - 150 });
      if (a.backThrow) o.vx = -f.face * 380;
      popText(f.id === "trump" ? "YOU'RE FIRED!" : "THROW!", f.x, f.y - 290, GOLD, 0.8, 26);
    }
  }
  if (a.t >= a.m.start + a.m.act + a.m.rec) { f.atk = null; setSt(f, "idle"); }
}
function throwBreak(f, o) {
  popText("BREAK!", (f.x + o.x) / 2, f.y - 280, "#9fe8ff", 0.8);
  f.atk = null; setSt(f, "hurt"); f.stun = 0.25; f.vx = -f.face * 300;
  o.atk = null; setSt(o, "hurt"); o.stun = 0.25; o.vx = -o.face * 300;
  SFX.block();
}

function tryHit(f, o, m, a) {
  if ((o.st === "down" && o.onGround) || o.st === "ko" || o.inv > 0) return;
  const dx = (o.x - f.x) * f.face;
  if (dx < -20 || dx > m.range + 34) return;
  if (Math.abs(o.y - f.y) > (m.air ? 240 : 150)) return;
  if (m.air && f.y < FLOOR - 300) return;
  if (m.hgt === "high" && isCrouching(o)) return; // ушёл в присед
  a.hit = true;
  hit(f, o, {
    dmg: m.dmg, hgt: m.hgt, stun: m.stun, push: m.push, meter: m.meter, sfx: m.sfx, knock: m.knock, normal: true,
    x: f.x + f.face * m.range * 0.85, y: f.y - (m.hgt === "low" ? 50 : m.air ? 120 : 165),
  });
}

function hit(att, def, h) {
  if (def.d.obj) return objHit(att, def, h);
  if (def.inv > 0 || def.st === "ko") return false;
  const dir = Math.sign(def.x - att.x) || att.face;
  // добивание в воздухе: подброшенного соперника можно ударить ещё дважды
  if (def.st === "down") {
    if (def.onGround || def.juggle >= 2 || def.hp <= 0 || h.throw) return false;
    def.juggle++;
    const jd = h.dmg * powerOf(att) * 0.6 * (F.debate && h.normal ? 0.3 : 1);
    def.hp = Math.max(F.opts.training ? 1 : 0, def.hp - jd);
    def.vy = -560; def.vx = dir * 220; def.flash = 0.12;
    att.combo++; att.comboT = 1.1; if (att.combo >= 2) F.comboShow = { who: att, n: att.combo, t: 1.2 };
    F.stats[att.side].maxCombo = Math.max(F.stats[att.side].maxCombo, att.combo);
    att.meter = Math.min(100, att.meter + 6);
    if (def.juggle === 1) popText("JUGGLE!", def.x, def.y - 240, "#9fe8ff", 0.6, 22);
    spark(h.x ?? def.x, h.y ?? def.y - 100, "hit"); SFX.hit(); F.hitstop = 0.05;
    if (def.hp <= 0 && F.phase === "fight") onKO(att, def);
    return true;
  }
  // Буш: уклон от ботинка и контрудар
  if (def.st === "atk" && def.atk && def.atk.type === "parry" && def.atk.t >= 0.05 && def.atk.t < 0.6 && !h.unparryable) {
    bushCounter(def, att);
    return false;
  }
  // Клинтон: «I feel your pain» — урон уходит обратно
  if (def.reflectT > 0 && !h.reflected) {
    popText("REFLECTED!", def.x, def.y - 280, GOLD);
    spark(def.x, def.y - 150, "gold");
    return hit(def, att, Object.assign({}, h, { reflected: true, unparryable: true, unblockable: true, throw: false, x: att.x, y: att.y - 150 }));
  }
  if (!h.unblockable && canBlock(def, att, h.hgt)) {
    // Буш: «I'm the Decider» — каждый блок превращается в контратаку
    if (def.deciderT > 0 && !h.unparryable && Math.abs(def.x - att.x) < 260) { bushCounter(def, att); return false; }
    def.crouchBlock = isCrouching(def);
    setSt(def, "block");
    def.stun = (h.stun || 0.25) * 0.7;
    def.vx = dir * (h.push || 160) * 0.7 * (def.id === "trump" ? 0.6 : 1);
    if (h.chip) def.hp = Math.max(1, def.hp - h.dmg * 0.12);
    att.meter = Math.min(100, att.meter + 3);
    def.meter = Math.min(100, def.meter + 4);
    spark(h.x ?? def.x, h.y ?? def.y - 150, "block");
    SFX.block();
    F.hitstop = 0.04;
    return false;
  }
  let dmg = h.dmg * powerOf(att) * Math.max(0.5, 1 - att.combo * 0.1);
  if (F.debate && h.normal) dmg *= 0.3;
  if (def.id === "bushsr" && h.owner) dmg *= 0.85; // KINDER, GENTLER
  if (att.tyga) { dmg *= 1.6; att.tyga = false; popText("THERE YOU GO AGAIN!", att.x, att.y - 300, GOLD, 1.0, 26); }
  // броня: выдерживает удар без остановки
  if (def.armor > 0 && !h.throw) {
    def.armor--;
    def.hp = Math.max(F.opts.training ? 1 : 0, def.hp - dmg * 0.7);
    def.flash = 0.12;
    popText("ARMOR!", def.x, def.y - 260, "#ffb04a", 0.6, 24);
    spark(h.x ?? def.x, h.y ?? def.y - 150, "block"); SFX.block();
    F.hitstop = 0.05;
    if (def.hp <= 0 && F.phase === "fight") { setSt(def, "down"); def.vy = -700; def.vx = dir * 380; def.onGround = false; onKO(att, def); }
    return true;
  }
  // Никсон: «I am not a crook» — раз за раунд отмахивается от удара
  if (def.id === "nixon" && !def.crookUsed && def.hp - dmg < def.maxHp * 0.15 && !F.opts.training) {
    def.crookUsed = true; def.crookT = 0.7; def.atk = null; setSt(def, "idle"); def.vx = dir * 120;
    popText("I AM NOT A CROOK!", def.x, def.y - 300, GOLD, 1.2, 28); spark(def.x, def.y - 160, "gold"); SFX.block(); F.hitstop = 0.08;
    return false;
  }
  if (def.dmgLog) def.dmgLog.push({ t: G.time, d: dmg });
  def.hp = Math.max(F.opts.training ? 1 : 0, def.hp - dmg);
  def.flash = 0.12;
  att.combo++; att.comboT = 1.1;
  { const st = F.stats[att.side]; st.maxCombo = Math.max(st.maxCombo, att.combo);
    if (h.throw) st.throws++; if (att.atk && att.atk.kind === "super") st.supers++; }
  if (att.combo >= 2) F.comboShow = { who: att, n: att.combo, t: 1.2 };
  att.meter = Math.min(100, att.meter + (h.meter ?? 8));
  def.meter = Math.min(100, def.meter + 5);
  def.crouchHurt = isCrouching(def);
  def.atk = null; def.armor = 0; def.ghost = false;
  const kb = def.id === "trump" ? 0.6 : 1;
  if (def.hp <= 0 || h.knock) {
    setSt(def, "down");
    def.vy = -700; def.vx = dir * 380 * kb; def.onGround = false; def.juggle = 0;
  } else {
    setSt(def, "hurt");
    def.stun = h.stun || 0.3;
    def.vx = dir * (h.push || 160) * kb;
  }
  if (h.steal && def.hp > 0) { const t = Math.min(def.meter, h.steal); def.meter -= t; att.meter = Math.min(100, att.meter + t); popText("BUGGED!", def.x, def.y - 290, "#ff9a9a", 0.8, 26); }
  if (h.slow && def.hp > 0) { def.slowT = h.slow; popText("RED TAPE!", def.x, def.y - 290, "#ff6b6b", 0.8, 26); }
  if (h.pull && def.hp > 0) { def.vx = -dir * 1100; def.stun = 0.6; popText("GET OVER HERE!", att.x, att.y - 290, GOLD, 0.8); }
  spark(h.x ?? def.x, h.y ?? def.y - 150, "hit");
  (SFX[h.sfx] || SFX.hit)();
  F.hitstop = h.knock ? 0.11 : 0.06;
  F.shake = Math.max(F.shake, h.knock ? 13 : 5);
  if (navigator.vibrate && isTouch && !def.bot) navigator.vibrate(h.knock ? 40 : 15);
  if (def.hp <= 0 && F.phase === "fight") onKO(att, def);
  return true;
}

function objHit(att, def, h) {
  if (def.d.inv || F.bonusDone || F.phase !== "fight") return false;
  const dmg = h.dmg * Math.max(0.6, powerOf(att)) * 1.4;
  def.hp = Math.max(0, def.hp - dmg); def.flash = 0.12;
  att.combo++; att.comboT = 1.1; if (att.combo >= 2) F.comboShow = { who: att, n: att.combo, t: 1.2 };
  att.meter = Math.min(100, att.meter + 8);
  spark(h.x ?? def.x, h.y ?? def.y - 180, "hit"); spark(def.x + rnd(-40, 40), def.y - 220, "gold");
  (SFX[h.sfx] || SFX.hit)();
  F.hitstop = 0.05; F.shake = Math.max(F.shake, h.knock ? 12 : 5);
  if (def.hp <= 0) {
    F.bonusDone = true; F.flashScreen = 0.4;
    for (let i = 0; i < 8; i++) spark(def.x + rnd(-60, 60), def.y - rnd(60, 260), i % 2 ? "gold" : "hit");
    popText("SMASHED!", def.x, def.y - 300, GOLD, 1.6, 48);
  }
  return true;
}

function bushCounter(b, att) {
  popText("DODGED!", b.x, b.y - 290, GOLD);
  b.face = Math.sign(att.x - b.x) || b.face;
  b.atk = { kind: "special", type: "counter", m: SP_TIME.counter, t: 0, hit: false, fired: false, crouch: false };
  setSt(b, "atk");
  b.inv = 0.25;
  b.meter = Math.min(100, b.meter + 15); // удачный уклон даёт шкалу
  F.hitstop = 0.09;
  SFX.block();
}

// Контактный удар во время спецприёма
function contact(f, o, a, h) {
  if (a.hit) return;
  if ((o.st === "down" && o.onGround) || o.st === "ko" || o.inv > 0) return;
  const dx = (o.x - f.x) * f.face;
  if (dx < -30 || dx > h.range) return;
  if (Math.abs(o.y - f.y) > (h.airOnly ? 400 : 160)) return;
  if (h.hgt === "high" && isCrouching(o)) return;
  a.hit = true;
  hit(f, o, Object.assign({ x: o.x, y: o.y - 150, sfx: "heavy" }, h));
}

function updateSpecial(f, o, dt) {
  const a = f.atk, m = a.m, act = a.t >= m.start && a.t < m.start + m.act;
  if (a.type === "teleport" && !a.fired) f.alpha = clamp(1 - a.t / 0.28, 0.08, 1);
  if (!a.fired && a.t >= m.start) { a.fired = true; fireSpecial(f, o, a.type); }
  switch (a.type) {
    case "teleport":
      if (a.fired && !a.hit && a.t >= m.start + 0.06) { a.hit = true; if (Math.abs(o.x - f.x) < 160) hit(f, o, { dmg: 12, hgt: "mid", stun: 0.4, push: 260, meter: 10, sfx: "heavy", x: o.x, y: o.y - 150 }); }
      break;
    case "counter":
      if (!a.hit && a.t >= m.start) { a.hit = true; if (Math.abs(o.x - f.x) < 190) hit(f, o, { dmg: 14, hgt: "mid", knock: true, unparryable: true, unblockable: true, meter: 12, sfx: "heavy", x: o.x, y: o.y - 190 }); }
      break;
    case "brush":
      if (act) { a.moving = true; f.vx = f.face * 850; contact(f, o, a, { range: 100, dmg: 9, hgt: "mid", stun: 0.4, push: 260, meter: 10 }); } else a.moving = false;
      break;
    case "jog":
      if (act) { a.moving = true; f.ghost = true; f.vx = f.face * 1150; if (G.time % 0.06 < 0.02) spawnDust(f.x); }
      else { a.moving = false; f.ghost = false; }
      break;
    case "townhall":
      if (act) { f.meter = Math.min(100, f.meter + 50 * dt); if (Math.random() < 0.1) spark(f.x, f.y - 260, "gold"); }
      break;
    case "deal":
      if (!a.hit && a.t >= m.start) {
        a.hit = true;
        if (Math.abs(o.x - f.x) < 150 && canBeThrown(o)) {
          o.x = clamp(f.x + f.face * 70, WALL_L, WALL_R);
          hit(f, o, { dmg: 12, unblockable: true, unparryable: true, knock: true, throw: true, meter: 12, sfx: "heavy", x: o.x, y: o.y - 160 });
          o.vx = f.face * 520; o.vy = -820;
          popText("THE DEAL!", f.x, f.y - 300, GOLD, 0.9, 30);
        }
      }
      break;
    case "bigleague":
      if (act) contact(f, o, a, { range: 140, dmg: 12, hgt: "mid", knock: true, meter: 12 });
      if (a.t >= m.start + m.act) f.armor = 0;
      break;
    case "fastbreak":
      if (act) { a.moving = true; f.vx = f.face * 1000; contact(f, o, a, { range: 90, dmg: 8, hgt: "low", stun: 0.5, push: 200, meter: 10 }); } else a.moving = false;
      break;
    case "spike":
      if (act) contact(f, o, a, { range: 170, dmg: 12, hgt: "mid", knock: true, meter: 12, y: o.y - 220 });
      break;
  }
  if (a.t >= m.start + m.act + m.rec) { f.atk = null; f.ghost = false; setSt(f, "idle"); }
}

function fireSpecial(f, o, type) {
  const x = f.x + f.face * 70;
  switch (type) {
    case "notes": addProj(f, { kind: "notes", x, y: f.y - 150, vx: f.face * 540, w: 70, h: 70, dmg: 9, hgt: "mid", stun: 0.35, push: 200, life: 2.6 }); break;
    case "fired": addProj(f, { kind: "fired", x, y: f.y - 120, vx: f.face * 800, w: 60, h: 160, dmg: 10, hgt: "mid", stun: 0.4, push: 320, life: 0.55 }); break;
    case "lasso": addProj(f, { kind: "lasso", x, y: f.y - 170, vx: f.face * 1150, w: 50, h: 44, dmg: 9, hgt: "high", stun: 0.6, push: 0, pull: true, life: 0.42, from: f }); break;
    case "ball": addProj(f, { kind: "ball", x, y: f.y - 210, vx: f.face * 560, vy: -760, g: 2000, w: 46, h: 46, dmg: 12, hgt: "over", stun: 0.4, push: 220, life: 3, bounces: 1 }); break;
    case "hat": addProj(f, { kind: "hat", x, y: f.y - 190, vx: f.face * 720, w: 60, h: 34, dmg: 7, hgt: "high", stun: 0.35, push: 160, life: 1.5, boomerang: 0.45, from: f }); break;
    case "beans":
      [380, 520, 660].forEach((v) => addProj(f, { kind: "bean", x, y: f.y - 180, vx: f.face * v, vy: -620, g: 1800, w: 24, h: 24, dmg: 4, hgt: "over", stun: 0.25, push: 90, life: 2, meter: 4, color: pick(["#e74c3c", "#f1c40f", "#2ecc71", "#9b59b6", "#ff8fb1"]) }));
      break;
    case "tv": addProj(f, { kind: "tv", x, y: f.y - 150, vx: f.face * 600, w: 70, h: 60, dmg: 10, hgt: "mid", stun: 0.4, push: 220, life: 2.4 }); break;
    case "subpoena": addProj(f, { kind: "subpoena", x, y: f.y - 160, vx: f.face * 640, w: 64, h: 44, dmg: 10, hgt: "mid", stun: 0.4, push: 220, life: 2.4 }); break;
    case "lights":
      [-60, 0, 60].forEach((dy, i) => addProj(f, { kind: "light", x, y: f.y - 150 + dy, vx: f.face * (560 + i * 40), w: 40, h: 40, dmg: 6, hgt: dy > 0 ? "mid" : "high", stun: 0.25, push: 90, life: 2.2, meter: 3 }));
      break;
    case "broccoli": addProj(f, { kind: "broccoli", x, y: f.y - 200, vx: f.face * 520, vy: -700, g: 1900, w: 46, h: 46, dmg: 11, hgt: "over", stun: 0.6, push: 160, life: 3 }); break;
    case "lips":
      popText("READ MY LIPS!", f.x, f.y - 330, GOLD, 1.0, 28);
      if (Math.abs(o.x - f.x) < 360) {
        const take = Math.min(o.meter, 30);
        o.meter -= take; f.meter = Math.min(100, f.meter + 20);
        popText("NO NEW TAXES!", o.x, o.y - 300, "#ff9a9a", 1.0, 24);
        spark(o.x, o.y - 160, "gold");
      }
      break;
    case "pingpong": addProj(f, { kind: "pong", x, y: f.y - 175, vx: f.face * 980, w: 28, h: 28, dmg: 7, hgt: "high", stun: 0.3, push: 120, life: 1.4, meter: 6 }); break;
    case "checkers": addProj(f, { kind: "dog", x, y: f.y - 32, vx: f.face * 600, w: 90, h: 64, dmg: 8, hgt: "low", stun: 0.5, push: 200, life: 2.2, meter: 8 }); break;
    case "record":
      for (const q of F.proj) if (q.kind === "recorder" && q.owner === f) q.dead = true;
      addProj(f, { kind: "recorder", x: clamp(f.x + f.face * 150, WALL_L, WALL_R), y: f.y - 40, w: 90, h: 80, dmg: 5, hgt: "low", stun: 0.6, push: 60, life: 5, steal: 15, fixed: true, meter: 0 });
      break;
    case "tape": addProj(f, { kind: "tape", x, y: f.y - 130, vx: f.face * 820, w: 80, h: 70, dmg: 6, hgt: "mid", stun: 0.35, push: 80, life: 0.7, slow: 1.8 }); break;
    case "decider": f.deciderT = 2.2; popText("I'M THE DECIDER!", f.x, f.y - 330, GOLD, 1.2, 26); break;
    case "yeswecan": f.buffT = 5; popText("YES WE CAN!", f.x, f.y - 330, "#9fe8ff", 1.2, 30); spark(f.x, f.y - 150, "tv"); break;
    case "townhall": popText("TOWN HALL", f.x, f.y - 330, GOLD, 0.8, 24); break;
    case "teleport": {
      const side = Math.sign(o.x - f.x) || 1;
      f.x = clamp(o.x + side * 100, WALL_L, WALL_R);
      f.face = Math.sign(o.x - f.x) || -side;
      f.alpha = 1;
      spark(f.x, f.y - 150, "paper");
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
      case "parachute": {
        f.hidden = true; f.inv = 2.2;
        f.chute = addProj(f, { kind: "chute", x: o.x, y: -220, vy: 620, w: 120, h: 120, dmg: 22, hgt: "over", knock: true, life: 2.0, fall: true, meter: 0 });
        spark(f.x, f.y - 150, "gold");
        break;
      }
      case "erase": {
        // «Стереть плёнку»: Никсон возвращает урон последних 8 секунд, соперник замирает
        const lost = (f.dmgLog || []).filter((e) => G.time - e.t < 6).reduce((s, e) => s + e.d, 0);
        const heal = Math.min(lost * 0.5, f.maxHp * 0.1);
        f.hp = Math.min(f.maxHp, f.hp + heal); f.dmgLog = [];
        if (heal > 1) popText(`+${Math.round(heal)} ERASED`, f.x, f.y - 300, "#7dff9a", 1.2, 28);
        F.staticT = 0.7; F.flashScreen = 0.25;
        if (o.st !== "ko" && o.st !== "down" && o.inv <= 0 && !(o.atk && o.atk.kind === "super")) { o.atk = null; setSt(o, "hurt"); o.stun = 0.5; o.vx = 0; popText("18 MINUTES MISSING", o.x, o.y - 300, "#ff9a9a", 1.2, 24); }
        break;
      }
      case "shutdown":
        F.darkT = 2.8; F.flashScreen = 0.3;
        for (let i = 0; i < 6; i++) addProj(f, { kind: "cash", x: clamp(o.x + rnd(-180, 180), 60, W - 60), y: -80 - i * 200, vy: 1250, w: 60, h: 40, dmg: 7, hgt: "over", life: 2.6, fall: true, meter: 0 });
        break;
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
function addProj(owner, p) { p.owner = owner; p.t = 0; p.vy = p.vy || 0; p.vx = p.vx || 0; F.proj.push(p); return p; }
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
    if (p.boomerang && p.t >= p.boomerang && !p.returning) { p.returning = true; p.vx = -p.vx; p.hitDone = false; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > p.life || p.x < -250 || p.x > W + 250) p.dead = true;
    if (p.returning && Math.abs(p.x - p.owner.x) < 40) p.dead = true;
    if ((p.kind === "ball" || p.kind === "bean") && p.y > FLOOR - p.h / 2) {
      if (p.bounces > 0) { p.bounces--; p.y = FLOOR - p.h / 2; p.vy = -Math.abs(p.vy) * 0.55; SFX.land(); }
      else { p.dead = true; spark(p.x, FLOOR - 20, "dust"); }
    }
    if (p.kind === "chute") { const t = other(p.owner); p.x += clamp(t.x - p.x, -1, 1) * Math.min(Math.abs(t.x - p.x), 220 * dt); }
    if (p.fall && p.y > FLOOR - p.h / 2) { p.dead = true; spawnDust(p.x); F.shake = Math.max(F.shake, 9); SFX.heavy(); }
    if (p.dead) continue;
    const def = other(p.owner);
    const hittable = !(def.st === "down" && def.onGround) && def.st !== "ko" && def.inv <= 0;
    if (hittable && !p.hitDone && overlap(p, fighterBox(def))) {
      if (p.boomerang) p.hitDone = true; else p.dead = true;
      hit(p.owner, def, Object.assign({}, p, { x: p.x, y: p.y }));
    }
  }
  // встречные снаряды гасят друг друга
  for (const a of F.proj) for (const b of F.proj) {
    if (a !== b && !a.dead && !b.dead && a.owner !== b.owner && !a.fall && !b.fall && !a.fixed && !b.fixed && overlap(a, { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h })) {
      a.dead = b.dead = true; spark((a.x + b.x) / 2, (a.y + b.y) / 2, "gold"); SFX.block();
    }
  }
  F.proj = F.proj.filter((p) => !p.dead);
}

function spark(x, y, kind) {
  const col = { hit: ["#fff7a8", "#ffd54a", "#ff8a3d"], block: ["#bfe3ff", "#6fb6ff", "#ffffff"], gold: ["#ffd54a", "#fff3b0"], dust: ["#cdbb9a", "#a8967a"], tv: ["#6fd3ff", "#ffffff", "#2a6fff"], paper: ["#f4f1e6", "#ffffff", "#b22234"], cash: ["#7bc96f", "#2e7d32", "#e8f5e9"] }[kind] || ["#fff"];
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
  { react: 0.42, block: 0.2, aggr: 0.45, sup: 0.35, combo: 0.15 },
  { react: 0.26, block: 0.45, aggr: 0.6, sup: 0.65, combo: 0.4 },
  { react: 0.15, block: 0.72, aggr: 0.75, sup: 0.9, combo: 0.7 },
  { react: 0.1, block: 0.86, aggr: 0.85, sup: 1, combo: 0.85 }, // IMPEACHMENT MODE
];
// Насколько боту хочется сделать спецприём этого типа на такой дистанции (0..1)
const AI_USE = {
  parry: (d, o, oAtk) => (oAtk && d < 220 ? 0.6 : 0),
  brush: (d) => (d > 140 && d < 320 ? 0.35 : 0),
  decider: (d, o, oAtk) => (d < 260 && !oAtk ? 0.08 : 0),
  notes: (d) => (d > 260 ? 0.45 : 0),
  jog: (d) => (d < 200 ? 0.1 : 0),
  townhall: (d) => (d > 450 ? 0.3 : 0),
  fired: (d) => (d > 150 && d < 420 ? 0.4 : 0),
  deal: (d, o) => (d < 150 ? (o.st === "block" ? 0.45 : 0.12) : 0),
  bigleague: (d) => (d < 170 ? 0.25 : 0),
  lasso: (d) => (d > 200 && d < 470 ? 0.5 : 0),
  hat: (d) => (d > 220 ? 0.35 : 0),
  beans: (d) => (d > 250 && d < 650 ? 0.3 : 0),
  ball: (d) => (d > 260 ? 0.45 : 0),
  fastbreak: (d) => (d > 140 && d < 360 ? 0.3 : 0),
  yeswecan: () => 0.1,
  teleport: (d) => (d > 240 ? 0.35 : 0),
  tv: (d) => (d > 260 ? 0.4 : 0),
  spike: (d, o) => (!o.onGround && d < 220 ? 0.7 : 0),
  tape: (d, o) => (d > 180 && !(o.slowT > 0) ? 0.45 : 0),
  subpoena: (d) => (d > 260 ? 0.4 : 0),
  lights: (d) => (d > 240 ? 0.42 : 0),
  broccoli: (d) => (d > 260 && d < 640 ? 0.32 : 0),
  lips: (d, o) => (d < 340 && o.meter > 35 ? 0.5 : 0),
  pingpong: (d) => (d > 200 ? 0.45 : 0),
  checkers: (d) => (d > 220 && d < 700 ? 0.35 : 0),
  record: (d, o, oAtk, f) => (d > 160 && d < 420 && !(F.proj || []).some((p) => p.kind === "recorder" && p.owner === f) ? 0.25 : 0),
};
const COMBO_TYPES = ["pingpong", "brush", "fired", "bigleague", "fastbreak", "notes", "ball", "lasso", "tv", "deal", "subpoena", "tape"];
function aiUpdate(f, o, dt) {
  const c = f.ctl, L = LV[f.level], ai = f.ai;
  for (const a of ACTIONS) c.p[a] = false;
  c.h.punch = c.h.kick = c.h.special = c.h.super = c.h.up = c.h.assist = false;
  if (F.phase !== "fight") { c.h.left = c.h.right = c.h.down = false; return; }
  const back = f.face === 1 ? "left" : "right", fwd = f.face === 1 ? "right" : "left";
  const dist = Math.abs(o.x - f.x);
  const press = (a) => { c.p[a] = true; c.h[a] = true; };
  const useSlot = (slot) => { c.h.down = slot === "d"; c.h[fwd] = slot === "f"; c.h[back] = false; press("special"); };
  const apply = () => { c.h.left = !!ai.hold.left; c.h.right = !!ai.hold.right; c.h.down = !!ai.hold.down; };
  // удар ногой в прыжке
  if (f.st === "jump" && !f.airAtk && f.vy > -250 && dist < 180 && Math.random() < 0.15 + L.aggr * 0.5) { press("kick"); return; }
  // комбо: отмена попавшего удара в спецприём
  if (f.st === "atk" && f.atk && !f.atk.aiTried && f.atk.hit && ["punch", "kick", "cpunch"].includes(f.atk.kind)) {
    f.atk.aiTried = true;
    if (Math.random() < L.combo) {
      const slot = SLOTS.find((s) => f.d.specials[s] && f.cds[s] <= 0 && COMBO_TYPES.includes(f.d.specials[s].type));
      if (slot) { useSlot(slot); return; }
    }
  }
  // добивание подброшенного соперника
  if (o.st === "down" && !o.onGround && o.juggle < 2 && dist < 150 && f.st !== "atk" && Math.random() < L.combo) { press(Math.random() < 0.5 ? "punch" : "kick"); return; }
  ai.t -= dt;
  if (ai.t > 0) { apply(); return; }
  ai.t = L.react * rnd(0.6, 1.4);
  ai.hold = {};

  const threat = F.proj.find((p) => p.owner === o && !p.fall && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - f.x) < 400)
              || F.proj.find((p) => p.owner === o && p.fall && Math.abs(p.x - f.x) < 220);
  if (threat && Math.random() < L.block + 0.1) {
    if (threat.fall || threat.hgt === "over") ai.hold[back] = true;
    else if (threat.hgt === "high") ai.hold.down = true;
    else if (Math.random() < 0.4) press("up");
    else ai.hold.down = true;
    apply(); return;
  }
  if (f.vp && !f.vpUsed && dist > 180 && dist < 700 && o.st !== "block" && Math.random() < 0.04 + f.level * 0.03) press("assist");
  if (o.reflectT > 0 && Math.random() < L.block + 0.2) { ai.hold[back] = true; apply(); return; } // не бить в отражение
  const oAtk = o.st === "atk" && o.atk && o.atk.t < o.atk.m.start + (o.atk.m.act || 0) && o.atk.kind !== "special";
  if (oAtk && dist < 200 && Math.random() < L.block) {
    const parrySlot = SLOTS.find((s) => f.d.specials[s] && f.d.specials[s].type === "parry" && f.cds[s] <= 0);
    if (parrySlot && Math.random() < 0.6) { useSlot(parrySlot); return; }
    if (o.atk.kind === "kick" || o.atk.kind === "cpunch") ai.hold.down = true; else ai.hold[back] = true;
    apply(); return;
  }
  if (f.meter >= 100 && dist < 430 && Math.random() < L.sup) { press("super"); return; }
  // бросок против блокирующего
  if (dist < 100 && (o.st === "block" || (o.st === "idle" && Math.random() < 0.3)) && Math.random() < 0.25 + L.aggr * 0.3) { c.h[fwd] = true; press("punch"); return; }
  // спецприёмы: выбираем по дистанции
  const opts = SLOTS.filter((s) => f.d.specials[s] && f.cds[s] <= 0).map((s) => ({ s, w: (AI_USE[f.d.specials[s].type] || (() => 0))(dist, o, oAtk, f) }));
  for (const op of shuffle(opts)) if (Math.random() < op.w) { useSlot(op.s); return; }
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
  const c2 = opts.level2 == null && !opts.training && !opts.bonus ? new Ctl(MAPS.p2, false) : new Ctl(null, false);
  F = {
    opts, p: [makeFighter(opts.p1, 0, c1, opts.level1, opts.skin1), makeFighter(opts.p2, 1, c2, opts.level2, opts.skin2)],
    arena: opts.arena, round: 1, proj: [], parts: [], texts: [],
    phase: "intro", phaseT: 0, timer: ROUND_TIME, roundTime: ROUND_TIME, winsNeeded: WINS_NEEDED, hitstop: 0, shake: 0, slow: 1, slowT: 0,
    isBoss: !!opts.boss, altBg: false, winner: null, matchWinner: null, comboShow: null, superFlash: null, flashScreen: 0,
    dummy: "stand", bubbles: [], assists: [], haz: [], evT: rnd(8, 13), freezeT: 0, adDone: false,
    stats: [0, 1].map(() => ({ maxCombo: 0, supers: 0, throws: 0, perfect: 0, fatal: false })),
    approval: null,
  };
  if (opts.bonus) {
    F.bonus = opts.bonus; F.roundTime = F.timer = BONUS_TIME; F.winsNeeded = 1;
    F.items = []; F.score = 0; F.spawnT = 1.0; F.bonusDone = false; F.bonusPts = 0;
    if (opts.bonus === "ballots") F.p[1].x = WALL_R - 40;
    if (opts.bonus === "hands") F.p[1].x = W / 2;
  }
  if (opts.daily) {
    const m = opts.daily; F.mods = m;
    if (m === "filibuster") { F.roundTime = F.timer = 99; for (const f of F.p) { f.maxHp = Math.round(f.maxHp * 1.5); f.hp = f.shownHp = f.maxHp; } }
    if (m === "snap") { F.roundTime = F.timer = 30; F.winsNeeded = 1; }
    if (m === "swing") F.grav = 0.55;
    if (m === "tuesday") F.meterMul = 3;
    if (m === "debate") F.debate = true;
    if (m === "scandal") F.drain = true;
  }
  F.p[0].vp = opts.vp1 || null; F.p[1].vp = opts.training ? null : (opts.vp2 || null);
  if (opts.hpMult) { const b = F.p[1]; b.maxHp = Math.round(b.maxHp * opts.hpMult); b.hp = b.shownHp = b.maxHp; }
  G.paused = false;
  go("fight");
  SFX.round();
}

function onKO(att, def) {
  // Дядя Свомп в роли босса: один раз за бой встаёт снова
  if (def.d.tooBig !== false && def.id === "swamp" && F.isBoss && !F.bailout) {
    F.bailout = true;
    def.hp = def.shownHp = Math.round(def.maxHp * 0.25);
    def.inv = 1.4; F.flashScreen = 0.6; F.shake = 14;
    popText(D.texts.bailout, W / 2, 250, "#7bc96f", 2, 56);
    popText("BAILOUT APPROVED", W / 2, 310, WHITE, 2, 26);
    for (let i = 0; i < 10; i++) spark(def.x + rnd(-80, 80), def.y - rnd(40, 260), "cash");
    SFX.special();
    return;
  }
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
  if (w && !(w.wins >= F.winsNeeded) && w.hp >= w.maxHp) F.stats[w.side].perfect++;
  if (w && w.wins >= F.winsNeeded) {
    F.matchWinner = w;
    F.phase = "finish"; F.phaseT = 0;
    if (w.hp >= w.maxHp) { popText(D.texts.perfect, W / 2, 300, GOLD, 1.6, 48); F.stats[w.side].perfect++; }
    return;
  }
  if (F.round >= MAX_ROUNDS) {
    const [a, b] = F.p;
    F.matchWinner = a.wins > b.wins ? a : b.wins > a.wins ? b : (a.hp >= b.hp ? a : b);
    enterOver();
    return;
  }
  F.round++;
  for (const f of F.p) { const m = f.meter; resetFighter(f); f.meter = m; }
  F.proj = []; F.assists = []; F.haz = []; F.adDone = false; F.evT = rnd(8, 13); F.timer = F.roundTime; F.winner = null;
  F.phase = "intro"; F.phaseT = 0;
  SFX.round();
}

// Рейтинг одобрения за бой (для каждой стороны)
function approvalOf(side) {
  const s = F.stats[side], f = F.p[side], won = F.matchWinner === f;
  const a = 28 + (won ? 22 : 0) + s.perfect * 7 + Math.min(s.maxCombo, 10) * 2 + s.supers * 4 + s.throws +
    (s.fatal ? 8 : 0) + Math.round(10 * f.hp / f.maxHp) + (won ? Math.round(F.timer / 12) : 0);
  return clamp(Math.round(a), 3, 97);
}
function enterOver() {
  F.phase = "over"; F.phaseT = 0; SFX.win();
  F.approval = [approvalOf(0), approvalOf(1)];
  say(F.matchWinner, lineOf(F.matchWinner.id, "win"));
}
function say(f, line, life = 2.2) {
  if (!line || !F) return;
  F.bubbles = F.bubbles.filter((b) => b.f !== f);
  F.bubbles.push({ f, s: line.s, t: 0, life });
  voice(line.key);
}

function updateFight(dt) {
  if (G.paused) return updatePause();
  if (justPressed.has("Escape") || justPressed.has("KeyP") || touch.p.pause) { G.paused = true; G.pauseSel = 0; SFX.back(); return; }
  for (const f of F.p) {
    if (f.bot) aiUpdate(f, other(f), dt);
    else if (F.opts.training && f.side === 1) dummyUpdate(f, other(f), dt);
    else f.ctl.poll();
  }

  F.texts.forEach((t) => (t.t += dt));
  F.texts = F.texts.filter((t) => t.t < t.life);
  F.bubbles.forEach((b) => (b.t += dt));
  F.bubbles = F.bubbles.filter((b) => b.t < b.life);
  if (F.superFlash) { F.superFlash.t -= dt; if (F.superFlash.t <= 0) F.superFlash = null; }
  if (F.comboShow) { F.comboShow.t -= dt; if (F.comboShow.t <= 0) F.comboShow = null; }
  F.flashScreen = Math.max(0, F.flashScreen - dt);
  F.shake = Math.max(0, F.shake - dt * 40);

  if (F.hitstop > 0) { F.hitstop -= dt; return; }
  if (F.freezeT > 0) { F.freezeT -= dt; if (F.freezeT <= 0) popText("AND WE'RE BACK!", W / 2, 260, GOLD, 1.2, 44); return; }
  if (F.slowT > 0) { F.slowT -= dt; dt *= F.slow; }
  F.phaseT += dt;

  switch (F.phase) {
    case "intro":
      if (F.phaseT > 1.8) { F.phase = "fight"; F.phaseT = 0; }
      break;
    case "fight":
      if (F.opts.training) { trainingTick(); break; }
      if (F.bonus) { bonusTick(dt); break; }
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
      if (press) { F.phase = "fatality"; F.phaseT = 0; SFX.fatal(); F.flashScreen = 0.5; F.stats[w.side].fatal = true; }
      else if (F.phaseT > 2.6) enterOver();
      break;
    }
    case "fatality":
      if (F.phaseT > 4.2) enterOver();
      break;
    case "bonusover":
      if (F.phaseT > 0.5 && F.p[0].st !== "win" && F.p[0].onGround && !F.p[0].atk) setSt(F.p[0], "win");
      if (F.phaseT > 2.6) finishMatch();
      break;
    case "over":
      if (F.phaseT > 0.6 && F.matchWinner.st !== "win") setSt(F.matchWinner, "win");
      if (F.phaseT > 2.6) finishMatch();
      break;
  }

  const m0 = [F.p[0].meter, F.p[1].meter];
  if (F.drain && F.phase === "fight") for (const f of F.p) f.hp = Math.max(1, f.hp - 1.3 * dt);
  updateFighter(F.p[0], F.p[1], dt);
  if (!F.p[1].d.obj) updateFighter(F.p[1], F.p[0], dt);
  else { F.p[1].flash = Math.max(0, F.p[1].flash - dt); F.p[1].shownHp += (F.p[1].hp - F.p[1].shownHp) * Math.min(1, dt * 3); }

  // бойцы не проходят друг сквозь друга
  const [a, b] = F.p;
  const dashing = (f) => f.st === "atk" && f.atk && (f.atk.dash || f.ghost);
  if (a.onGround && b.onGround && !dashing(a) && !dashing(b) && !b.d.hidden && a.st !== "down" && b.st !== "down" && a.st !== "ko" && b.st !== "ko") {
    const dx = b.x - a.x, minD = 78;
    if (Math.abs(dx) < minD) {
      const push = (minD - Math.abs(dx)) / 2, s = dx >= 0 ? 1 : -1;
      a.x = clamp(a.x - s * push, WALL_L, WALL_R); b.x = clamp(b.x + s * push, WALL_L, WALL_R);
    }
  }
  updateProj(dt);
  updateAssists(dt);
  updateHazards(dt);
  if (F.darkT > 0) F.darkT -= dt;
  if (F.staticT > 0) F.staticT -= dt;
  if (F.meterMul) F.p.forEach((f, i) => { const d = f.meter - m0[i]; if (d > 0) f.meter = Math.min(100, f.meter + d * (F.meterMul - 1)); });
  for (const p of F.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; }
  F.parts = F.parts.filter((p) => p.t < p.life);

  // Босс: на половине здоровья кабинет превращается в студию
  if (F.isBoss && !F.altBg && F.p[1].hp < F.p[1].maxHp * 0.5) {
    F.altBg = true; F.flashScreen = 0.6;
    popText(D.texts.swamp, W / 2, 260, "#7bc96f", 2, 56);
    SFX.special();
  }
}

// Живые арены: случайные события
const ARENA_EVENTS = {
  fair: "pig", carnival: "pig", texas: "tumbleweed", boxing: "chair", wrestling: "chair",
  vegas: "coins", tvshow: "adbreak", ballroom: "cork", congress: "papers",
};
function hazardHit(f, h) {
  if (f.d.obj || f.inv > 0 || f.st === "ko" || f.st === "down" || F.phase !== "fight") return false;
  const away = h.dir > 0 ? "right" : "left";
  if (h.blockable && f.onGround && ["idle", "walk", "crouch", "block"].includes(f.st) && (f.ctl.h[away] || (f.bot && Math.random() < 0.5))) {
    spark(f.x, f.y - 140, "block"); SFX.block(); return true;
  }
  f.hp = Math.max(F.opts.training ? 1 : 0, f.hp - h.dmg); f.flash = 0.12;
  f.atk = null; f.armor = 0; f.ghost = false;
  if (f.hp <= 0 || h.knock) { setSt(f, "down"); f.vy = -620; f.vx = h.dir * 300; f.onGround = false; f.juggle = 0; }
  else { setSt(f, "hurt"); f.stun = 0.3; f.vx = h.dir * 160; }
  spark(f.x, f.y - 120, "hit"); SFX.hit(); F.shake = Math.max(F.shake, 8);
  if (f.hp <= 0) onKO(other(f), f);
  return true;
}
function startArenaEvent() {
  const kind = ARENA_EVENTS[D.arenas[F.arena].theme];
  if (!kind) return;
  const dir = Math.random() < 0.5 ? 1 : -1, tgt = pick(F.p);
  const ev = { kind, t: 0, dir, hitSet: [] };
  if (kind === "pig" || kind === "tumbleweed") {
    Object.assign(ev, { x: dir > 0 ? -70 : W + 70, y: FLOOR, speed: kind === "pig" ? 470 : 380 });
    popText(kind === "pig" ? "LOOSE PIG!" : "TUMBLEWEED!", W / 2, 180, GOLD, 1.2, 32);
  } else if (kind === "chair" || kind === "papers") {
    Object.assign(ev, { x: clamp(tgt.x + rnd(-50, 50), WALL_L + 30, WALL_R - 30), y: -60, warn: 0.9 });
    popText(kind === "chair" ? "FOLDING CHAIR!" : "ORDER! ORDER!", W / 2, 180, GOLD, 1.2, 32);
  } else if (kind === "coins") {
    Object.assign(ev, { coins: [], left: 2.2 });
    popText("JACKPOT!", W / 2, 180, GOLD, 1.4, 44);
  } else if (kind === "cork") {
    Object.assign(ev, { x: dir > 0 ? -30 : W + 30, y: FLOOR - pick([150, 60]), speed: 760 });
    popText("POP!", dir > 0 ? 120 : W - 120, FLOOR - 220, GOLD, 0.8, 34);
  } else if (kind === "adbreak") {
    if (F.adDone) return;
    F.adDone = true; F.freezeT = 1.7; ev.done = true;
    SFX.special();
  }
  F.haz.push(ev);
}
function updateHazards(dt) {
  if (F.opts.training || F.bonus || F.phase !== "fight") return;
  F.evT -= dt;
  if (F.evT <= 0 && !F.haz.length) { F.evT = rnd(10, 16); startArenaEvent(); }
  for (const e of F.haz) {
    e.t += dt;
    if (e.kind === "pig" || e.kind === "tumbleweed") {
      e.x += e.dir * e.speed * dt;
      if (e.kind === "tumbleweed") e.y = FLOOR - Math.abs(Math.sin(e.t * 6)) * 60;
      for (const f of F.p) if (!e.hitSet.includes(f) && Math.abs(f.x - e.x) < 46 && f.y > FLOOR - 50 && FLOOR - e.y < 70) {
        e.hitSet.push(f); hazardHit(f, { dmg: 5, knock: true, dir: e.dir, blockable: false });
      }
      if (e.x < -120 || e.x > W + 120) e.done = true;
    } else if (e.kind === "chair" || e.kind === "papers") {
      if (e.t > e.warn) {
        e.y += 2200 * dt;
        if (e.y >= FLOOR - 30 && !e.landed) {
          e.landed = true; e.y = FLOOR - 30; F.shake = Math.max(F.shake, e.kind === "chair" ? 10 : 4);
          for (const f of F.p) if (Math.abs(f.x - e.x) < 70 && f.y > FLOOR - 200)
            hazardHit(f, { dmg: e.kind === "chair" ? 7 : 3, knock: e.kind === "chair", dir: f.x >= e.x ? 1 : -1 });
          spawnDust(e.x);
        }
      }
      if (e.landed && e.t > e.warn + 1.2) e.done = true;
    } else if (e.kind === "coins") {
      e.left -= dt;
      if (e.left > 0 && Math.random() < 0.5) e.coins.push({ x: rnd(WALL_L, WALL_R), y: -20, vy: rnd(300, 500), got: false });
      for (const c of e.coins) {
        c.y += c.vy * dt;
        for (const f of F.p) if (!c.got && Math.abs(f.x - c.x) < 50 && c.y > f.y - 260 && c.y < f.y) { c.got = true; f.meter = Math.min(100, f.meter + 4); SFX.menu(); }
      }
      e.coins = e.coins.filter((c) => !c.got && c.y < FLOOR + 20);
      if (e.left <= 0 && !e.coins.length) e.done = true;
    } else if (e.kind === "cork") {
      e.x += e.dir * e.speed * dt;
      for (const f of F.p) if (!e.done && Math.abs(f.x - e.x) < 40 && Math.abs((f.y - (f.st === "crouch" ? 60 : 130)) - e.y) < 90) {
        e.done = true; hazardHit(f, { dmg: 4, knock: false, dir: e.dir, blockable: true });
      }
      if (e.x < -60 || e.x > W + 60) e.done = true;
    }
  }
  F.haz = F.haz.filter((e) => !e.done);
}
function drawHazards() {
  for (const e of F.haz) {
    ctx.save();
    if (e.kind === "pig") {
      ctx.translate(e.x, FLOOR); ctx.scale(e.dir, 1);
      const leg = Math.sin(e.t * 30) * 6;
      ctx.fillStyle = "#e88aa0"; ctx.fillRect(-26 + leg, -22, 8, 22); ctx.fillRect(14 - leg, -22, 8, 22);
      ctx.beginPath(); ctx.ellipse(0, -40, 40, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(38, -46, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d46b86"; ctx.beginPath(); ctx.ellipse(54, -44, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.fillRect(40, -54, 4, 4);
    } else if (e.kind === "tumbleweed") {
      ctx.translate(e.x, e.y - 34); ctx.rotate(e.t * 8 * e.dir);
      ctx.strokeStyle = "#a07a3c"; ctx.lineWidth = 4;
      for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(0, 0, 18 + (i % 3) * 7, i, i + 2.4); ctx.stroke(); }
    } else if (e.kind === "chair" || e.kind === "papers") {
      if (!e.landed && e.t < e.warn + 0.4) {
        const k = clamp(e.t / e.warn, 0, 1);
        ctx.fillStyle = `rgba(255,60,60,${0.25 + 0.3 * Math.sin(G.time * 20)})`;
        ctx.beginPath(); ctx.ellipse(e.x, FLOOR + 3, 30 + 30 * k, 9, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.translate(e.x, e.y);
      if (e.kind === "chair") {
        ctx.strokeStyle = "#9aa3ad"; ctx.lineWidth = 6;
        ctx.strokeRect(-24, -60, 48, 34); ctx.beginPath(); ctx.moveTo(-24, -26); ctx.lineTo(-30, 26); ctx.moveTo(24, -26); ctx.lineTo(30, 26); ctx.moveTo(-26, 0); ctx.lineTo(26, 0); ctx.stroke();
      } else {
        ctx.fillStyle = "#f4f1e6"; for (let i = 0; i < 4; i++) ctx.fillRect(-26 + (i % 2) * 4, -8 - i * 7, 52, 6);
        ctx.strokeStyle = "#999"; ctx.lineWidth = 1; ctx.strokeRect(-26, -30, 56, 30);
      }
    } else if (e.kind === "coins") {
      for (const c of e.coins) { ctx.fillStyle = GOLD; ctx.beginPath(); ctx.ellipse(c.x, c.y, 10 * Math.abs(Math.sin(G.time * 8 + c.x)) + 3, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#b8860b"; ctx.lineWidth = 2; ctx.stroke(); }
    } else if (e.kind === "cork") {
      ctx.translate(e.x, e.y); ctx.fillStyle = "#c08a4a"; ctx.fillRect(-12, -8, 24, 16);
      ctx.fillStyle = "rgba(255,240,180,.7)"; for (let i = 1; i < 5; i++) ctx.fillRect(-e.dir * i * 16 - 4, rnd(-10, 6), 6, 6);
    }
    ctx.restore();
  }
}

// Бонус-этапы
function strikeZone(p) {
  if (p.st !== "atk" || !p.atk) return null;
  const a = p.atk, m = a.m || {};
  const act = a.t >= (m.start || 0) - 0.02 && a.t < (m.start || 0) + (m.act || 0.15) + 0.06;
  if (!act) return null;
  const hy = a.kind === "kick" ? 70 : a.kind === "cpunch" ? 80 : a.kind === "akick" ? 110 : 160;
  return { x: p.x + p.face * 75, y: p.y - hy, r: a.kind === "special" || a.kind === "super" ? 150 : 100 };
}
function bonusTick(dt) {
  const p = F.p[0], o = F.p[1];
  F.timer -= dt; F.spawnT -= dt;
  if (F.bonus === "ballots") {
    if (F.spawnT <= 0) {
      F.spawnT = rnd(0.5, 0.85);
      F.items.push({ x: o.x - 60, y: FLOOR - pick([70, 160, 230]), vx: -rnd(380, 540), vy: 0, t: 0, hit: false, rot: 0 });
    }
    const z = strikeZone(p);
    for (const it of F.items) {
      it.t += dt; it.x += it.vx * dt; it.y += it.vy * dt;
      if (it.hit) { it.vy += 1400 * dt; it.rot += dt * 14; continue; }
      let struck = z && Math.abs(it.x - z.x) < z.r && Math.abs(it.y - z.y) < z.r * 0.9;
      if (!struck) for (const pr of F.proj) if (pr.owner === p && Math.hypot(pr.x - it.x, pr.y - it.y) < 70) struck = true;
      if (struck) { it.hit = true; it.vx = rnd(500, 800); it.vy = -rnd(400, 700); F.score++; spark(it.x, it.y, "gold"); SFX.hit(); continue; }
      if (Math.abs(it.x - p.x) < 36 && it.y > p.y - 260 && it.y < p.y) {
        it.dead = true; popText("MISSED!", p.x, p.y - 290, "#ff9a9a", 0.5, 20);
      }
    }
    F.items = F.items.filter((it) => !it.dead && it.x > -60 && it.x < W + 60 && it.y < H + 60);
    F.bonusPts = Math.min(8, Math.floor(F.score / 3));
  } else if (F.bonus === "hands") {
    if (F.spawnT <= 0 && F.items.filter((h) => !h.done).length < 2) {
      F.spawnT = rnd(0.5, 0.9);
      let x = 0; for (let k = 0; k < 8; k++) { x = rnd(WALL_L + 60, WALL_R - 60); if (Math.abs(x - p.x) > 220) break; }
      F.items.push({ x, t: 0, life: rnd(1.6, 2.2), done: false, skin: pick(["#f1c6a0", "#d9a07a", "#a8714f", "#7a4b30", "#e8b48f"]) });
    }
    const near = F.items.filter((h) => !h.done).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    if (near) o.x = near.x; // герой поворачивается к ближайшей руке
    const press = p.ctl.p.punch || p.ctl.p.kick;
    for (const h of F.items) {
      h.t += dt;
      if (!h.done && press && Math.abs(h.x - p.x) < 95) {
        h.done = true; h.t = 0; F.score++; SFX.ok();
        popText(pick(["HANDSHAKE!", "NICE TO MEET YOU!", "VOTE FOR ME!", "THANK YOU!"]), h.x, FLOOR - 120, GOLD, 0.7, 20);
      }
    }
    F.items = F.items.filter((h) => (h.done ? h.t < 0.4 : h.t < h.life));
    F.bonusPts = Math.min(8, Math.floor(F.score / 2));
  } else {
    F.bonusPts = F.bonusDone ? 3 + Math.round(F.timer / 4) : Math.round(4 * (1 - o.hp / o.maxHp));
  }
  if (F.timer <= 0 || F.bonusDone) {
    F.timer = Math.max(0, F.timer);
    F.phase = "bonusover"; F.phaseT = 0;
    if (!F.bonusDone) SFX.ko(); else SFX.win();
    p.atk = null; if (p.onGround) setSt(p, "idle");
  }
}

// Тренировка: здоровье и шкала восстанавливаются, у манекена три режима
function trainingTick() {
  F.timer = 99;
  for (const f of F.p) {
    const idle = (f.st === "idle" || f.st === "walk" || f.st === "crouch" || f.st === "block") && other(f).combo === 0;
    if (idle && f.stT > 0.8) f.hp = f.maxHp;
  }
  F.p[0].meter = Math.min(100, F.p[0].meter + 0.4);
}
function dummyUpdate(f, o, dt) {
  const c = f.ctl;
  for (const a of ACTIONS) { c.p[a] = false; c.h[a] = false; }
  if (F.dummy === "block") {
    const away = o.x > f.x ? "left" : "right";
    const low = o.st === "atk" && o.atk && (o.atk.kind === "kick" || o.atk.kind === "cpunch" || o.atk.type === "fastbreak");
    if (low) c.h.down = true; else c.h[away] = true;
  } else if (F.dummy === "cpu") {
    f.level = 1; f.bot = true; aiUpdate(f, o, dt); f.bot = false;
  }
}
const DUMMY_MODES = ["stand", "block", "cpu"];

function finishMatch() {
  if (F.opts.daily) { finishDaily(); return; }
  if (F.opts.bonus) {
    G.ladder.bonus += F.bonusPts; G.ladder.idx++;
    go("ladder");
    return;
  }
  const humanWon = F.matchWinner === F.p[0];
  if (F.opts.mode === "arcade") {
    if (humanWon) {
      G.loseStreak = 0;
      if (F.approval) G.ladder.approvals.push(F.approval[0]);
      G.ladder.idx++;
      if (G.ladder.idx >= G.ladder.list.length) {
        const L = G.ladder, unl = [];
        const avg = L.approvals.reduce((a, b) => a + b, 0) / Math.max(1, L.approvals.length);
        L.final = clamp(Math.round(avg + L.bonus), 1, 99);
        G.newBest = L.final > (G.best[L.pid] || 0);
        if (G.newBest) { G.best[L.pid] = L.final; store.set("best", G.best); }
        if (!G.bossUnlocked && L.pid !== "swamp") unl.push("NEW FIGHTER UNLOCKED: UNCLE SWAMP");
        G.bossUnlocked = true; store.set("boss", true);
        if (L.diff >= 2 && !G.impeachUnlocked) { G.impeachUnlocked = true; store.set("impeach", true); unl.push("SECRET DIFFICULTY UNLOCKED: IMPEACHMENT MODE"); }
        const prev = G.clears[L.pid] ?? -1;
        G.newTitle = L.diff > prev;
        if (G.newTitle) { G.clears[L.pid] = L.diff; store.set("clears", G.clears); }
        G.unlocks = unl;
        go("ending");
      } else go("ladder");
    } else {
      G.loseStreak++;
      G.tip = pick(TIPS);
      go(G.ladder.diff === 3 ? "gameover" : "continue");
    }
  } else {
    G.lastWinner = F.matchWinner;
    G.lastApproval = F.approval ? F.approval[F.opts.mode === "vs" ? F.matchWinner.side : 0] : null;
    G.lastOpts = F.opts;
    go("result");
  }
}

function pauseItems() {
  const it = ["RESUME", "MOVE LIST"];
  if (F.opts.training) it.push("DUMMY: " + F.dummy.toUpperCase());
  it.push("SOUND: " + (muted ? "OFF" : "ON"), "QUIT TO MENU");
  return it;
}
function updatePause() {
  const n = nav();
  if (G.showMoves) { if (n.any) { G.showMoves = false; SFX.back(); } return; }
  const items = pauseItems();
  if (n.up) { G.pauseSel = (G.pauseSel + items.length - 1) % items.length; SFX.menu(); }
  if (n.down) { G.pauseSel = (G.pauseSel + 1) % items.length; SFX.menu(); }
  const choose = (i) => {
    const s = items[i] || "";
    if (s === "RESUME") { G.paused = false; SFX.ok(); }
    if (s === "MOVE LIST") { G.showMoves = true; SFX.ok(); }
    if (s.startsWith("DUMMY")) { F.dummy = DUMMY_MODES[(DUMMY_MODES.indexOf(F.dummy) + 1) % DUMMY_MODES.length]; SFX.menu(); }
    if (s.startsWith("SOUND")) { muted = !muted; store.set("muted", muted); SFX.ok(); }
    if (s === "QUIT TO MENU") { G.paused = false; go("title"); SFX.back(); }
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
    level: G.diff === 3 ? 3 : clamp(D.arcade.levels[i] + G.diff - 1, 0, 2),
    hpMult: G.diff === 3 ? 1.15 : 1,
  }));
  const b = D.arcade.boss;
  list.push({ opp: b.fighter, arena: b.arena, level: G.diff === 3 ? 3 : clamp(b.level + G.diff - 1, 1, 2), tour: 4, boss: true,
    hpMult: G.diff === 3 ? 1.3 : 1 });
  // бонус-этапы после 2-го, 4-го и 6-го боя
  [["hands", 6], ["ballots", 4], ["teleprompter", 2]].forEach(([k, at]) => list.splice(at, 0, { bonus: k, tour: list[at - 1].tour, arena: list[at - 1].arena }));
  for (const e of list) e.vp = e.boss || e.bonus ? null : randomVP(e.opp, pid);
  return { pid, list, idx: 0, diff: G.diff, approvals: [], bonus: 0, vp: (G.vps && G.vps[0]) || null };
}

function ladderOpts() {
  const L = G.ladder, s = L.list[L.idx];
  if (s.bonus) return { mode: "arcade", p1: L.pid, p2: s.bonus, arena: s.arena, level1: null, level2: null, bonus: s.bonus, skin1: skinOf(L.pid) };
  let level = s.level, hpMult = s.hpMult || 1;
  // INTERN: после двух поражений подряд бот слабеет
  if (L.diff === 0 && G.loseStreak >= 2) { level = 0; hpMult *= G.loseStreak >= 3 ? 0.75 : 0.85; }
  return { mode: "arcade", p1: L.pid, p2: s.opp, arena: s.arena, level1: null, level2: level, boss: !!s.boss, hpMult, vp1: L.vp, vp2: s.vp, skin1: skinOf(L.pid) };
}
function startLadderFight() { newFight(ladderOpts()); }

/* Задание дня */
function dayStr(off = 0) { const d = new Date(Date.now() + off * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function seeded(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function dailySetup() {
  const date = dayStr(), r = seeded("pk" + date), pk = (a) => a[Math.floor(r() * a.length)];
  const pool = D.roster.filter((id) => !D.fighters[id].boss);
  const mod = pk(D.daily), p1 = pk(pool), p2 = pk(pool.filter((x) => x !== p1));
  const arena = pk(Object.keys(D.arenas).filter((k) => k !== "oval"));
  const rest = pool.filter((x) => x !== p1 && x !== p2);
  const vp1 = pk(rest), vp2 = pk(rest.filter((x) => x !== vp1)) || null;
  const rec = store.get("daily", {}), st = store.get("streak", { last: null, n: 0 });
  const alive = st.last === date || st.last === dayStr(-1);
  return { date, mod, p1, p2, arena, vp1, vp2, best: rec.date === date ? rec.best : null, streak: alive ? st.n : 0 };
}
function dailyOpts() {
  const d = G.daily;
  return { mode: "daily", p1: d.p1, p2: d.p2, arena: d.arena, level1: null, level2: 1, vp1: d.vp1, vp2: d.vp2, daily: d.mod.id, skin1: skinOf(d.p1) };
}
function finishDaily() {
  const d = G.daily, won = F.matchWinner === F.p[0], ap = F.approval ? F.approval[0] : 0;
  const rec = store.get("daily", {});
  if (won && (rec.date !== d.date || (rec.best || 0) < ap)) store.set("daily", { date: d.date, best: ap });
  let st = store.get("streak", { last: null, n: 0 });
  if (won && st.last !== d.date) { st = { last: d.date, n: st.last === dayStr(-1) ? st.n + 1 : 1 }; store.set("streak", st); }
  G.daily = dailySetup();
  G.dailyResult = { date: d.date, mod: d.mod.name, p1: d.p1, won, approval: ap, streak: won ? st.n : G.daily.streak };
  go("dailyres");
}

function rosterVisible() { return D.roster; }
function selCols(n) { return n <= 6 ? 3 : Math.ceil(n / 2); }
function vpCandidates(side) { return D.roster.filter((id) => id !== G.sel.picks[side] && !locked(id)); }
function locked(id) { return D.fighters[id].boss && !G.bossUnlocked; }

function updateMenus(dt) {
  G.screenT += dt;
  const n = nav();
  switch (G.screen) {
    case "title":
      if (G.screenT > 0.3 && n.any) { go("mode"); SFX.ok(); }
      break;
    case "mode": {
      const items = 7;
      if (n.up) { G.menuSel = (G.menuSel + items - 1) % items; SFX.menu(); }
      if (n.down) { G.menuSel = (G.menuSel + 1) % items; SFX.menu(); }
      let choice = n.click !== null ? n.click : n.ok ? G.menuSel : null;
      if ((n.left || n.right) && G.menuSel === 5) choice = 5;
      if (n.back) { go("title"); SFX.back(); }
      if (choice === 1) { G.daily = dailySetup(); go("daily"); SFX.ok(); }
      else if (choice !== null && choice >= 0 && choice <= 4) {
        G.mode = ["arcade", null, "cpu", "vs", "training"][choice];
        G.sel = { step: 0, cur: 0, picks: [] };
        go("select"); SFX.ok();
      } else if (choice === 5) {
        { const k = diffCount(); G.diff = n.left ? (G.diff + k - 1) % k : (G.diff + 1) % k; } store.set("diff", G.diff); SFX.menu(); G.menuSel = 5;
      } else if (choice === 6) {
        muted = !muted; store.set("muted", muted); SFX.ok(); G.menuSel = 6;
      }
      break;
    }
    case "select": {
      const R = rosterVisible(), s = G.sel;
      if ((justPressed.has("KeyC") || n.click === -50) && skinsOpen(R[s.cur]) > 1) {
        const id = R[s.cur]; G.skins[id] = (skinOf(id) + 1) % skinsOpen(id); store.set("skins", G.skins); SFX.menu(); break;
      }
      if (n.left) { s.cur = (s.cur + R.length - 1) % R.length; SFX.menu(); }
      if (n.right) { s.cur = (s.cur + 1) % R.length; SFX.menu(); }
      if (n.up || n.down) { s.cur = (s.cur + selCols(R.length)) % R.length; SFX.menu(); }
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
          G.vps = [null, null]; G.vpQ = G.mode === "vs" ? [0, 1] : [0]; G.vpStep = 0; G.vpCur = 0;
          go("vp");
        } else { s.step++; s.cur = (choose + 1) % R.length; }
      }
      break;
    }
    case "vp": {
      const side = G.vpQ[G.vpStep], C = vpCandidates(side), cols = 5;
      if (n.left) { G.vpCur = (G.vpCur + C.length - 1) % C.length; SFX.menu(); }
      if (n.right) { G.vpCur = (G.vpCur + 1) % C.length; SFX.menu(); }
      if (n.up || n.down) { G.vpCur = (G.vpCur + cols) % C.length; SFX.menu(); }
      if (n.back || n.click === -99) {
        if (G.vpStep > 0) { G.vpStep--; G.vpCur = 0; SFX.back(); }
        else { G.sel.picks.pop(); G.sel.step = G.sel.picks.length; go("select"); SFX.back(); }
        break;
      }
      const choose = n.click !== null && n.click >= 0 ? n.click : n.ok ? G.vpCur : null;
      if (choose !== null && C[choose]) {
        G.vps[side] = C[choose]; SFX.ok();
        if (G.vpStep + 1 < G.vpQ.length) { G.vpStep++; G.vpCur = 0; break; }
        if (G.mode === "arcade") { G.loseStreak = 0; G.ladder = makeLadder(G.sel.picks[0]); go("ladder"); }
        else { G.arenaSel = 0; go("arena"); }
      }
      break;
    }
    case "arena": {
      const ids = Object.keys(D.arenas), count = ids.length + 1;
      if (n.up) { G.arenaSel = (G.arenaSel + count - 1) % count; SFX.menu(); }
      if (n.down) { G.arenaSel = (G.arenaSel + 1) % count; SFX.menu(); }
      if (n.left) { G.arenaSel = (G.arenaSel + count - 6) % count; SFX.menu(); }
      if (n.right) { G.arenaSel = (G.arenaSel + 6) % count; SFX.menu(); }
      let choose = n.click !== null && n.click >= 0 ? n.click : n.ok ? G.arenaSel : null;
      if (n.back || n.click === -99) { G.vpStep = G.vpQ.length - 1; G.vpCur = 0; go("vp"); SFX.back(); break; }
      if (choose !== null) {
        const arena = choose === ids.length ? pick(ids) : ids[choose];
        G.pending = { mode: G.mode, p1: G.sel.picks[0], p2: G.sel.picks[1], arena,
          level1: null, level2: G.mode === "cpu" ? G.diff : null, training: G.mode === "training",
          vp1: G.vps[0], vp2: G.mode === "vs" ? G.vps[1] : randomVP(G.sel.picks[1], G.sel.picks[0]),
          skin1: skinOf(G.sel.picks[0]), skin2: G.mode === "vs" && G.sel.picks[1] !== G.sel.picks[0] ? skinOf(G.sel.picks[1]) : 0 };
        go("vs"); SFX.ok();
      }
      break;
    }
    case "ladder":
      if (n.back) { go("title"); SFX.back(); break; }
      if (G.screenT > 0.4 && (n.ok || n.tapped)) {
        const s = G.ladder.list[G.ladder.idx];
        G.pending = ladderOpts();
        if (G.pending.bonus) { newFight(G.pending); SFX.ok(); } else { go("vs"); SFX.ok(); }
      }
      break;
    case "vs": {
      const p = G.pending;
      if (!p.talk) p.talk = makeTalk(p.p1, p.p2);
      const tk = p.talk, T = tk.rivals ? 3.8 : 3.0;
      if (!p.v0 && G.screenT > 0.35) { p.v0 = true; const l = tk.lines[tk.order[0]]; if (l) voice(l.key); }
      if (!p.v1 && G.screenT > 1.6) { p.v1 = true; const l = tk.lines[tk.order[1]]; if (l) voice(l.key); }
      if (G.screenT > T || (G.screenT > 0.6 && (n.ok || n.tapped))) newFight(p);
      break;
    }
    case "continue":
      if (n.up || n.down || n.left || n.right) { G.menuSel = 1 - G.menuSel; SFX.menu(); }
      {
        const c = n.click !== null ? n.click : n.ok ? G.menuSel : null;
        if (c === 0) { startLadderFight(); }
        if (c === 1 || n.back) { go("title"); SFX.back(); }
      }
      break;
    case "gameover":
      if (G.screenT > 1.2 && n.any) { go("title"); SFX.back(); }
      break;
    case "daily": {
      if (n.left || n.right) { G.menuSel = 1 - G.menuSel; SFX.menu(); }
      const c = n.click !== null ? n.click : n.ok ? G.menuSel : null;
      if (c === 0) { G.pending = dailyOpts(); go("vs"); SFX.ok(); }
      if (c === 1 || n.back) { go("mode"); SFX.back(); }
      break;
    }
    case "dailyres": {
      if (G.screenT < 0.8) break;
      if (n.left) { G.menuSel = (G.menuSel + 2) % 3; SFX.menu(); }
      if (n.right) { G.menuSel = (G.menuSel + 1) % 3; SFX.menu(); }
      const c = n.click !== null ? n.click : n.ok ? G.menuSel : null;
      if (c === 0) { shareResult("daily"); SFX.ok(); }
      if (c === 1) { G.pending = dailyOpts(); go("vs"); SFX.ok(); }
      if (c === 2 || n.back) { go("mode"); SFX.back(); }
      break;
    }
    case "result": {
      const items = 4;
      if (n.up) { G.menuSel = (G.menuSel + items - 1) % items; SFX.menu(); }
      if (n.down) { G.menuSel = (G.menuSel + 1) % items; SFX.menu(); }
      const c = n.click !== null ? n.click : n.ok ? G.menuSel : null;
      if (c === 0) newFight(F.opts);
      if (c === 1) { G.sel = { step: 0, cur: 0, picks: [] }; go("select"); SFX.ok(); }
      if (c === 2) { shareResult("result"); SFX.ok(); }
      if (c === 3 || n.back) { go("title"); SFX.back(); }
      break;
    }
    case "ending": {
      if (G.screenT < 1.0) break;
      if (n.left || n.right) { G.menuSel = 1 - G.menuSel; SFX.menu(); }
      const c = n.click !== null ? n.click : n.ok ? G.menuSel : null;
      if (c === 0) { shareResult("arcade"); SFX.ok(); }
      if (c === 1 || n.back) { go("title"); SFX.ok(); }
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Рисование: бойцы-заглушки                                          */
/* ------------------------------------------------------------------ */
// предмет из листа героя (item_<name>), вписанный в ширину w; false — спрайта нет
function itemSpr(p, name, w) {
  const id = p.owner && p.owner.id, im = id && IMG[`spr_${id}_item_${name}`];
  if (!im) return false;
  const k = w / im.width;
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(im, -im.width * k / 2, -im.height * k / 2, im.width * k, im.height * k); ctx.restore();
  return true;
}

function poseOf(f) {
  const p = { key: "idle", cr: 0, lean: 0, arms: "guard", legs: "stand", lying: 0, bob: Math.sin(G.time * 4 + f.side) * 2 };
  const a = f.atk;
  if (f.crookT > 0 && f.st === "idle") { p.key = "crook"; p.arms = "up"; return p; }
  switch (f.st) {
    case "walk": p.key = "walk_" + (1 + (Math.floor(f.walkPh * 4) % 4)); p.legs = "walk"; break;
    case "crouch": p.key = "crouch"; p.cr = 1; break;
    case "jump": p.key = "jump"; p.legs = "tuck"; break;
    case "block": p.key = f.crouchBlock ? "crouch_block" : "block"; p.arms = "block"; p.cr = f.crouchBlock ? 1 : 0; p.lean = -0.15; break;
    case "hurt": p.key = "hurt"; p.arms = "flail"; p.lean = -0.35; p.cr = f.crouchHurt ? 0.8 : 0; break;
    case "down": p.key = f.onGround ? "ko" : "fall"; p.lying = f.onGround ? 1 : clamp(f.stT / 0.3, 0, 1); p.arms = "flail"; break;
    case "ko": p.key = "ko"; p.lying = 1; p.arms = "down"; break;
    case "getup": p.key = "getup"; p.cr = 0.7; p.arms = "down"; break;
    case "win": p.key = F && F.phase === "fatality" ? "fatality" : "win"; p.arms = "up"; break;
    case "lose": p.key = "lose"; p.cr = 0.75; p.arms = "down"; p.lean = 0.35; break;
    case "atk": {
      const inStart = a.t < a.m.start;
      if (a.kind === "punch") { p.key = inStart ? "punch_0" : (f.punchAlt ? "hook" : "punch"); p.arms = inStart ? "wind" : "punch"; p.lean = inStart ? -0.1 : 0.2; }
      else if (a.kind === "kick") { p.key = a.crouch ? "ckick" : "kick"; p.legs = inStart ? "stand" : "kick"; p.cr = a.crouch ? 1 : 0; p.lean = -0.15; }
      else if (a.kind === "cpunch") { p.key = "cpunch"; p.cr = 1; p.arms = inStart ? "guard" : "punch"; }
      else if (a.kind === "akick") { p.key = "akick"; p.legs = "akick"; p.arms = "block"; }
      else if (a.kind === "throw") { p.key = inStart ? "throw_0" : "throw"; p.arms = inStart ? "cast" : "up"; p.lean = inStart ? 0.2 : -0.2; }
      else if (a.kind === "special") {
        p.key = "sp_" + a.type + (inStart ? "_0" : "");
        if (a.type === "parry") { p.cr = 0.55; p.lean = -0.45; p.arms = "guard"; p.key = "parry"; }
        else if (a.type === "counter") { p.arms = "upper"; p.lean = 0.25; p.key = "counter"; }
        else if (a.type === "ball") p.arms = inStart ? "chest" : "shoot";
        else if (a.type === "fired") p.arms = inStart ? "wind" : "point";
        else if (a.type === "lasso") p.arms = inStart ? "twirl" : "point";
        else if (a.type === "brush") { p.arms = "punch"; p.lean = 0.3; p.legs = "walk"; }
        else if (a.type === "jog") { p.arms = "guard"; p.legs = "walk"; p.lean = 0.2; }
        else if (a.type === "townhall") { p.arms = "up"; }
        else if (a.type === "decider" || a.type === "yeswecan") { p.arms = "heart"; }
        else if (a.type === "deal") { p.arms = inStart ? "wind" : "cast"; p.lean = 0.2; }
        else if (a.type === "bigleague") { p.arms = inStart ? "wind" : "punch"; p.lean = inStart ? -0.2 : 0.35; }
        else if (a.type === "hat") p.arms = inStart ? "wind" : "point";
        else if (a.type === "fastbreak") { p.cr = 0.6; p.legs = "walk"; p.lean = 0.45; p.arms = "side"; }
        else if (a.type === "spike") p.arms = "upper";
        else if (a.type === "tape" || a.type === "subpoena") p.arms = inStart ? "wind" : "point";
        else if (a.type === "lights") p.arms = "up";
        else if (a.type === "broccoli") p.arms = inStart ? "wind" : "point";
        else if (a.type === "lips") p.arms = "guard";
        else if (a.type === "pingpong" || a.type === "checkers") p.arms = inStart ? "wind" : "point";
        else if (a.type === "record") { p.arms = "punch"; p.lean = 0.3; }
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

function drawObj(f) {
  const k = f.d.kind;
  if (k === "hands") return;
  ctx.save(); ctx.translate(f.x, FLOOR);
  ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(0, 3, 70, 12, 0, 0, Math.PI * 2); ctx.fill();
  if (k === "teleprompter") {
    const dmg = 1 - f.hp / f.maxHp;
    ctx.rotate(dmg * 0.25 * Math.sin(G.time * 30) * (f.flash > 0 ? 1 : 0) + dmg * 0.12);
    ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(0, -170); ctx.lineTo(0, -10); ctx.moveTo(0, -10); ctx.lineTo(-50, 0); ctx.moveTo(0, -10); ctx.lineTo(50, 0); ctx.moveTo(0, -10); ctx.lineTo(0, 2); ctx.stroke();
    ctx.fillStyle = "#1c1c1c"; ctx.fillRect(-40, -190, 80, 26);
    // стекло под углом
    ctx.save(); ctx.translate(0, -195); ctx.transform(1, 0, -0.35, 1, 0, 0);
    ctx.fillStyle = f.flash > 0 ? "#ffffff" : "rgba(150,210,255,.75)"; ctx.fillRect(-70, -110, 140, 110);
    ctx.strokeStyle = "#111"; ctx.lineWidth = 5; ctx.strokeRect(-70, -110, 140, 110);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 5; i++) ctx.fillRect(-55, -96 + i * 18, 70 + ((i * 37) % 40), 6);
    ctx.strokeStyle = "rgba(20,20,20,.85)"; ctx.lineWidth = 3;
    const cracks = Math.floor(dmg * 7);
    for (let i = 0; i < cracks; i++) { const cx = -40 + ((i * 53) % 90), cy = -90 + ((i * 31) % 70); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 22, cy + 14); ctx.lineTo(cx + 10, cy + 34); ctx.moveTo(cx, cy); ctx.lineTo(cx - 18, cy + 20); ctx.stroke(); }
    ctx.restore();
  } else if (k === "ballots") {
    ctx.fillStyle = "#5a3a1a"; ctx.fillRect(-60, -70, 120, 70);
    ctx.fillStyle = "#2f5bd3"; ctx.fillRect(-55, -170, 110, 100);
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(-55, -170, 110, 100);
    ctx.fillStyle = INK; ctx.fillRect(-30, -165, 60, 8);
    ctx.font = `26px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "#fff"; ctx.fillText("VOTE", 0, -108);
    ctx.fillStyle = RED; ctx.fillRect(-55, -96, 110, 10);
  }
  ctx.restore();
}
function drawBonusItems() {
  if (F.bonus === "ballots") for (const it of F.items) {
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
    ctx.fillStyle = "#fff"; ctx.fillRect(-20, -14, 40, 28); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-20, -14, 40, 28);
    ctx.strokeStyle = "#2f5bd3"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-3, 7); ctx.lineTo(11, -8); ctx.stroke();
    ctx.restore();
  }
  if (F.bonus === "hands") {
    const p = F.p[0];
    // толпа на переднем плане
    for (let i = 0; i < 26; i++) {
      const x = i * 52 + 10, y = 690 + Math.sin(G.time * 3 + i) * 3;
      ctx.fillStyle = ["#2b2b45", "#3a2e50", "#25354a"][i % 3]; ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x - 30, y + 14, 60, 40);
    }
    for (const h of F.items) {
      const up = h.done ? 1 - h.t / 0.4 : Math.min(1, h.t * 5);
      const top = H - 30 - 110 * up, near = !h.done && Math.abs(h.x - p.x) < 95;
      ctx.strokeStyle = h.skin; ctx.lineWidth = 18; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(h.x, H + 20); ctx.lineTo(h.x, top); ctx.stroke(); ctx.lineCap = "butt";
      ctx.fillStyle = h.skin; ctx.beginPath(); ctx.arc(h.x, top - 6, 16, 0, Math.PI * 2); ctx.fill();
      if (near) { ctx.strokeStyle = GOLD; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(h.x, top - 6, 28 + Math.sin(G.time * 12) * 3, 0, Math.PI * 2); ctx.stroke(); }
      if (!h.done && h.life - h.t < 0.5) { ctx.globalAlpha = 0.6; label("!", h.x, top - 40, 26, "#ff9a9a"); ctx.globalAlpha = 1; }
    }
  }
}

function drawFighter(f) {
  if (f.d.obj) { drawObj(f); return; }
  if (f.hidden) return;
  const shadowK = clamp(1 - (FLOOR - f.y) / 500, 0.3, 1);
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 3, 58 * shadowK, 11 * shadowK, 0, 0, Math.PI * 2); ctx.fill();

  const pose = poseOf(f);
  ctx.save();
  ctx.translate(Math.round(f.x), Math.round(f.y));
  ctx.globalAlpha = f.ghost ? 0.55 : f.alpha;
  ctx.scale(f.face, 1);
  const set = SPR[f.id];
  const FALLBACK = { hook: "punch", throw_0: "throw", punch_0: "punch", ckick: "kick", crouch_block: "block", fall: "hurt", getup: "crouch", counter: "punch", parry: "block", super_0: "super", fatality: "win" };
  let key = null;
  if (set) {
    const tries = [pose.key, FALLBACK[pose.key], pose.key.startsWith("sp_") && pose.key.endsWith("_0") ? pose.key.slice(0, -2) : null, pose.key.startsWith("sp_") ? "special" : null, pose.key.startsWith("walk") ? "idle" : null, "idle"];
    key = tries.find((k) => k && set[k]) || null;
  }
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

  const aura = (color, alpha) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 120, 74, 132, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  };
  if (f.buffT > 0) aura("#6fd3ff", 0.35 + 0.2 * Math.sin(G.time * 14));
  if (f.deciderT > 0) aura(GOLD, Math.sin(G.time * 20) > 0 ? 0.7 : 0.2);
  if (f.armor > 0) aura("#ff9a3d", 0.6);
  if (f.tyga) { ctx.save(); ctx.font = `28px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = GOLD; ctx.fillText("★", f.x, f.y - 290 + Math.sin(G.time * 6) * 4); ctx.restore(); }
  if (f.st === "atk" && f.atk && f.atk.type === "spike" && f.atk.t >= f.atk.m.start && f.atk.t < f.atk.m.start + f.atk.m.act) {
    ctx.save(); ctx.fillStyle = "rgba(255,42,42,.8)"; const sx = f.x + f.face * 95;
    ctx.beginPath(); ctx.moveTo(sx - 24, f.y - 40); ctx.lineTo(sx + 24, f.y - 40); ctx.lineTo(sx + 24, f.y - 300); ctx.lineTo(sx + 44, f.y - 300); ctx.lineTo(sx, f.y - 380); ctx.lineTo(sx - 44, f.y - 300); ctx.lineTo(sx - 24, f.y - 300); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  if (f.reflectT > 0) {
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(G.time * 12);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(f.x, f.y - 120, 80, 140, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawTapeBands(f) {
  if (!(f.slowT > 0) || f.d.obj) return;
  ctx.save(); ctx.strokeStyle = "#d42a2a"; ctx.lineWidth = 8; ctx.globalAlpha = Math.min(1, f.slowT * 2);
  [[f.y - 170, 0.25], [f.y - 110, -0.2], [f.y - 60, 0.15]].forEach(([y, a]) => {
    ctx.save(); ctx.translate(f.x, y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, 46, 12, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  });
  ctx.restore();
}

// Боец-заглушка: простая фигура в цветах персонажа. Нос/лицо всегда смотрят в +x.
// Если для бойца есть спрайты — рисуем картинку вместо заглушки
function spriteKeyFor(p, walkPh) {
  if (p.key) return p.key;
  if (p.lying) return "ko";
  if (p.arms === "up") return "win";
  if (p.arms === "punch" || p.arms === "cast") return "punch";
  if (p.arms === "flail") return "hurt";
  if (p.arms === "down" && p.cr > 0.5) return "lose";
  if (p.legs === "walk") return "walk_" + (1 + (Math.floor(walkPh * 4) % 4));
  return "idle";
}
function drawSpriteOf(id, key, flash) {
  const set = SPR[id];
  if (!set) return false;
  const k = [key, key === "ending" || key === "fatality" ? "win" : null, key && key.startsWith("walk") ? "idle" : null, "idle"].find((x) => x && set[x] && IMG[`spr_${id}_${x}`]);
  if (!k) return false;
  const s = set[k], img = IMG[`spr_${id}_${k}`];
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, -s.ax, -s.ay);
  if (flash) { ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5; ctx.drawImage(img, -s.ax, -s.ay); }
  ctx.restore();
  return true;
}

function drawDummy(d, p, flash, walkPh) {
  if (d.id && SPR[d.id] && drawSpriteOf(d.id, spriteKeyFor(p, walkPh || 0), flash)) return;
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
    if (L.uncle && !flash) { // красные полосы на брюках
      ctx.strokeStyle = "#b22234"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(foot[0] > 0 ? 9 : -9, hipY); ctx.lineTo(kx, ky); ctx.lineTo(foot[0], foot[1] - 6); ctx.stroke();
    }
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
  if (L.uncle) {
    // фалды фрака и звёзды на лацканах
    ctx.fillStyle = col(C.shirt); ctx.beginPath(); ctx.moveTo(lx * 0.6 - 30, hipY - 6); ctx.lineTo(lx * 0.6 - 44, hipY + 48); ctx.lineTo(lx * 0.6 - 16, hipY + 6); ctx.fill();
    ctx.fillStyle = col("#f4f4f4"); ctx.fillRect(lx * 0.6 - 2, shY - 2, 16, 40);
    ctx.fillStyle = col("#b22234"); ctx.fillRect(lx * 0.6 - 4, shY - 4, 20, 7);
    ctx.fillStyle = col("#ffffff"); for (let i = 0; i < 3; i++) ctx.fillRect(lx * 0.6 - 24 + (i % 2) * 6, shY + 10 + i * 16, 5, 5);
    // худое вытянутое лицо
    ctx.fillStyle = col(C.skin); roundRect(hx - 24, headY - 30, 50, 66, 20); ctx.fill();
    ctx.fillStyle = col(C.hair);
    ctx.beginPath(); ctx.moveTo(hx + 4, headY + 30); ctx.lineTo(hx + 22, headY + 30); ctx.lineTo(hx + 12, headY + 62); ctx.closePath(); ctx.fill(); // козлиная бородка
    ctx.fillRect(hx - 26, headY - 10, 10, 26);
    ctx.fillStyle = col("#1a1a1a"); ctx.fillRect(hx + 6, headY - 6, 7, 4); ctx.fillRect(hx + 18, headY - 6, 6, 4);
    ctx.fillStyle = col("#3a3a3a"); ctx.fillRect(hx + 4, headY - 14, 11, 3); ctx.fillRect(hx + 17, headY - 14, 9, 3); // нахмуренные брови
    ctx.fillStyle = col("#7a2e22"); ctx.fillRect(hx + 8, headY + 18, 16, 3);
    // звёздно-полосатый цилиндр
    ctx.fillStyle = col("#1e2f7a"); ctx.beginPath(); ctx.ellipse(hx, headY - 30, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col("#f4f4f4"); ctx.fillRect(hx - 22, headY - 104, 44, 74);
    ctx.fillStyle = col("#b22234"); for (let i = 0; i < 4; i++) ctx.fillRect(hx - 22 + i * 12, headY - 104, 6, 62);
    ctx.fillStyle = col("#1e2f7a"); ctx.fillRect(hx - 22, headY - 46, 44, 14);
    ctx.fillStyle = col("#ffffff"); for (let i = 0; i < 4; i++) ctx.fillRect(hx - 16 + i * 10, headY - 42, 4, 4);
  } else if (L.tvHead) {
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
  if (img) { ctx.imageSmoothingEnabled = true; ctx.drawImage(img, x, y, size, size); }
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
  congress() {
    // Зал Палаты представителей: трибуна спикера, полукруглые ряды конгрессменов в костюмах.
    // Часть зала дерётся между собой, летают бумаги, спикер стучит молотком на сильных ударах.
    sky(["#241a10", "#3e3020", "#5a4630"]);
    ctx.fillStyle = "#2e2214"; ctx.fillRect(0, 0, W, 110);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = "#b8a27a"; ctx.fillRect(60 + i * 140, 14, 16, 96); }
    // трибуна спикера
    ctx.fillStyle = "#5a3a1e"; ctx.fillRect(500, 170, 280, 170); ctx.fillStyle = "#7a5230"; ctx.fillRect(480, 160, 320, 22);
    ctx.fillStyle = "#c9a227"; ctx.beginPath(); ctx.arc(640, 260, 32, 0, 7); ctx.fill();
    ctx.fillStyle = "#3a2410"; ctx.beginPath(); ctx.arc(640, 260, 24, 0, 7); ctx.fill();
    ctx.fillStyle = "#b22234"; ctx.fillRect(595, 100, 90, 52); ctx.fillStyle = "#fff"; for (let j = 0; j < 4; j++) ctx.fillRect(595, 108 + j * 11, 90, 5);
    ctx.fillStyle = "#3c3b6e"; ctx.fillRect(595, 100, 38, 26);
    const bang = F && F.shake > 3 && Math.sin(G.time * 30) > 0;
    ctx.save(); ctx.translate(745, 158); ctx.rotate(bang ? 0.7 : -0.35);
    ctx.fillStyle = "#6a3e1e"; ctx.fillRect(-4, -42, 8, 42); ctx.fillRect(-17, -52, 34, 15); ctx.restore();

    const suits = ["#1d2438", "#2a2a2e", "#14161c", "#3a3f4a", "#24304a", "#2e2622"];
    const ties = ["#b3202a", "#1f3f9a", "#8a1c2a", "#2c5fbf", "#c9a227", "#6a1a1a"];
    const skins = ["#f0c4a0", "#d8a882", "#a8754e", "#7a4e30", "#f4d0b0", "#c08a62"];
    const hairs = ["#cfcfcf", "#4a3020", "#8a8a8a", "#1e1e1e", "#e6dcc8", "#6a4a2a"];
    const member = (x, y, k, seed, mode) => {
      const t = G.time, s = seed;
      const dx = mode === 2 ? Math.sin(t * 13 + s) * 5 * k : 0;
      const dy = mode === 2 ? -Math.abs(Math.sin(t * 9 + s)) * 7 * k : mode === 1 ? -6 * k : Math.sin(t * 1.7 + s) * 1.2;
      const X = x + dx, Y = y + dy;
      const suit = suits[s % suits.length], tie = ties[(s * 3) % ties.length], skin = skins[(s * 5) % skins.length], hair = hairs[(s * 7) % hairs.length];
      const woman = s % 4 === 1;
      // руки за спиной/поднятые
      ctx.strokeStyle = suit; ctx.lineWidth = 8 * k; ctx.lineCap = "round";
      if (mode === 2) { // дерётся: машет кулаком
        const a = Math.sin(t * 15 + s);
        ctx.beginPath(); ctx.moveTo(X + 14 * k, Y - 30 * k); ctx.lineTo(X + (26 + a * 10) * k, Y - (46 + a * 6) * k); ctx.stroke();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(X + (26 + a * 10) * k, Y - (46 + a * 6) * k, 5 * k, 0, 7); ctx.fill();
      } else if (mode === 1) { // встал и тычет пальцем
        ctx.beginPath(); ctx.moveTo(X + 14 * k, Y - 30 * k); ctx.lineTo(X + 34 * k, Y - 40 * k); ctx.stroke();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(X + 34 * k, Y - 40 * k, 4 * k, 0, 7); ctx.fill();
      }
      // пиджак с лацканами
      ctx.fillStyle = suit; roundRect(X - 17 * k, Y - 38 * k, 34 * k, 44 * k, 6 * k); ctx.fill();
      ctx.fillStyle = woman ? "#e8e8e8" : "#f4f4f4";
      ctx.beginPath(); ctx.moveTo(X - 7 * k, Y - 38 * k); ctx.lineTo(X + 7 * k, Y - 38 * k); ctx.lineTo(X, Y - 20 * k); ctx.closePath(); ctx.fill();
      if (woman) { ctx.fillStyle = "#f4f0e0"; for (let p = -2; p <= 2; p++) { ctx.beginPath(); ctx.arc(X + p * 3 * k, Y - 36 * k + Math.abs(p) * -1 * k, 1.6 * k, 0, 7); ctx.fill(); } }
      else { ctx.fillStyle = tie; ctx.fillRect(X - 2.5 * k, Y - 36 * k, 5 * k, 18 * k); }
      ctx.fillStyle = "#c9a227"; ctx.fillRect(X - 13 * k, Y - 31 * k, 3 * k, 3 * k); // значок на лацкане
      // голова
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(X, Y - 48 * k, 10 * k, 0, 7); ctx.fill();
      ctx.fillStyle = hair;
      if (woman) { ctx.beginPath(); ctx.arc(X, Y - 50 * k, 11.5 * k, Math.PI * 0.95, Math.PI * 2.05); ctx.fill(); ctx.fillRect(X - 11.5 * k, Y - 50 * k, 5 * k, 14 * k); ctx.fillRect(X + 6.5 * k, Y - 50 * k, 5 * k, 14 * k); }
      else if (s % 5 !== 3) { ctx.beginPath(); ctx.arc(X, Y - 51 * k, 10.5 * k, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); }
      if (s % 6 === 2) { ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5 * k; ctx.strokeRect(X - 8 * k, Y - 50 * k, 7 * k, 4 * k); ctx.strokeRect(X + 1 * k, Y - 50 * k, 7 * k, 4 * k); }
      ctx.fillStyle = "#2a1a10"; ctx.fillRect(X - 5 * k, Y - 49 * k, 2 * k, 2 * k); ctx.fillRect(X + 3 * k, Y - 49 * k, 2 * k, 2 * k);
      if (mode) { ctx.fillStyle = "#5a1a1a"; ctx.fillRect(X - 3 * k, Y - 43 * k, 6 * k, 3 * k); }
    };
    // три полукруглых ряда: дальний, средний, ближний; перед каждым рядом деревянные пюпитры
    const rows = [{ y: 392, k: 0.85, n: 14 }, { y: 470, k: 1.0, n: 12 }, { y: 556, k: 1.18, n: 10 }];
    rows.forEach((r, ri) => {
      ctx.fillStyle = ri % 2 ? "#4a3420" : "#563c24";
      ctx.fillRect(0, r.y - 6, W, 90);
      const step = W / r.n;
      for (let i = 0; i < r.n; i++) {
        const x = step * (i + 0.5) + (ri % 2) * step * 0.25;
        if (ri === 0 && x > 500 && x < 780) continue; // перед трибуной спикера пусто
        const seed = i * 7 + ri * 13;
        const mode = seed % 5 === 0 ? 2 : seed % 7 === 3 ? 1 : 0;
        member(x, r.y + 4, r.k, seed, mode);
        // пюпитр с микрофоном
        ctx.fillStyle = "#6a4626"; ctx.fillRect(x - 24 * r.k, r.y + 4, 48 * r.k, 22 * r.k);
        ctx.fillStyle = "#4a2e16"; ctx.fillRect(x - 24 * r.k, r.y + 4, 48 * r.k, 4 * r.k);
        ctx.strokeStyle = "#222"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 14 * r.k, r.y + 4); ctx.quadraticCurveTo(x + 18 * r.k, r.y - 10 * r.k, x + 10 * r.k, r.y - 18 * r.k); ctx.stroke();
        ctx.fillStyle = "#111"; ctx.beginPath(); ctx.arc(x + 10 * r.k, r.y - 18 * r.k, 2.5 * r.k, 0, 7); ctx.fill();
      }
    });
    // летающие бумаги
    for (let i = 0; i < 9; i++) {
      const t = (G.time * 0.35 + i * 0.11) % 1;
      ctx.save(); ctx.translate(90 + i * 135 + Math.sin(G.time + i) * 30, 110 + t * 460); ctx.rotate(G.time * 2 + i);
      ctx.fillStyle = "#f4f1e8"; ctx.fillRect(-9, -12, 18, 24); ctx.fillStyle = "#bbb"; ctx.fillRect(-6, -7, 12, 2); ctx.fillRect(-6, -2, 12, 2); ctx.restore();
    }
    ground("#5a2a22", "#3a1812");
  },
  oval(alt) {
    // изогнутая стена
    ctx.fillStyle = alt ? "#203a2a" : "#efe2c4"; ctx.fillRect(0, 0, W, FLOOR);
    ctx.fillStyle = alt ? "#18301f" : "#e3d3ae"; for (let i = 0; i < 14; i++) ctx.fillRect(i * 96, 0, 8, FLOOR);
    for (let i = 0; i < 3; i++) {
      const x = 470 + i * 120;
      ctx.fillStyle = alt ? "#0e1f14" : "#a8d8f0"; ctx.fillRect(x, 120, 90, 230);
      ctx.fillStyle = alt ? "#2c4a1e" : "#5fa84a"; ctx.fillRect(x, 300, 90, 50);
      ctx.fillStyle = "#c9a227"; ctx.fillRect(x - 14, 110, 18, 250); ctx.fillRect(x + 86, 110, 18, 250);
    }
    ctx.fillStyle = "#6a3e1e"; ctx.fillRect(520, 410, 240, 110); ctx.fillStyle = "#4a2a12"; ctx.fillRect(510, 400, 260, 18);
    [[400, "#c62828"], [880, "#1e3a8a"]].forEach(([x]) => { ctx.fillStyle = "#c9a227"; ctx.fillRect(x, 160, 6, 360); ctx.fillStyle = "#b22234"; ctx.fillRect(x + 6, 170, 60, 70); ctx.fillStyle = "#fff"; for (let j = 0; j < 4; j++) ctx.fillRect(x + 6, 180 + j * 16, 60, 6); ctx.fillStyle = "#3c3b6e"; ctx.fillRect(x + 6, 170, 26, 34); });
    ctx.fillStyle = alt ? "#3a4a34" : "#f5f5f5"; ctx.fillRect(40, 380, 200, 230); ctx.fillStyle = "#1a1a1a"; ctx.fillRect(80, 470, 120, 140);
    ctx.fillStyle = "#5a3a1e"; ctx.fillRect(1050, 300, 200, 320); for (let j = 0; j < 4; j++) for (let k = 0; k < 6; k++) { ctx.fillStyle = ["#8e2c2c", "#2c4a8e", "#2c8e4a", "#8e7a2c"][(j + k) % 4]; ctx.fillRect(1062 + k * 30, 316 + j * 74, 20, 56); }
    // рамы с портретами бойцов
    const ids = D.roster.filter((id) => !D.fighters[id].boss).slice(0, 4);
    [[120, 150], [250, 150], [920, 150], [1050, 150]].forEach(([x, y], i) => {
      ctx.fillStyle = "#c9a227"; ctx.fillRect(x - 8, y - 8, 106, 126);
      ctx.fillStyle = alt ? "#22381f" : "#3a2a1a"; ctx.fillRect(x, y, 90, 110);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, 90, 110); ctx.clip();
      const cheer = F && F.phase === "over" ? Math.abs(Math.sin(G.time * 10)) * 6 : 0;
      drawPortrait(ids[i], x - 5, y + 8 - cheer, 100, false);
      ctx.restore();
    });
    if (alt) {
      // Овальный кабинет превращается в болото
      for (let i = 0; i < 9; i++) { // затопленные шкафы с документами
        const x = 30 + i * 150, y = 470 + (i % 3) * 30, tilt = ((i * 37) % 7 - 3) * 0.05;
        ctx.save(); ctx.translate(x + 40, y + 60); ctx.rotate(tilt);
        ctx.fillStyle = "#5c6a5a"; ctx.fillRect(-40, -60, 80, 120);
        ctx.fillStyle = "#47543f"; for (let k = 0; k < 3; k++) ctx.fillRect(-34, -52 + k * 38, 68, 30);
        ctx.fillStyle = "#c9c2a0"; for (let k = 0; k < 3; k++) ctx.fillRect(-8, -40 + k * 38, 16, 5);
        ctx.fillStyle = "#e8e2c8"; ctx.fillRect(-20, -70, 34, 12);
        ctx.restore();
      }
      ctx.strokeStyle = "#3f5f2a"; ctx.lineWidth = 5; // камыши
      for (let i = 0; i < 26; i++) { const x = i * 50 + 10, h = 60 + (i * 29) % 70, sway = Math.sin(G.time * 1.5 + i) * 6; ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.quadraticCurveTo(x + sway, FLOOR - h / 2, x + sway * 2, FLOOR - h); ctx.stroke(); ctx.fillStyle = "#5a3a1e"; ctx.fillRect(x + sway * 2 - 4, FLOOR - h - 16, 8, 20); }
      for (let i = 0; i < 4; i++) { // туман
        const x = ((G.time * 30 + i * 380) % (W + 400)) - 200;
        ctx.fillStyle = "rgba(200,230,200,.10)"; ctx.beginPath(); ctx.ellipse(x, 420 + i * 50, 260, 50, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ground(alt ? "#2a4a2a" : "#24407a", alt ? "#14281a" : "#152a55");
    ctx.fillStyle = alt ? "#30552f" : "#2c4d8e"; ctx.beginPath(); ctx.ellipse(W / 2, FLOOR + 40, 520, 52, 0, 0, 7); ctx.fill();
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
      if (itemSpr(p, "wall", 190)) break;
      for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) { ctx.fillStyle = (r + c) % 2 ? "#8a8a8a" : "#9e9e9e"; ctx.fillRect(-85 + c * 57 + (r % 2) * 10, -150 + r * 50, 54, 47); }
      break;
    case "wave":
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = "#ff3b3b"; ctx.lineWidth = 10;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-dir * i * 26, 0, 20 + i * 10, 140 - i * 14, 0, dir > 0 ? -1.3 : 1.8, dir > 0 ? 1.3 : 4.5); ctx.stroke(); }
      label("!!!", 0, -160, 40, "#fff");
      break;
    case "pong":
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, Math.sin(p.t * 30) * 6, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#999"; ctx.lineWidth = 2; ctx.stroke();
      break;
    case "dog":
      ctx.scale(dir, 1); ctx.translate(0, Math.abs(Math.sin(p.t * 18)) * -6);
      if (itemSpr(p, "dog", 110)) break;
      ctx.fillStyle = "#fff"; ctx.fillRect(-40, -20, 70, 34); ctx.fillStyle = "#222"; ctx.fillRect(18, -34, 26, 26);
      break;
    case "recorder":
      ctx.globalAlpha = p.life - p.t < 1 ? 0.5 + 0.5 * Math.sin(p.t * 30) : 1;
      if (itemSpr(p, "recorder", 100)) { ctx.fillStyle = "#ff3b3b"; if (Math.sin(p.t * 8) > 0) { ctx.beginPath(); ctx.arc(40, -40, 7, 0, Math.PI * 2); ctx.fill(); } break; }
      ctx.fillStyle = "#555"; ctx.fillRect(-45, -40, 90, 80);
      break;
    case "hat":
      ctx.rotate(p.t * 14);
      if (itemSpr(p, "hat", 80)) break;
      ctx.fillStyle = "#e8d9b0"; ctx.beginPath(); ctx.ellipse(0, 6, 32, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-16, -14, 32, 20); ctx.fillStyle = "#7a5a3a"; ctx.fillRect(-16, 0, 32, 4);
      break;
    case "bean":
      ctx.rotate(p.t * 8);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.ellipse(0, 0, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(-5, -5, 5, 3);
      break;
    case "tv":
      ctx.rotate(Math.sin(p.t * 10) * 0.2);
      ctx.fillStyle = "#2b2b2b"; ctx.fillRect(-35, -30, 70, 60);
      ctx.fillStyle = Math.sin(p.t * 30) > 0 ? "#bfe9ff" : "#4fb8ff"; ctx.fillRect(-27, -22, 54, 40);
      ctx.strokeStyle = "#888"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -30); ctx.lineTo(-20, -46); ctx.moveTo(8, -30); ctx.lineTo(20, -46); ctx.stroke();
      break;
    case "subpoena":
      ctx.rotate(Math.sin(p.t * 12) * 0.25);
      ctx.fillStyle = "#f4f1e6"; ctx.fillRect(-30, -20, 60, 40); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(-30, -20, 60, 40);
      ctx.fillStyle = "#9a9a9a"; for (let i = 0; i < 3; i++) ctx.fillRect(-22, -12 + i * 9, 34, 3);
      ctx.fillStyle = "#b22234"; ctx.beginPath(); ctx.arc(18, 10, 8, 0, Math.PI * 2); ctx.fill();
      break;
    case "tape": {
      ctx.strokeStyle = "#d42a2a"; ctx.lineWidth = 9; ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = -40; i <= 40; i += 8) { const y = Math.sin(i * 0.15 + p.t * 30) * 18; if (i === -40) ctx.moveTo(i, y); else ctx.lineTo(i, y); }
      ctx.stroke(); ctx.lineCap = "butt";
      break;
    }
    case "light": {
      const r = 14 + Math.sin(p.t * 20) * 3;
      ctx.fillStyle = "rgba(255,240,170,.35)"; ctx.beginPath(); ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fffbe0"; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * 0.35 : r; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill();
      break;
    }
    case "broccoli":
      ctx.rotate(p.t * 8);
      if (IMG[`spr_${p.owner.id}_item_broccoli`]) { const im = IMG[`spr_${p.owner.id}_item_broccoli`]; ctx.scale(0.45, 0.45); ctx.imageSmoothingEnabled = true; ctx.drawImage(im, -im.width / 2, -im.height / 2); }
      else { ctx.fillStyle = "#3f7d2a"; ctx.beginPath(); ctx.arc(0, -8, 18, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#9bcf5a"; ctx.fillRect(-5, 0, 10, 22); }
      break;
    case "chute":
      ctx.translate(0, 110);
      if (!drawSpriteOf(p.owner.id, "super")) {
        ctx.fillStyle = "#d42a2a"; ctx.beginPath(); ctx.arc(0, -220, 90, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = "#ddd"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-90, -220); ctx.lineTo(0, -120); ctx.lineTo(90, -220); ctx.stroke();
        ctx.save(); ctx.scale(0.8, 0.8); drawDummy(p.owner.d, { cr: 0, lean: 0, arms: "up", legs: "stand", lying: 0, bob: 0 }, false, 0); ctx.restore();
      }
      break;
    case "cash":
      ctx.rotate(Math.sin(p.t * 9) * 0.4);
      ctx.fillStyle = "#7bc96f"; ctx.fillRect(-28, -16, 56, 32); ctx.strokeStyle = "#2e7d32"; ctx.lineWidth = 3; ctx.strokeRect(-28, -16, 56, 32);
      ctx.fillStyle = "#2e7d32"; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#f4f1e6"; ctx.fillRect(-6, -16, 12, 32);
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
  for (let i = 0; i < F.winsNeeded; i++) {
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
  // три спецприёма: готовы — горят
  SLOTS.forEach((s, i) => {
    const sp = f.d.specials[s], k = sp ? 1 - f.cds[s] / sp.cd : 0;
    const bx = flip ? x - w + i * 34 : x + i * 34, by = y - 40;
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(bx, by, 28, 18);
    ctx.fillStyle = k >= 1 ? "#9fe8ff" : "rgba(159,232,255,.35)"; ctx.fillRect(bx + 2, by + 16 - 14 * k, 24, 14 * k);
    ctx.font = `11px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = k >= 1 ? INK : "#fff";
    ctx.fillText(["S", "F", "D"][i], bx + 14, by + 14);
  });
  if (f.vp) {
    const bx = flip ? x - w + 3 * 34 + 6 : x + 3 * 34 + 6, by = y - 40, ok = !f.vpUsed;
    ctx.fillStyle = ok ? "#9fe8ff" : "rgba(0,0,0,.55)"; ctx.fillRect(bx, by, 120, 18);
    ctx.font = `11px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = ok ? INK : "rgba(255,255,255,.45)";
    ctx.fillText("VP: " + D.fighters[f.vp].name, bx + 60, by + 14, 112);
  }
}
function drawBubble(s, x, y, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `20px ${FONT}`;
  const w = Math.min(420, ctx.measureText(s).width + 32), h = 44;
  const bx = clamp(x - w / 2, 10, W - w - 10);
  ctx.fillStyle = "#fff"; roundRect(bx, y - h, w, h, 12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(clamp(x, bx + 16, bx + w - 16) - 10, y - 2); ctx.lineTo(clamp(x, bx + 16, bx + w - 16), y + 16); ctx.lineTo(clamp(x, bx + 16, bx + w - 16) + 10, y - 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 3; roundRect(bx, y - h, w, h, 12); ctx.stroke();
  ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.fillText(s, bx + w / 2, y - 15, w - 20);
  ctx.restore();
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
  if (F.staticT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(0.55, F.staticT);
    for (let i = 0; i < 260; i++) { const g = (Math.random() * 255) | 0; ctx.fillStyle = `rgb(${g},${g},${g})`; ctx.fillRect(Math.random() * W, Math.random() * H, rnd(4, 40), 3); }
    ctx.restore();
  }
  if (F.darkT > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.min(0.72, F.darkT * 0.6) * (Math.random() < 0.06 ? 0.4 : 1)})`; ctx.fillRect(0, 0, W, H);
    ctx.font = `28px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,80,80,.85)"; ctx.fillText("CLOSED", W / 2, 180);
  }
  // атакующий рисуется поверх
  const order = F.p[0].st === "atk" ? [F.p[1], F.p[0]] : [F.p[0], F.p[1]];
  if (F.phase === "fatality") drawFatality();
  else for (const f of order) drawFighter(f);
  for (const f of F.p) drawTapeBands(f);
  for (const a of F.assists) drawAssist(a);
  drawHazards();
  if (F.bonus) drawBonusItems();
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
  for (const b of F.bubbles) drawBubble(b.s, b.f.x, b.f.y - 330, Math.min(1, (b.life - b.t) * 3));
  ctx.restore();

  // супер-приём: затемнение и имя
  if (F.superFlash) {
    const k = clamp(F.superFlash.t / 1.2, 0, 1);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * k})`; ctx.fillRect(0, 0, W, H);
  }
  if (F.flashScreen > 0) { ctx.fillStyle = `rgba(255,255,255,${F.flashScreen})`; ctx.fillRect(0, 0, W, H); }

  // интерфейс
  hpBar(F.p[0], 50, false);
  if (F.bonus && F.p[1].d.inv) {
    ctx.fillStyle = "rgba(10,14,40,.85)"; ctx.fillRect(W - 470, 30, 420, 64);
    ctx.font = `30px ${FONT}`; ctx.textAlign = "right"; ctx.fillStyle = GOLD;
    ctx.fillText((F.bonus === "ballots" ? "BALLOTS: " : "HANDS: ") + F.score, W - 70, 74);
  } else hpBar(F.p[1], W - 50, true);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(W / 2, 52, 38, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = `34px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = F.timer < 10 ? RED : WHITE;
  ctx.fillText(String(Math.ceil(F.timer)), W / 2, 64);
  meterBar(F.p[0], 40, false);
  if (!F.p[1].d.obj) meterBar(F.p[1], W - 40, true);
  ctx.font = `16px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.textAlign = "center";
  ctx.fillText(D.arenas[F.arena].name, W / 2, 112);
  if (F.mods) { ctx.fillStyle = "#c79bff"; ctx.fillText("DAILY: " + D.daily.find((m) => m.id === F.mods).name, W / 2, 132); }
  if (F.comboShow && F.comboShow.n >= 2) {
    const left = F.comboShow.who === F.p[0];
    ctx.save(); ctx.font = `40px ${FONT}`; ctx.textAlign = left ? "left" : "right";
    ctx.lineWidth = 6; ctx.strokeStyle = INK; const s = `${F.comboShow.n} HITS!`;
    ctx.strokeText(s, left ? 40 : W - 40, 200); ctx.fillStyle = GOLD; ctx.fillText(s, left ? 40 : W - 40, 200);
    ctx.restore();
  }

  // надписи фаз
  if (F.bonus && F.phase === "intro") {
    const b = D.bonus[F.bonus];
    bigText("BONUS STAGE", 230, 40, "#c79bff");
    if (F.phaseT < 1.3) { bigText(b.name, 310, 54, GOLD); bigText(b.desc, 360, 26, WHITE); }
    else bigText("GO!", 340, 110, GOLD);
  } else if (F.phase === "intro") {
    if (F.mods && F.round === 1 && F.phaseT < 1.1) bigText(D.daily.find((m) => m.id === F.mods).name, 250, 36, "#c79bff");
    if (F.phaseT < 1.1) bigText(F.round === MAX_ROUNDS ? "FINAL ROUND" : "ROUND " + F.round, 330, 72, WHITE);
    else bigText(D.texts.fight, 340, 110, GOLD);
  }
  if (F.phase === "ko") bigText(D.texts.ko, 340, 110, RED, clamp(F.phaseT * 3, 0, 1));
  if (F.phase === "timeup") bigText(D.texts.timeUp, 340, 100, WHITE);
  if (F.phase === "finish") {
    bigText(D.texts.finish, 320, 100, RED, 0.6 + 0.4 * Math.sin(G.time * 10));
    if (!F.matchWinner.bot) bigText(isTouch ? "PRESS SPEC!" : "PRESS SPECIAL!", 390, 34, WHITE);
  }
  if (F.phase === "bonusover") {
    bigText(F.bonusDone || F.bonus !== "teleprompter" ? "BONUS COMPLETE!" : D.texts.timeUp, 260, 60, GOLD);
    bigText(`+${F.bonusPts}% APPROVAL`, 330, 40, "#7dff9a", clamp(F.phaseT * 2, 0, 1));
  }
  if (F.phase === "over") {
    bigText(F.matchWinner.d.name + " WINS!", 215, 64, GOLD);
    bigText(F.matchWinner.d.win, 258, 28, WHITE);
    if (F.approval && !F.opts.training) {
      const side = F.opts.mode === "vs" ? F.matchWinner.side : 0;
      bigText(`APPROVAL RATING: ${F.approval[side]}%`, 158, 28, side === 0 ? "#7dff9a" : "#ff9a9a", clamp(F.phaseT * 2, 0, 1));
    }
  }
  if (F.freezeT > 0) {
    ctx.fillStyle = "rgba(10,20,60,.82)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1e3a8a"; ctx.fillRect(240, 220, 800, 260); ctx.strokeStyle = GOLD; ctx.lineWidth = 6; ctx.strokeRect(240, 220, 800, 260);
    bigText(D.texts.adBreak, 320, 54, GOLD);
    bigText("WE'LL BE RIGHT BACK", 390, 34, WHITE);
    bigText("Stay tuned...", 440, 22, "#9fc2ff");
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
  if (t > 1.4 && t < 2.6) for (let i = 0; i < 3; i++) spark(l.x + rnd(-40, 40), l.y - rnd(40, 220), w.id === "swamp" ? "cash" : "gold");
  if (w.id === "reagan") reaganSat(l, t);
  bigText(D.texts.fatality, 230, 90, RED);
  ctx.font = `26px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = WHITE;
  wrapText(w.d.fatality, W / 2, 300, 900, 34);
}
// фаталити Рейгана: спутник «Звёздных войн», луч, горка мармеладных бобов
const BEAN_COLORS = ["#ff4d4d", "#ffb02e", "#ffe14d", "#5fd35f", "#4da6ff", "#c86bff", "#ff8fc7", "#fff"];
function reaganSat(l, t) {
  const im = IMG[`spr_reagan_item_satellite`], y = 40 + Math.min(1, t / 0.9) * 90;
  if (t > 1.0 && t < 2.5) {
    ctx.save(); ctx.globalAlpha = 0.6 + Math.sin(t * 60) * 0.3;
    ctx.fillStyle = "#ff3b3b"; ctx.fillRect(l.x - 9, y + 40, 18, l.y - y - 40);
    ctx.fillStyle = "#fff"; ctx.fillRect(l.x - 3, y + 40, 6, l.y - y - 40); ctx.restore();
  }
  if (im) { ctx.save(); ctx.imageSmoothingEnabled = true; const k = 200 / im.width; ctx.drawImage(im, l.x - 100, y - im.height * k / 2, 200, im.height * k); ctx.restore(); }
  if (t > 2.0) {
    const n = Math.min(40, Math.floor((t - 2.0) * 60));
    for (let i = 0; i < n; i++) {
      const row = Math.floor(Math.sqrt(i)), x = l.x + ((i * 37) % 9 - 4) * 11 * (1 - row / 8), yy = l.y - 8 - row * 11;
      ctx.fillStyle = BEAN_COLORS[i % BEAN_COLORS.length]; ctx.beginPath(); ctx.ellipse(x, yy, 9, 6, (i % 5) * 0.6, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function drawDummyOrSprite(f, pose) {
  const set = SPR[f.id], img = set && set.hurt && IMG[`spr_${f.id}_hurt`];
  if (img) { const s = set.hurt, k = s.scale || 1; ctx.drawImage(img, -s.ax * k, -s.ay * k, img.width * k, img.height * k); }
  else drawDummy(f.d, pose, false, 0);
}

function drawPause() {
  ctx.fillStyle = "rgba(5,6,20,.75)"; ctx.fillRect(0, 0, W, H);
  if (G.showMoves) { drawMoveList(F.p[0].d); return; }
  bigText("PAUSED", 180, 80, GOLD);
  menuList(pauseItems(), G.pauseSel, W / 2, 230, 420, 54, 10);
  ctx.font = `18px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.7)";
  const help = F.opts.mode === "vs"
    ? ["1P: W A S D move, F punch, G kick, H special, T super", "2P: arrows move, J punch, K kick, L special, I super"]
    : ["Arrows move, Up/Space jump, Down crouch (blocks low)", "A punch, S kick, D special, A+S or F super. Hold back to block"];
  help.forEach((s, i) => ctx.fillText(s, W / 2, 590 + i * 30));
}

function drawMoveList(d) {
  bigText(d.name + " — MOVE LIST", 70, 40, GOLD);
  const B = isTouch ? { p: "PUNCH", k: "KICK", s: "SPEC", f: "→", dn: "↓", up: "↑", b: "←" } : { p: "A", k: "S", s: "D", f: "→", dn: "↓", up: "↑", b: "←" };
  const rows = [
    [B.p, "Punch (high: ducks under it)", ""],
    [B.k, "Kick (low: block it crouching)", ""],
    [B.dn + " + " + B.p, "Low jab", ""],
    [B.up + " then " + B.k, "Jump kick (hits crouching)", ""],
    [B.f + " + " + B.p + " (close)", "Throw. Beats blocking. Press " + B.p + " to break", ""],
    [B.s, d.specials.n.name, d.specials.n.desc],
    [B.f + " + " + B.s, d.specials.f.name, d.specials.f.desc],
    [B.dn + " + " + B.s, d.specials.d.name, d.specials.d.desc],
    [isTouch ? "SUPER" : B.p + " + " + B.k, d.superMove.name, "When the SUPER meter is full"],
    ["PASSIVE", d.passive.name, d.passive.desc],
    [isTouch ? "VP" : "E", "RUNNING MATE", "Once per round your VP runs in and lands one hit"],
  ];
  rows.forEach(([k, n, desc], i) => {
    const y = 124 + i * 46;
    ctx.fillStyle = i % 2 ? "rgba(20,26,60,.85)" : "rgba(30,38,80,.85)"; ctx.fillRect(80, y - 30, 1120, 46);
    ctx.textAlign = "left";
    ctx.font = `18px ${FONT}`; ctx.fillStyle = i >= 5 ? "#9fe8ff" : GOLD; ctx.fillText(k, 100, y);
    ctx.font = `18px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText(n, 380, y);
    if (desc) { ctx.font = `14px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillText(desc, 700, y); }
  });
  ctx.font = `15px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.fillText("Cancel: hit with punch or kick, then press SPEC right away.  Knocked-down opponents can be hit twice in the air.", W / 2, 650);
  ctx.fillText(isTouch ? "Tap to go back" : "Press any key to go back", W / 2, 690);
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
function hButtons(items, sel, cy, w, h, gap = 24) {
  const total = items.length * w + (items.length - 1) * gap;
  items.forEach((s, i) => {
    const x = W / 2 - total / 2 + i * (w + gap), y = cy - h / 2, on = i === sel;
    ctx.fillStyle = on ? "rgba(255,213,74,.95)" : "rgba(20,26,60,.9)"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = on ? "#fff" : "rgba(255,255,255,.35)"; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.font = `${Math.round(h * 0.42)}px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = on ? INK : WHITE;
    ctx.fillText(s, x + w / 2, y + h * 0.66, w - 16);
    G.hits.push({ x, y, w, h, i });
  });
}
function menuList(items, sel, cx, y, w, h, gap = 14) {
  items.forEach((s, i) => {
    const yy = y + i * (h + gap), on = i === sel;
    ctx.fillStyle = on ? "rgba(255,213,74,.95)" : "rgba(20,26,60,.85)";
    ctx.fillRect(cx - w / 2, yy, w, h);
    ctx.strokeStyle = on ? "#fff" : "rgba(255,255,255,.3)"; ctx.lineWidth = 2; ctx.strokeRect(cx - w / 2, yy, w, h);
    ctx.font = `${Math.round(h * 0.42)}px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = on ? INK : WHITE;
    ctx.fillText(s, cx, yy + h * 0.66, w - 24);
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
  menuList(["ARCADE", "DAILY CHALLENGE", "VS CPU", "2 PLAYERS", "TRAINING", "LEVEL: " + DIFF_NAMES[G.diff], "SOUND: " + (muted ? "OFF" : "ON")], G.menuSel, W / 2, 196, 460, 50, 10);
  ctx.font = `16px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.65)";
  const hint = ["7 fights and 3 bonus stages. Final boss in the Oval Office", "A new matchup and a new twist every day. Keep your streak!", "Free fight against the computer on any arena", "Two players on one keyboard", "Practice moves and combos. Pause shows the move list", DIFF_HINTS[G.diff] + (G.impeachUnlocked ? "" : "  ·  Beat arcade on COMMANDER-IN-CHIEF to unlock a secret level"), ""][G.menuSel];
  ctx.fillText(hint, W / 2, 672);
}

function drawSelect() {
  menuBg();
  const R = rosterVisible(), s = G.sel;
  const who = G.mode === "arcade" ? "CHOOSE YOUR FIGHTER" : s.step === 0 ? (G.mode === "vs" ? "PLAYER 1: CHOOSE" : "CHOOSE YOUR FIGHTER") : (G.mode === "vs" ? "PLAYER 2: CHOOSE" : G.mode === "training" ? "CHOOSE THE DUMMY" : "CHOOSE YOUR OPPONENT");
  bigText(who, 70, 40, s.step === 0 ? GOLD : "#ff7a7a");
  // сетка: 3 столбца на 6 бойцов, 4 — на 7–8, дальше шире
  const cols = selCols(R.length), cw = Math.floor((570 - (cols - 1) * 12) / cols);
  R.forEach((id, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = 70 + col * (cw + 12), y = 120 + row * 250, w = cw, h = 230;
    const lk = locked(id), on = i === s.cur;
    ctx.fillStyle = on ? "rgba(255,213,74,.25)" : "rgba(20,26,60,.85)"; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    if (lk) { ctx.fillStyle = "#111"; ctx.fillRect(x, y, w, h); label("?", x + w / 2, y + 140, 100, "#444"); }
    else drawPortrait(id, x + (w - Math.min(150, w - 10)) / 2, y + 10, Math.min(150, w - 10), false);
    ctx.restore();
    ctx.strokeStyle = on ? (s.step === 0 ? GOLD : "#ff7a7a") : "rgba(255,255,255,.3)"; ctx.lineWidth = on ? 5 : 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x, y + h - 38, w, 38);
    label(lk ? "???" : D.fighters[id].name, x + w / 2, y + h - 12, D.fighters[id].name.length > 9 ? 15 : 22, WHITE);
    const cl = G.clears[id];
    if (cl !== undefined && !lk) for (let m = 0; m <= cl; m++) {
      ctx.beginPath(); ctx.arc(x + w - 18 - m * 22, y + 20, 8, 0, Math.PI * 2);
      ctx.fillStyle = MEDAL_COLORS[m]; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
    }
    s.picks.forEach((pid, k) => { if (pid === id) label(k === 0 ? "1P" : G.mode === "vs" ? "2P" : G.mode === "training" ? "DUMMY" : "CPU", x + 30, y + 30, 22, k === 0 ? GOLD : "#ff7a7a"); });
    G.hits.push({ x, y, w, h, i });
  });
  // карточка бойца
  const id = R[s.cur], d = D.fighters[id], lk = locked(id);
  ctx.fillStyle = "rgba(10,14,40,.85)"; ctx.fillRect(660, 120, 570, 480);
  if (!lk) {
    ctx.save(); ctx.translate(800, 560); ctx.scale(1.3, 1.3);
    const a = Math.sin(G.time * 1.5) > 0.7;
    drawDummy(skinned(d, skinOf(id)), { cr: 0, lean: 0, arms: a ? "punch" : "guard", legs: "stand", lying: 0, bob: Math.sin(G.time * 4) * 2 }, false, 0);
    ctx.restore();
    ctx.textAlign = "left"; ctx.font = `30px ${FONT}`; ctx.fillStyle = GOLD; ctx.fillText(d.name, 920, 170);
    ctx.font = `16px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillText(d.full, 920, 196);
    if (G.clears[id] !== undefined) { ctx.font = `13px ${FONT}`; ctx.fillStyle = MEDAL_COLORS[G.clears[id]]; ctx.fillText("★ " + TITLES[G.clears[id]], 920, 218); }
    const stats = [["SPEED", d.speed], ["POWER", d.power], ["HEALTH", d.health]];
    stats.forEach(([n, v], i) => {
      const y = 240 + i * 48; ctx.fillStyle = WHITE; ctx.font = `15px ${FONT}`; ctx.fillText(n, 920, y);
      ctx.fillStyle = "rgba(255,255,255,.15)"; ctx.fillRect(920, y + 8, 280, 14);
      ctx.fillStyle = GOLD; ctx.fillRect(920, y + 8, 280 * clamp((v - 0.7) / 0.5, 0.1, 1), 14);
    });
    const rows = [["SPEC", d.specials.n.name, "#9fc2ff"], ["FWD+SPEC", d.specials.f.name, "#9fc2ff"], ["DOWN+SPEC", d.specials.d.name, "#9fc2ff"],
      ["SUPER", d.superMove.name, "#ff9a9a"], ["PASSIVE", d.passive.name, GOLD]];
    rows.forEach(([k, v, c], i) => {
      const y = 396 + i * 34;
      ctx.font = `13px ${FONT}`; ctx.fillStyle = c; ctx.fillText(k, 920, y);
      ctx.font = `14px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText(v, 1030, y);
    });
    const open = skinsOpen(id), sk = skinOf(id);
    ctx.font = `13px ${FONT}`; ctx.fillStyle = "#c79bff"; ctx.fillText("COSTUME", 920, 576);
    if (open > 1) {
      ctx.fillStyle = "rgba(199,155,255,.25)"; ctx.fillRect(1022, 558, 196, 26);
      ctx.font = `14px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText("◀ " + SKINS[sk].name + " ▶", 1030, 576);
      G.hits.push({ x: 1022, y: 558, w: 196, h: 26, i: -50 });
      ctx.font = `11px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText(isTouch ? "tap to change" : "press C to change", 1030, 594);
    } else { ctx.font = `12px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.fillText("Beat arcade on COMMANDER-IN-CHIEF", 1030, 576); }
  } else {
    label("SECRET FIGHTER", 945, 330, 34, GOLD);
    ctx.font = `18px ${FONT}`; ctx.fillStyle = WHITE; ctx.textAlign = "center";
    ctx.fillText("Beat the arcade to unlock", 945, 380);
  }
  ctx.font = `15px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.6)";
  ctx.fillText(isTouch ? "Tap a fighter to choose" : "Arrows to move, Enter to choose, Esc to go back", W / 2, 640);
  if (isTouch) { G.hits.push({ x: 20, y: 660, w: 160, h: 50, i: -99 }); label("‹ BACK", 100, 694, 20, WHITE); }
}

function drawVPSelect() {
  menuBg();
  const side = G.vpQ[G.vpStep], C = vpCandidates(side), me = D.fighters[G.sel.picks[side]];
  bigText("CHOOSE YOUR RUNNING MATE", 70, 40, side === 0 ? GOLD : "#ff7a7a");
  ctx.font = `18px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = WHITE;
  ctx.fillText((G.mode === "vs" ? `PLAYER ${side + 1} · ` : "") + me.name + "'S VICE PRESIDENT", W / 2, 108);
  const cols = 5, cw = 160, ch = 190, gap = 20, total = cols * cw + (cols - 1) * gap;
  C.forEach((id, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = W / 2 - total / 2 + col * (cw + gap), y = 140 + row * (ch + gap), on = i === G.vpCur;
    ctx.fillStyle = on ? "rgba(255,213,74,.25)" : "rgba(20,26,60,.85)"; ctx.fillRect(x, y, cw, ch);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, cw, ch); ctx.clip(); drawPortrait(id, x + 5, y + 5, 150, false); ctx.restore();
    ctx.strokeStyle = on ? GOLD : "rgba(255,255,255,.3)"; ctx.lineWidth = on ? 5 : 2; ctx.strokeRect(x, y, cw, ch);
    ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(x, y + ch - 34, cw, 34);
    label(D.fighters[id].name, x + cw / 2, y + ch - 10, D.fighters[id].name.length > 9 ? 14 : 20, WHITE);
    G.hits.push({ x, y, w: cw, h: ch, i });
  });
  const key = isTouch ? "the VP button" : G.mode === "vs" ? (side === 0 ? "R" : "U") : "E";
  ctx.font = `18px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "#9fe8ff";
  ctx.fillText(`Press ${key} once per round: your running mate runs in and lands one hit.`, W / 2, 610);
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
    const col = Math.floor(i / 6), row = i % 6;
    const x = 140 + col * 520, y = 118 + row * 82, w = 480, h = 68, on = i === G.arenaSel;
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
  ctx.font = `16px ${FONT}`; ctx.textAlign = "right"; ctx.fillStyle = L.diff === 3 ? "#ff4d6d" : "rgba(255,255,255,.7)";
  ctx.fillText(DIFF_NAMES[L.diff] + (L.diff === 3 ? " · NO CONTINUES" : ""), W - 30, 36);
  const step = L.list.length > 7 ? 54 : 74, rh = step - 8;
  let n = 0;
  L.list.forEach((s, i) => {
    const y = 104 + i * step, done = i < L.idx, cur = i === L.idx;
    ctx.fillStyle = cur ? "rgba(255,213,74,.95)" : done ? "rgba(40,90,50,.85)" : s.bonus ? "rgba(70,40,110,.85)" : "rgba(20,26,60,.85)";
    ctx.fillRect(230, y, 820, rh);
    ctx.textAlign = "left";
    if (s.bonus) {
      ctx.font = `20px ${FONT}`; ctx.fillStyle = cur ? INK : "#d9c2ff";
      ctx.fillText("★ BONUS: " + D.bonus[s.bonus].name, 250, y + rh * 0.64);
    } else {
      n++;
      ctx.save(); ctx.beginPath(); ctx.rect(240, y + 2, rh - 4, rh - 4); ctx.clip(); drawPortrait(s.opp, 236, y + 2, rh + 4, false); ctx.restore();
      ctx.font = `20px ${FONT}`; ctx.fillStyle = cur ? INK : WHITE;
      ctx.fillText(`${n}. ${s.boss ? "BOSS: " : ""}${D.fighters[s.opp].name}`, 300, y + rh * 0.48);
      ctx.font = `13px ${FONT}`; ctx.fillStyle = cur ? INK : "rgba(255,255,255,.65)";
      ctx.fillText(`${D.arcade.tourNames[s.tour]} · ${D.arenas[s.arena].name}` + (s.vp ? ` · VP: ${D.fighters[s.vp].name}` : ""), 300, y + rh * 0.84);
    }
    if (done) label("✓", 1010, y + rh * 0.72, 30, "#7dff9a");
  });
  if (L.approvals.length || L.bonus) {
    const avg = L.approvals.length ? L.approvals.reduce((a, b) => a + b, 0) / L.approvals.length : 50;
    ctx.font = `16px ${FONT}`; ctx.textAlign = "left"; ctx.fillStyle = "#7dff9a";
    ctx.fillText(`APPROVAL: ${clamp(Math.round(avg + L.bonus), 1, 99)}%`, 30, 36);
  }
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
  const tk = p.talk;
  if (tk) {
    if (tk.rivals) bigText("GRUDGE MATCH!", 450, 34, GOLD, 0.6 + 0.4 * Math.sin(G.time * 8));
    const xs = [330, 950];
    tk.order.forEach((side, n) => {
      const l = tk.lines[side], t0 = n === 0 ? 0.35 : 1.6;
      if (l && G.screenT > t0) drawBubble(l.s, xs[side], 190, clamp((G.screenT - t0) * 4, 0, 1));
    });
  }
}

function drawContinue() {
  menuBg();
  bigText(D.texts.impeach, 200, 90, RED);
  bigText("CONTINUE?", 300, 44, WHITE);
  menuList(["YES — TRY AGAIN", "NO — MAIN MENU"], G.menuSel, W / 2, 360, 420, 64);
  ctx.font = `18px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "#9fc2ff";
  if (G.tip) ctx.fillText("TIP: " + G.tip, W / 2, 560);
  if (G.ladder && G.ladder.diff === 0 && G.loseStreak >= 2) { ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillText("Your opponent is feeling tired...", W / 2, 600); }
}
function drawDaily() {
  const d = G.daily;
  drawArena(d.arena, false);
  ctx.fillStyle = "rgba(5,6,20,.72)"; ctx.fillRect(0, 0, W, H);
  bigText("DAILY CHALLENGE", 70, 44, GOLD);
  ctx.font = `18px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.fillText(d.date + "  ·  " + D.arenas[d.arena].name, W / 2, 104);
  bigText(d.mod.name, 170, 50, "#c79bff");
  ctx.font = `20px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText(d.mod.desc, W / 2, 210);
  [[d.p1, 330, 1, "YOU", d.vp1], [d.p2, 950, -1, "CPU", d.vp2]].forEach(([id, x, face, who, vp]) => {
    ctx.save(); ctx.translate(x, 540); ctx.scale(1.15 * face, 1.15);
    drawDummy(D.fighters[id], { cr: 0, lean: 0, arms: "guard", legs: "stand", lying: 0, bob: Math.sin(G.time * 4) * 2 }, false, 0);
    ctx.restore();
    label(D.fighters[id].name, x, 578, 30, who === "YOU" ? GOLD : "#ff9a9a");
    ctx.font = `14px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fillText(who + (vp ? " · VP: " + D.fighters[vp].name : ""), x, 600);
  });
  bigText("VS", 400, 80, RED);
  ctx.font = `18px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "#7dff9a";
  ctx.fillText((d.best ? `TODAY'S BEST: ${d.best}%` : "NOT WON YET TODAY") + `  ·  STREAK: ${d.streak} DAY${d.streak === 1 ? "" : "S"}`, W / 2, 262);
  hButtons(["FIGHT!", "BACK"], G.menuSel, 660, 240, 52);
}
function drawDailyResult() {
  menuBg();
  const R = G.dailyResult;
  ctx.save(); ctx.translate(W / 2, 600); ctx.scale(1.0, 1.0);
  drawDummy(D.fighters[R.p1], { cr: 0, lean: 0, arms: R.won ? "up" : "down", legs: "stand", lying: 0, bob: Math.sin(G.time * 6) * 3 }, false, 0);
  ctx.restore();
  bigText("DAILY CHALLENGE · " + R.mod, 70, 32, "#c79bff");
  bigText(R.won ? "CHALLENGE WON!" : D.texts.impeach, 150, 70, R.won ? GOLD : RED);
  if (R.won) bigText(`APPROVAL RATING: ${R.approval}%`, 200, 30, "#7dff9a");
  ctx.font = `20px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = WHITE;
  ctx.fillText(R.streak > 0 ? `STREAK: ${R.streak} DAY${R.streak === 1 ? "" : "S"} · Come back tomorrow for a new challenge` : "Come back tomorrow for a new challenge", W / 2, 240);
  if (G.screenT > 0.8) hButtons(["SHARE", "RETRY", "MENU"], G.menuSel, 660, 220, 52);
}
function drawGameOver() {
  menuBg();
  bigText(D.texts.impeach, 240, 96, RED);
  bigText("IMPEACHMENT MODE: NO SECOND TERMS", 340, 30, WHITE);
  ctx.font = `18px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "#9fc2ff";
  if (G.tip) ctx.fillText("TIP: " + G.tip, W / 2, 470);
  if (G.screenT > 1.2) bigText(isTouch ? "TAP TO CONTINUE" : "PRESS ANY KEY", 640, 24, GOLD);
}

function drawResult() {
  menuBg();
  const w = G.lastWinner;
  ctx.save(); ctx.translate(W / 2, 470); ctx.scale(1.5, 1.5);
  drawDummy(w.d, { cr: 0, lean: 0, arms: "up", legs: "stand", lying: 0, bob: Math.sin(G.time * 6) * 3 }, false, 0);
  ctx.restore();
  bigText(w.d.name + " WINS!", 90, 56, GOLD);
  if (G.lastApproval) { ctx.font = `22px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "#7dff9a"; ctx.fillText(`APPROVAL RATING: ${G.lastApproval}%`, W / 2, 140); }
  menuList(["REMATCH", "CHANGE FIGHTERS", "SHARE", "MAIN MENU"], G.menuSel, W / 2, 486, 400, 44, 9);
}

function drawEnding() {
  menuBg();
  const d = skinned(D.fighters[G.ladder.pid], skinOf(G.ladder.pid));
  ctx.save(); ctx.translate(W / 2, 470); ctx.scale(1.6, 1.6);
  drawDummy(d, { key: "ending", cr: 0, lean: 0, arms: "up", legs: "stand", lying: 0, bob: Math.sin(G.time * 6) * 3 }, false, 0);
  ctx.restore();
  bigText(D.texts.champion, 100, 80, GOLD);
  ctx.font = `24px ${FONT}`; ctx.textAlign = "center"; ctx.fillStyle = WHITE;
  wrapText(d.ending, W / 2, 530, 980, 32);
  const L = G.ladder;
  ctx.font = `20px ${FONT}`; ctx.fillStyle = MEDAL_COLORS[L.diff];
  ctx.fillText((G.newTitle ? "NEW TITLE: " : "TITLE: ") + TITLES[L.diff] + "  ·  " + DIFF_NAMES[L.diff], W / 2, 180);
  if (L.final) bigText(`APPROVAL RATING: ${L.final}%` + (G.newBest ? "  NEW BEST!" : ""), 222, 30, "#7dff9a");
  (G.unlocks || []).forEach((t, i) => bigText(t, 600 + i * 28, 20, "#6fd3ff"));
  if (G.screenT > 1.0) hButtons(["SHARE", "MAIN MENU"], G.menuSel, 674, 260, 50);
}

/* ------------------------------------------------------------------ */
/* Карточка для соцсетей                                              */
/* ------------------------------------------------------------------ */
const SITE = "ivan-code-afk.github.io/presidential-knockout";
function shareInfo(kind) {
  if (kind === "arcade") {
    const L = G.ladder, d = D.fighters[L.pid];
    return { d, head: D.texts.champion, big: `${L.final}% APPROVAL`, sub: `${TITLES[L.diff]} · ${DIFF_NAMES[L.diff]}`,
      text: `I won a fifth term as ${d.full} with ${L.final}% approval in PRESIDENTIAL KNOCKOUT!` };
  }
  if (kind === "daily") {
    const R = G.dailyResult, d = D.fighters[R.p1];
    return { d, head: "DAILY CHALLENGE", big: R.won ? `${R.approval}% APPROVAL` : "IMPEACHED", sub: `${R.mod} · ${R.date}` + (R.streak > 1 ? ` · ${R.streak}-DAY STREAK` : ""),
      text: R.won ? `${R.mod}: I won today's challenge as ${d.full} with ${R.approval}% approval in PRESIDENTIAL KNOCKOUT!` : `${R.mod} got me impeached today in PRESIDENTIAL KNOCKOUT. Can you do better?` };
  }
  const w = G.lastWinner;
  return { d: w.d, head: w.d.name + " WINS!", big: G.lastApproval ? `${G.lastApproval}% APPROVAL` : "", sub: D.arenas[G.lastOpts.arena].name,
    text: `${w.d.full} wins with ${G.lastApproval}% approval in PRESIDENTIAL KNOCKOUT!` };
}
function drawShareCard(info) {
  menuBg();
  ctx.fillStyle = "rgba(255,213,74,.12)"; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(330, 640); ctx.scale(2.0, 2.0);
  drawDummy(info.d, { cr: 0, lean: 0, arms: "up", legs: "stand", lying: 0, bob: 0 }, false, 0);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.font = `30px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText("PRESIDENTIAL", 900, 110);
  ctx.font = `56px ${FONT}`; ctx.fillStyle = RED; ctx.fillText("KNOCKOUT", 900, 168);
  ctx.font = `48px ${FONT}`; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.strokeText(info.head, 900, 290, 680); ctx.fillStyle = GOLD; ctx.fillText(info.head, 900, 290, 680);
  ctx.font = `64px ${FONT}`; ctx.strokeText(info.big, 900, 390, 680); ctx.fillStyle = "#7dff9a"; ctx.fillText(info.big, 900, 390, 680);
  ctx.font = `26px ${FONT}`; ctx.fillStyle = WHITE; ctx.fillText(info.sub, 900, 450, 680);
  ctx.font = `22px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillText("Can you beat it?  " + SITE, 900, 620, 680);
  ctx.font = `13px ${FONT}`; ctx.fillStyle = "rgba(255,255,255,.45)"; ctx.fillText(D.disclaimer, 900, 690);
}
function shareResult(kind) {
  const info = shareInfo(kind);
  drawShareCard(info);
  const url = location.protocol.startsWith("http") ? location.href.split("#")[0] : "https://" + SITE + "/";
  canvas.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], "presidential-knockout.png", { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: info.text + " " + url }); return; }
      if (navigator.share) { await navigator.share({ text: info.text, url }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "presidential-knockout.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    G.toast = { s: "Image saved. Share it anywhere!", t: 2.5 };
  }, "image/png");
}

/* ------------------------------------------------------------------ */
/* Главный цикл                                                       */
/* ------------------------------------------------------------------ */
function update(dt) {
  if (G.toast) { G.toast.t -= dt; if (G.toast.t <= 0) G.toast = null; }
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
    case "vp": drawVPSelect(); break;
    case "ladder": drawLadder(); break;
    case "vs": drawVS(); break;
    case "fight": drawFight(); break;
    case "continue": drawContinue(); break;
    case "gameover": drawGameOver(); break;
    case "daily": drawDaily(); break;
    case "dailyres": drawDailyResult(); break;
    case "result": drawResult(); break;
    case "ending": drawEnding(); break;
  }
  if (G.toast) {
    ctx.font = `20px ${FONT}`; const w = ctx.measureText(G.toast.s).width + 40;
    ctx.fillStyle = "rgba(0,0,0,.8)"; ctx.fillRect(W / 2 - w / 2, 18, w, 44);
    ctx.fillStyle = GOLD; ctx.textAlign = "center"; ctx.fillText(G.toast.s, W / 2, 47);
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
window.PK = { finishMatch, ladderOpts, 
  G, get F() { return F; }, D, newFight, makeLadder, go,
  sim(seconds, step = 1 / 60) { for (let t = 0; t < seconds; t += step) { G.time += step; update(step); justPressed.clear(); touch.p = {}; G.click = null; } draw(); },
  botVsBot(p1 = "bush", p2 = "trump", arena = "detroit") {
    newFight({ mode: "cpu", p1, p2, arena, level1: 2, level2: 2 });
    F.p[0].bot = true; F.p[0].level = 2;
  },
};
})();
