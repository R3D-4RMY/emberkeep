// Emberkeep: Lantern Defense — every tuning number, colour and layout in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720, shopY: 656 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const START = { gold: 170, lives: 20 };
export const WAVES = 10;

/** Difficulty: enemy hp/speed multipliers and starting gold. Normal is the old game. */
export const DIFFICULTY = {
  chill:  { key: 'chill',  name: 'Chill',  hp: 0.8,  speed: 0.9,  gold: 230, desc: 'Relaxed · 0.8x HP · 230g' },
  normal: { key: 'normal', name: 'Normal', hp: 1,    speed: 1,    gold: 170, desc: 'The classic keep' },
  ember:  { key: 'ember',  name: 'Ember',  hp: 1.25, speed: 1.1,  gold: 140, desc: 'Hard · 1.25x HP · 140g' },
};
export const DIFFICULTY_ORDER = ['chill', 'normal', 'ember'];

/** The ember road the invaders march along, from the west gate to the lantern. */
export const PATH = [
  { x: -40, y: 120 },
  { x: 1060, y: 120 },
  { x: 1060, y: 340 },
  { x: 220, y: 340 },
  { x: 220, y: 580 },
  { x: 1240, y: 580 },
];
export const LANTERN = { x: 1240, y: 580, radius: 30 };

/** Build pads: circles near the road where a tower can stand. */
export const PADS = [
  { x: 180, y: 210 }, { x: 420, y: 210 }, { x: 660, y: 210 }, { x: 900, y: 210 },
  { x: 980, y: 240 }, { x: 760, y: 440 }, { x: 520, y: 440 }, { x: 340, y: 440 },
  { x: 120, y: 470 }, { x: 420, y: 640 }, { x: 700, y: 640 }, { x: 980, y: 640 },
];

/** Tower types. cost: gold to build. upgradeCost: gold per level (max level 3). */
export const TOWERS = {
  spark: {
    key: 'spark', name: 'Spark Spire', cost: 50, upgradeCost: 40,
    damage: 9, rate: 2.6, range: 135, projectileSpeed: 620,
    color: '#ffd166', dark: '#b8860b', desc: 'Fast',
  },
  ember: {
    key: 'ember', name: 'Ember Mortar', cost: 90, upgradeCost: 70,
    damage: 30, rate: 0.7, range: 175, projectileSpeed: 380, splash: 58,
    color: '#ff6b35', dark: '#a8321b', desc: 'Splash',
  },
  frost: {
    key: 'frost', name: 'Frost Lantern', cost: 70, upgradeCost: 55,
    damage: 4, rate: 1.3, range: 155, projectileSpeed: 520, slow: 0.45, slowTime: 1.6,
    color: '#7dd3fc', dark: '#0369a1', desc: 'Slows',
  },
  volt: {
    key: 'volt', name: 'Volt Coil', cost: 110, upgradeCost: 85,
    damage: 14, rate: 1.1, range: 165, projectileSpeed: 900, chain: 90, chainFalloff: 0.7,
    color: '#fde047', dark: '#854d0e', desc: 'Chains',
  },
  snipe: {
    key: 'snipe', name: 'Ember Lance', cost: 130, upgradeCost: 95,
    damage: 85, rate: 0.45, range: 265, projectileSpeed: 1150,
    color: '#f0abfc', dark: '#701a75', desc: 'Sniper',
  },
};
export const TOWER_ORDER = ['spark', 'ember', 'frost', 'volt', 'snipe'];
export const MAX_LEVEL = 3;

/** Enemy kinds. hp is scaled by wave; speed in px/s; reward in gold; leak in lives.
 * splits: how many motes burst out on death. shieldVs: damage multiplier from one tower type. */
export const ENEMIES = {
  mote:    { name: 'Mote',    hp: 22,  speed: 95,  radius: 11, reward: 6,  leak: 1, color: '#f472b6', dark: '#9d174d' },
  crawler: { name: 'Crawler', hp: 55,  speed: 62,  radius: 15, reward: 9,  leak: 1, color: '#a3e635', dark: '#3f6212' },
  brute:   { name: 'Brute',   hp: 170, speed: 38,  radius: 21, reward: 20, leak: 3, color: '#f97316', dark: '#7c2d12' },
  wisp:    { name: 'Wisp',    hp: 34,  speed: 130, radius: 12, reward: 11, leak: 1, color: '#c084fc', dark: '#581c87', slowResist: 0.6 },
  splitter:{ name: 'Splitter',hp: 80,  speed: 55,  radius: 17, reward: 13, leak: 2, color: '#38bdf8', dark: '#0c4a6e', splits: 2 },
  spark:   { name: 'Spark',   hp: 14,  speed: 168, radius: 9,  reward: 5,  leak: 1, color: '#fde047', dark: '#854d0e', splits: 2 },
  bulwark: { name: 'Bulwark', hp: 260, speed: 30,  radius: 22, reward: 24, leak: 3, color: '#94a3b8', dark: '#334155', shieldVs: { frost: 0.5 } },
  swarmer: { name: 'Swarmer', hp: 12,  speed: 185, radius: 8,  reward: 4,  leak: 1, color: '#fb7185', dark: '#881337' },
  mender:  { name: 'Mender',  hp: 130, speed: 46,  radius: 15, reward: 16, leak: 2, color: '#4ade80', dark: '#14532d', healer: true },
  warden:  { name: 'Cinder Warden', hp: 700, speed: 34, radius: 26, reward: 120, leak: 6, color: '#fb923c', dark: '#7c2d12' },
  golem:   { name: 'Ember Golem', hp: 2400, speed: 30, radius: 30, reward: 220, leak: 10, color: '#ef4444', dark: '#450a0a' },
};

/** Wave composition: [kind, count] pairs. Wave 5 has the Cinder Warden mini-boss, wave 10 the boss.
 * Endless waves (11+) scale the wave-10 mix up and add a Warden every 5th endless wave. */
export function waveComposition(wave) {
  const w = wave;
  const list = [];
  if (w > WAVES) {
    const extra = w - WAVES;
    list.push(['mote', 22 + extra * 2]);
    list.push(['crawler', 12 + extra]);
    list.push(['swarmer', 10 + extra * 2]);
    list.push(['spark', 6 + extra]);
    list.push(['splitter', 5 + Math.floor(extra / 2)]);
    list.push(['wisp', 7 + extra]);
    list.push(['brute', 4 + Math.floor(extra / 2)]);
    list.push(['bulwark', 3 + Math.floor(extra / 2)]);
    list.push(['mender', 2 + Math.floor(extra / 3)]);
    if (extra % 5 === 0) list.push(['warden', 1]);
    if (w % 10 === 0) list.push(['golem', 1]);
    return list;
  }
  list.push(['mote', 6 + w * 2]);
  list.push(['crawler', 3 + w]);
  if (w >= 4) list.push(['swarmer', 4 + w]);
  if (w >= 5) list.push(['spark', 1 + Math.floor((w - 2) / 2)]);
  if (w >= 3) list.push(['splitter', 1 + Math.floor(w / 3)]);
  if (w >= 4) list.push(['wisp', 2 + Math.floor(w / 2)]);
  if (w >= 5) list.push(['brute', 1 + Math.floor((w - 3) / 2)]);
  if (w >= 6) list.push(['bulwark', 1 + Math.floor((w - 4) / 2)]);
  if (w >= 6) list.push(['mender', 1 + Math.floor((w - 5) / 2)]);
  if (w === 5) list.push(['warden', 1]);
  if (w === 10) list.push(['golem', 1]);
  return list;
}

/** Enemy hp multiplier for a wave. Endless waves grow more slowly after wave 10. */
export function waveHpScale(wave) {
  if (wave > WAVES) return 1 + (WAVES - 1) * 0.55 + (wave - WAVES) * 0.4;
  return 1 + (wave - 1) * 0.55;
}

/** Gold bonus for clearing a wave. */
export function waveBonus(wave) {
  return 35 + wave * 10;
}

export const POOL = { enemies: 150, projectiles: 160, particles: 320, texts: 48 };

export const PALETTE = {
  backdrop: '#0b1020',
  skyTop: '#131a33',
  skyBottom: '#1e2a4a',
  ground: '#16213a',
  grass: '#1b2f4d',
  path: '#3a2f22',
  pathEdge: '#6b5433',
  pad: '#2a3a5c',
  padEmpty: '#31456e',
  panel: '#141b2e',
  panelEdge: '#2e3d5f',
  text: '#f1f5f9',
  muted: '#94a3b8',
  gold: '#f2c94c',
  lives: '#f87171',
  lantern: '#ffb703',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best result is kept between visits (this browser only). */
export const BEST_KEY = 'emberkeep.best';
