// Emberkeep's rules and state, with no drawing and no browser in it: towers, enemies marching
// the ember road, projectiles, gold, lives, waves and the win/loss. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react (sound, announcements)
// without the world knowing about screens. Nothing here allocates after createWorld returns.
import {
  DIFFICULTY, ENEMIES, FIELD, LANTERN, MAX_LEVEL, PADS, PATH, POOL, START, TOWERS, TOWER_ORDER,
  WAVES, waveBonus, waveComposition, waveHpScale,
} from './config.js';

export const EVENT_KILL = 1;
export const EVENT_LEAK = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_WON = 8;
export const EVENT_LOST = 16;
export const EVENT_BUILD = 32;
export const EVENT_UPGRADE = 64;
export const EVENT_SELL = 128;
export const EVENT_CHAIN = 256;
export const EVENT_COMBO = 512;

/** Combo multiplier: +5% score per consecutive kill, capped at x2.0 (20 kills). */
export function comboMult(combo) {
  return 1 + Math.min(combo, 20) * 0.05;
}

export function towerDamage(type, level) {
  return TOWERS[type].damage * (1 + 0.6 * (level - 1));
}
export function towerRange(type, level) {
  return TOWERS[type].range * (1 + 0.1 * (level - 1));
}
export function towerRate(type, level) {
  return TOWERS[type].rate * (1 + 0.08 * (level - 1));
}
export function upgradeCost(type, level) {
  return Math.round(TOWERS[type].upgradeCost * level);
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function createWorld(random) {
  const enemies = [];
  for (let i = 0; i < POOL.enemies; i += 1) {
    enemies.push({ active: false, kind: 'mote', x: 0, y: 0, hp: 1, maxHp: 1, speed: 0, radius: 10, reward: 0, leak: 1, slow: 0, slowTime: 0, seg: 0, progress: 0, flash: 0 });
  }
  const projectiles = [];
  for (let i = 0; i < POOL.projectiles; i += 1) {
    projectiles.push({ active: false, x: 0, y: 0, tx: 0, ty: 0, target: null, type: 'spark', damage: 0, splash: 0, slow: 0, slowTime: 0, speed: 0, chain: 0, chainLeft: 0 });
  }
  const particles = [];
  for (let i = 0; i < POOL.particles; i += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 3 });
  }
  const texts = [];
  for (let i = 0; i < POOL.texts; i += 1) {
    texts.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#fff' });
  }
  const towers = PADS.map((pad, index) => ({ pad: index, x: pad.x, y: pad.y, type: null, level: 0, cooldown: 0, invested: 0, angle: -Math.PI / 2, flash: 0 }));

  const state = {
    towers, enemies, projectiles, particles, texts,
    gold: START.gold, lives: START.lives, score: 0, kills: 0,
    wave: 0, waveActive: false, waveQueue: [], spawnTimer: 0, spawnGap: 0.7,
    time: 0, won: false, lost: false, buildPhase: true,
    difficulty: 'normal',
    combo: 0, comboTimer: 0, comboBest: 0, comboMilestone: 0,
    shake: 0,
    waveStats: [], waveKills: 0, waveLeaks: 0, waveGold: 0, waveScore: 0,
  };

  /** Difficulty applies from the next reset (the title screen picks it before play). */
  function setDifficulty(key) {
    if (DIFFICULTY[key]) state.difficulty = key;
    return state.difficulty;
  }

  function reset() {
    for (const e of enemies) e.active = false;
    for (const p of projectiles) p.active = false;
    for (const p of particles) p.active = false;
    for (const t of texts) t.active = false;
    for (const t of towers) { t.type = null; t.level = 0; t.cooldown = 0; t.invested = 0; t.flash = 0; }
    state.gold = DIFFICULTY[state.difficulty].gold;
    state.lives = START.lives;
    state.score = 0;
    state.kills = 0;
    state.wave = 0;
    state.waveActive = false;
    state.waveQueue = [];
    state.spawnTimer = 0;
    state.time = 0;
    state.won = false;
    state.lost = false;
    state.buildPhase = true;
    state.combo = 0; state.comboTimer = 0; state.comboBest = 0; state.comboMilestone = 0;
    state.shake = 0;
    state.waveStats = []; state.waveKills = 0; state.waveLeaks = 0; state.waveGold = 0; state.waveScore = 0;
  }

  function freeEnemy() {
    for (const e of enemies) if (!e.active) return e;
    return null;
  }
  function freeProjectile() {
    for (const p of projectiles) if (!p.active) return p;
    return null;
  }
  function burst(x, y, color, count, speed) {
    let made = 0;
    for (const p of particles) {
      if (made >= count) break;
      if (p.active) continue;
      const a = random() * Math.PI * 2;
      const s = speed * (0.4 + random() * 0.8);
      p.active = true; p.x = x; p.y = y;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 20;
      p.maxLife = 0.4 + random() * 0.4; p.life = p.maxLife;
      p.color = color; p.size = 2 + random() * 3;
      made += 1;
    }
  }
  function floatText(x, y, text, color) {
    for (const t of texts) {
      if (t.active) continue;
      t.active = true; t.x = x; t.y = y; t.life = 0.9; t.text = text; t.color = color;
      return;
    }
  }

  function spawnEnemy(kind, hpScale) {
    const e = freeEnemy();
    if (!e) return;
    const def = ENEMIES[kind];
    const diff = DIFFICULTY[state.difficulty];
    e.active = true; e.kind = kind;
    e.x = PATH[0].x; e.y = PATH[0].y;
    e.maxHp = Math.round(def.hp * hpScale * diff.hp); e.hp = e.maxHp;
    e.speed = def.speed * diff.speed * (0.95 + random() * 0.1); e.radius = def.radius;
    e.reward = def.reward; e.leak = def.leak;
    e.slow = 0; e.slowTime = 0; e.seg = 0; e.progress = 0; e.flash = 0;
  }

  function startWave() {
    if (state.waveActive || state.won || state.lost || state.wave >= WAVES) return false;
    state.wave += 1;
    state.waveKills = 0; state.waveLeaks = 0; state.waveGold = 0; state.waveScore = 0;
    const comp = waveComposition(state.wave);
    const queue = [];
    // Interleave kinds so the wave reads as a mixed march, not one blob per kind.
    const pools = comp.map(([kind, count]) => ({ kind, count }));
    let added = true;
    while (added) {
      added = false;
      for (const pool of pools) {
        if (pool.count > 0) { queue.push(pool.kind); pool.count -= 1; added = true; }
      }
    }
    state.waveQueue = queue;
    state.spawnTimer = 0.5;
    state.spawnGap = Math.max(0.35, 0.85 - state.wave * 0.04);
    state.waveActive = true;
    state.buildPhase = false;
    return true;
  }

  function buildTower(padIndex, typeKey) {
    const tower = towers[padIndex];
    if (!tower || tower.type || !TOWERS[typeKey]) return false;
    const cost = TOWERS[typeKey].cost;
    if (state.gold < cost) return false;
    state.gold -= cost;
    tower.type = typeKey; tower.level = 1; tower.invested = cost; tower.cooldown = 0;
    burst(tower.x, tower.y, TOWERS[typeKey].color, 10, 90);
    return true;
  }

  function upgradeTower(padIndex) {
    const tower = towers[padIndex];
    if (!tower || !tower.type || tower.level >= MAX_LEVEL) return false;
    const cost = upgradeCost(tower.type, tower.level);
    if (state.gold < cost) return false;
    state.gold -= cost;
    tower.invested += cost;
    tower.level += 1;
    burst(tower.x, tower.y, '#ffffff', 12, 110);
    return true;
  }

  function sellTower(padIndex) {
    const tower = towers[padIndex];
    if (!tower || !tower.type) return false;
    const refund = Math.floor(tower.invested * 0.7);
    state.gold += refund;
    floatText(tower.x, tower.y - 24, `+${refund}g`, '#f2c94c');
    tower.type = null; tower.level = 0; tower.invested = 0; tower.cooldown = 0;
    return true;
  }

  /** Spend gold the way a sensible player would: one of each tower first, then fill
   * the pads with the type owned least (cheapest breaks ties), then upgrade cheapest. */
  function autoSpend() {
    const bestPad = () => {
      const empty = towers.filter((t) => !t.type);
      if (empty.length === 0) return null;
      empty.sort((a, b) => Math.abs(a.x - 640) - Math.abs(b.x - 640));
      return empty[0];
    };
    let bought = 0;
    for (const type of ['spark', 'ember', 'frost', 'volt']) {
      if (towers.some((t) => t.type === type)) continue;
      const pad = bestPad();
      if (!pad || state.gold < TOWERS[type].cost) continue;
      if (buildTower(pad.pad, type)) bought += 1;
    }
    for (;;) {
      const pad = bestPad();
      if (!pad) break;
      const affordable = TOWER_ORDER.filter((k) => state.gold >= TOWERS[k].cost);
      if (affordable.length === 0) break;
      affordable.sort((a, b) => {
        const ca = towers.filter((t) => t.type === a).length;
        const cb = towers.filter((t) => t.type === b).length;
        return ca - cb || TOWERS[a].cost - TOWERS[b].cost;
      });
      if (!buildTower(pad.pad, affordable[0])) break;
      bought += 1;
    }
    let upgraded = true;
    while (upgraded) {
      upgraded = false;
      const owned = towers.filter((t) => t.type && t.level < MAX_LEVEL);
      owned.sort((a, b) => upgradeCost(a.type, a.level) - upgradeCost(b.type, b.level));
      for (const t of owned) {
        if (upgradeTower(t.pad)) { upgraded = true; break; }
      }
    }
    return bought;
  }

  function damageEnemy(e, amount, events, sourceType) {
    // Bulwarks shrug off part of one tower type's damage (frost).
    const shield = sourceType && ENEMIES[e.kind].shieldVs ? (ENEMIES[e.kind].shieldVs[sourceType] ?? 1) : 1;
    const dealt = Math.max(1, Math.round(amount * shield));
    e.hp -= dealt;
    e.flash = 0.12;
    // Bosses show their damage and shake the screen when hit.
    if (e.kind === 'golem' || e.kind === 'warden') {
      floatText(e.x + (random() * 24 - 12), e.y - e.radius - 12, `-${dealt}`, '#fca5a5');
      state.shake = Math.max(state.shake, e.kind === 'golem' ? 7 : 5);
    }
    if (e.hp > 0) return events;
    e.active = false;
    state.kills += 1;
    state.waveKills += 1;
    // Combo: consecutive kills within 2.5 s raise the multiplier (score and a gold bonus).
    state.combo = state.comboTimer > 0 ? state.combo + 1 : 1;
    state.comboTimer = 2.5;
    if (state.combo > state.comboBest) state.comboBest = state.combo;
    const mult = comboMult(state.combo);
    const scoreGain = Math.round((10 + state.wave * 2) * mult);
    const bonusGold = Math.floor(e.reward * (mult - 1) * 0.5);
    state.score += scoreGain;
    state.waveScore += scoreGain;
    state.gold += e.reward + bonusGold;
    state.waveGold += e.reward + bonusGold;
    floatText(e.x, e.y - e.radius - 6, `+${e.reward + bonusGold}g`, '#f2c94c');
    burst(e.x, e.y, ENEMIES[e.kind].color, e.kind === 'golem' ? 26 : 9, 130);
    events |= EVENT_KILL;
    for (const milestone of [5, 10, 15, 20]) {
      if (state.combo === milestone && state.comboMilestone < milestone) {
        state.comboMilestone = milestone;
        events |= EVENT_COMBO;
        floatText(e.x, e.y - e.radius - 30, `COMBO x${mult.toFixed(2)}!`, '#fde047');
      }
    }
    if (ENEMIES[e.kind].splits) {
      const diff = DIFFICULTY[state.difficulty];
      for (let i = 0; i < ENEMIES[e.kind].splits; i += 1) {
        const m = freeEnemy();
        if (!m) break;
        const def = ENEMIES.mote;
        m.active = true; m.kind = 'mote';
        m.x = e.x + (i === 0 ? -14 : 14); m.y = e.y;
        m.maxHp = Math.round(def.hp * waveHpScale(state.wave) * diff.hp * 0.6); m.hp = m.maxHp;
        m.speed = def.speed * diff.speed; m.radius = def.radius; m.reward = def.reward; m.leak = def.leak;
        m.slow = 0; m.slowTime = 0; m.seg = e.seg; m.progress = e.progress; m.flash = 0;
      }
    }
    return events;
  }

  /** Volt Coil chain: after the primary hit, lightning jumps to nearby enemies. */
  function chainLightning(fromEnemy, damage, chainLeft, chainRange, events) {
    let from = fromEnemy;
    let dmg = damage;
    let left = chainLeft;
    while (left > 0) {
      let best = null;
      let bestD = Infinity;
      for (const e of enemies) {
        if (!e.active || e === from) continue;
        const d = dist(from.x, from.y, e.x, e.y);
        if (d <= chainRange + e.radius && d < bestD) { bestD = d; best = e; }
      }
      if (!best) break;
      dmg = Math.max(1, Math.round(dmg * TOWERS.volt.chainFalloff));
      burst(best.x, best.y, TOWERS.volt.color, 4, 80);
      floatText(best.x, best.y - best.radius - 8, `-${dmg}`, '#fde047');
      events = damageEnemy(best, dmg, events, 'volt');
      events |= EVENT_CHAIN;
      from = best;
      left -= 1;
    }
    return events;
  }

  function step(dt) {
    let events = 0;
    state.time += dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 16);

    // Spawning.
    if (state.waveActive && state.waveQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        spawnEnemy(state.waveQueue.shift(), waveHpScale(state.wave));
        state.spawnTimer += state.spawnGap * (0.85 + random() * 0.3);
      }
    }

    // Enemies march the road.
    for (const e of enemies) {
      if (!e.active) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.slowTime > 0) { e.slowTime -= dt; if (e.slowTime <= 0) e.slow = 0; }
      const speed = e.speed * (1 - e.slow);
      let remaining = speed * dt;
      while (remaining > 0 && e.seg < PATH.length - 1) {
        const target = PATH[e.seg + 1];
        const dx = target.x - e.x;
        const dy = target.y - e.y;
        const d = Math.hypot(dx, dy);
        if (d <= remaining) {
          e.x = target.x; e.y = target.y; e.seg += 1; remaining -= d;
        } else {
          e.x += (dx / d) * remaining; e.y += (dy / d) * remaining; remaining = 0;
        }
        e.progress += speed * dt;
      }
      if (e.seg >= PATH.length - 1 && e.x >= LANTERN.x - 4) {
        e.active = false;
        state.lives -= e.leak;
        state.waveLeaks += e.leak;
        burst(LANTERN.x, LANTERN.y, '#ff6b35', 14, 160);
        events |= EVENT_LEAK;
        if (state.lives <= 0) {
          state.lives = 0;
          state.lost = true;
          state.waveActive = false;
          events |= EVENT_LOST;
        }
      }
    }

    // Towers fire at the enemy furthest along the road in range.
    for (const t of towers) {
      if (!t.type) continue;
      if (t.flash > 0) t.flash -= dt;
      t.cooldown -= dt;
      let best = null;
      let bestProgress = -1;
      const range = towerRange(t.type, t.level);
      for (const e of enemies) {
        if (!e.active) continue;
        if (dist(t.x, t.y, e.x, e.y) > range + e.radius) continue;
        if (e.progress > bestProgress) { bestProgress = e.progress; best = e; }
      }
      if (best) t.angle = Math.atan2(best.y - t.y, best.x - t.x);
      if (best && t.cooldown <= 0) {
        const p = freeProjectile();
        if (p) {
          p.active = true; p.x = t.x; p.y = t.y - 8;
          p.target = best; p.tx = best.x; p.ty = best.y;
          p.type = t.type;
          p.damage = towerDamage(t.type, t.level);
          p.splash = TOWERS[t.type].splash || 0;
          p.slow = TOWERS[t.type].slow || 0;
          p.slowTime = TOWERS[t.type].slowTime || 0;
          p.speed = TOWERS[t.type].projectileSpeed;
          p.chain = TOWERS[t.type].chain || 0;
          p.chainLeft = t.type === 'volt' ? t.level : 0;
          t.cooldown = 1 / towerRate(t.type, t.level);
          t.flash = 0.08;
        }
      }
    }

    // Projectiles home in, then hit.
    for (const p of projectiles) {
      if (!p.active) continue;
      if (p.target && p.target.active) { p.tx = p.target.x; p.ty = p.target.y; }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (d <= Math.max(move, 6)) {
        p.active = false;
        if (p.splash > 0) {
          burst(p.tx, p.ty, '#ff6b35', 10, 120);
          for (const e of enemies) {
            if (!e.active) continue;
            if (dist(p.tx, p.ty, e.x, e.y) <= p.splash + e.radius) events = damageEnemy(e, p.damage, events, p.type);
          }
        } else if (p.target && p.target.active) {
          const e = p.target;
          if (p.slow > 0) {
            const resist = ENEMIES[e.kind].slowResist || 0;
            e.slow = Math.max(e.slow, p.slow * (1 - resist));
            e.slowTime = Math.max(e.slowTime, p.slowTime);
          }
          burst(e.x, e.y, TOWERS[p.type].color, 3, 60);
          events = damageEnemy(e, p.damage, events, p.type);
          if (p.type === 'volt' && p.chainLeft > 0) {
            events = chainLightning(e, p.damage, p.chainLeft, p.chain, events);
          }
        }
      } else {
        p.x += (dx / d) * move;
        p.y += (dy / d) * move;
      }
    }

    // Particles and floating text fade.
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt;
    }
    for (const t of texts) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) t.active = false;
      else t.y -= 28 * dt;
    }

    // Wave cleared?
    if (state.waveActive && state.waveQueue.length === 0 && !enemies.some((e) => e.active)) {
      state.waveActive = false;
      state.buildPhase = true;
      const bonus = waveBonus(state.wave);
      state.gold += bonus;
      state.score += 100 * state.wave;
      state.waveGold += bonus;
      state.waveScore += 100 * state.wave;
      state.waveStats.push({ wave: state.wave, kills: state.waveKills, leaks: state.waveLeaks, gold: state.waveGold, score: state.waveScore });
      floatText(LANTERN.x - 60, LANTERN.y - 60, `Wave ${state.wave} clear! +${bonus}g`, '#f2c94c');
      events |= EVENT_WAVE_CLEAR;
      if (state.wave >= WAVES && !state.lost) {
        state.won = true;
        state.score += state.lives * 50;
        events |= EVENT_WON;
      }
    }

    return events;
  }

  reset();
  return { state, reset, step, startWave, buildTower, upgradeTower, sellTower, autoSpend, setDifficulty };
}
