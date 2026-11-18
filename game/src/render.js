// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Canvas shapes and text for the field, towers, enemies, HUD, shop bar and panels.
import { DIFFICULTY, DIFFICULTY_ORDER, ENEMIES, FIELD, FONT, LANTERN, MAX_LEVEL, PADS, PALETTE, PATH, TOWERS, TOWER_ORDER, WAVES, waveComposition } from './config.js';
import { comboMult, towerDamage, towerRange, upgradeCost } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WON = 'won';

const PANEL = { width: 800, top: 150, line: 32, bottom: 76 };
const SHOP = { y: 656, height: 64 };
const CARD_W = 165;
const CARD_GAP = 10;
let titleButtons = [];

/** Fixed starfield, so the sky looks the same every run. */
const STARS = [];
{
  let a = 1234567;
  const rnd = () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; };
  for (let i = 0; i < 90; i += 1) STARS.push({ x: rnd() * FIELD.width, y: rnd() * 300, r: 0.6 + rnd() * 1.4, tw: rnd() * Math.PI * 2 });
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) { value = next; text = prefix + next; }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const goldLabel = cachedLabel('Gold ');
  const scoreLabel = cachedLabel('Score ');
  const waveLabel = cachedLabel('Wave ');
  const livesLabel = cachedLabel('Lantern ');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  /** Convert a pointer position (CSS px inside the canvas) to field coordinates. */
  function toField(cx, cy, rectW, rectH) {
    const scale = Math.min(rectW / FIELD.width, rectH / FIELD.height);
    const ox = (rectW - FIELD.width * scale) / 2;
    const oy = (rectH - FIELD.height * scale) / 2;
    return { x: (cx - ox) / scale, y: (cy - oy) / scale };
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function circle(x, y, r, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
  }

  function drawSky(time) {
    const grad = context.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const s of STARS) {
      context.globalAlpha = 0.35 + 0.35 * Math.sin(time * 1.5 + s.tw);
      circle(s.x, s.y, s.r, '#e2e8f0');
    }
    context.globalAlpha = 1;
    // Distant hills.
    context.fillStyle = PALETTE.ground;
    context.beginPath();
    context.moveTo(0, 300);
    context.quadraticCurveTo(320, 220, 640, 290);
    context.quadraticCurveTo(960, 350, 1280, 260);
    context.lineTo(1280, FIELD.height);
    context.lineTo(0, FIELD.height);
    context.closePath();
    context.fill();
  }

  function drawPath() {
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = PALETTE.pathEdge;
    context.lineWidth = 52;
    context.beginPath();
    context.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i += 1) context.lineTo(PATH[i].x, PATH[i].y);
    context.stroke();
    context.strokeStyle = PALETTE.path;
    context.lineWidth = 40;
    context.stroke();
    context.strokeStyle = 'rgba(242,201,76,0.25)';
    context.lineWidth = 2;
    context.setLineDash([10, 14]);
    context.beginPath();
    context.moveTo(PATH[0].x, PATH[0].y);
    for (let i = 1; i < PATH.length; i += 1) context.lineTo(PATH[i].x, PATH[i].y);
    context.stroke();
    context.setLineDash([]);
  }

  function drawLantern(state) {
    const flicker = 0.75 + 0.25 * Math.sin(state.time * 3.1) * Math.sin(state.time * 1.7);
    const glow = context.createRadialGradient(LANTERN.x, LANTERN.y, 4, LANTERN.x, LANTERN.y, 110 * flicker);
    glow.addColorStop(0, 'rgba(255,183,3,0.55)');
    glow.addColorStop(1, 'rgba(255,183,3,0)');
    context.fillStyle = glow;
    context.fillRect(LANTERN.x - 120, LANTERN.y - 120, 240, 240);
    // Lantern post and lamp.
    context.fillStyle = '#5b4636';
    context.fillRect(LANTERN.x - 4, LANTERN.y - 6, 8, 46);
    context.fillStyle = '#1f2937';
    context.fillRect(LANTERN.x - 16, LANTERN.y - 34, 32, 30);
    circle(LANTERN.x, LANTERN.y - 19, 11 * flicker, '#ffd166');
    circle(LANTERN.x, LANTERN.y - 19, 5, '#fff7d6');
    text('THE LANTERN', LANTERN.x + 8, LANTERN.y + 62, 13, PALETTE.muted, 'right');
  }

  function drawPads(state, ui) {
    for (const tower of state.towers) {
      const pad = PADS[tower.pad];
      const isHover = ui.hover && Math.hypot(ui.hover.x - pad.x, ui.hover.y - pad.y) < 26;
      const isSelected = ui.selectedPad === tower.pad;
      circle(pad.x, pad.y, 26, isSelected ? '#3b4a6b' : PALETTE.pad);
      context.strokeStyle = isSelected ? PALETTE.gold : PALETTE.padEmpty;
      context.lineWidth = isSelected ? 3 : 2;
      context.beginPath();
      context.arc(pad.x, pad.y, 26, 0, Math.PI * 2);
      context.stroke();
      if (!tower.type) {
        if (isHover || isSelected) {
          context.fillStyle = PALETTE.muted;
          text('+', pad.x, pad.y + 7, 22, PALETTE.muted, 'center');
        } else {
          circle(pad.x, pad.y, 3, PALETTE.padEmpty);
        }
      }
    }
  }

  function drawTowers(state) {
    for (const t of state.towers) {
      if (!t.type) continue;
      const def = TOWERS[t.type];
      // Base.
      circle(t.x, t.y, 22, def.dark);
      circle(t.x, t.y, 18, def.color);
      if (t.type === 'volt') {
        // The coil: a lightning zigzag above the prongs.
        context.strokeStyle = '#fef9c3';
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(t.x - 8, t.y - 26);
        context.lineTo(t.x - 1, t.y - 16);
        context.lineTo(t.x - 6, t.y - 16);
        context.lineTo(t.x + 2, t.y - 4);
        context.lineTo(t.x + 8, t.y - 14);
        context.stroke();
        context.fillStyle = def.dark;
        context.fillRect(t.x - 10, t.y - 2, 4, 10);
        context.fillRect(t.x + 6, t.y - 2, 4, 10);
      } else {
        // Barrel pointing at the target.
        context.save();
        context.translate(t.x, t.y - 6);
        context.rotate(t.angle);
        context.fillStyle = def.dark;
        context.fillRect(0, -4, 26, 8);
        context.restore();
      }
      // Level pips.
      for (let i = 0; i < t.level; i += 1) circle(t.x - 12 + i * 12, t.y + 14, 3.5, '#fff7d6');
      if (t.flash > 0) {
        context.globalAlpha = 0.5;
        circle(t.x, t.y - 6, 26, '#ffffff');
        context.globalAlpha = 1;
      }
    }
  }

  function drawEnemies(state) {
    for (const e of state.enemies) {
      if (!e.active) continue;
      const def = ENEMIES[e.kind];
      const slowTint = e.slow > 0;
      if (e.kind === 'spark') {
        // Sparks crackle: a bright halo around the fast little body.
        context.globalAlpha = 0.35;
        circle(e.x, e.y, e.radius + 5, '#fde047');
        context.globalAlpha = 1;
      }
      circle(e.x, e.y, e.radius, def.dark);
      circle(e.x, e.y, e.radius - 3, slowTint ? '#bae6fd' : def.color);
      if (e.kind === 'bulwark') {
        // The shield ring: frost only dents it.
        context.strokeStyle = 'rgba(226,232,240,0.85)';
        context.lineWidth = 3;
        context.beginPath();
        context.arc(e.x, e.y, e.radius + 4, 0, Math.PI * 2);
        context.stroke();
      }
      if (e.kind === 'warden') {
        // The mini-boss wears a crown of embers.
        context.fillStyle = '#fde047';
        for (let i = -1; i <= 1; i += 1) {
          context.beginPath();
          context.moveTo(e.x + i * 12 - 5, e.y - e.radius + 2);
          context.lineTo(e.x + i * 12, e.y - e.radius - 10);
          context.lineTo(e.x + i * 12 + 5, e.y - e.radius + 2);
          context.closePath();
          context.fill();
        }
      }
      // Eyes looking along the road.
      const dir = e.seg < PATH.length - 1 ? Math.atan2(PATH[e.seg + 1].y - e.y, PATH[e.seg + 1].x - e.x) : 0;
      const ex = Math.cos(dir) * 5;
      const ey = Math.sin(dir) * 4;
      circle(e.x + ex - 4, e.y + ey - 2, 2.5, '#0f172a');
      circle(e.x + ex + 4, e.y + ey - 2, 2.5, '#0f172a');
      if (e.flash > 0) {
        context.globalAlpha = 0.6;
        circle(e.x, e.y, e.radius, '#ffffff');
        context.globalAlpha = 1;
      }
      // Health bar.
      const w = e.radius * 2;
      context.fillStyle = '#0f172a';
      context.fillRect(e.x - w / 2, e.y - e.radius - 10, w, 5);
      context.fillStyle = e.hp / e.maxHp > 0.35 ? '#4ade80' : '#f87171';
      context.fillRect(e.x - w / 2, e.y - e.radius - 10, w * Math.max(0, e.hp / e.maxHp), 5);
    }
  }

  function drawProjectiles(state) {
    for (const p of state.projectiles) {
      if (!p.active) continue;
      const def = TOWERS[p.type];
      circle(p.x, p.y, p.type === 'ember' ? 7 : 5, def.color);
      circle(p.x, p.y, 2.5, '#ffffff');
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      if (!p.active) continue;
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      circle(p.x, p.y, p.size, p.color);
    }
    context.globalAlpha = 1;
    for (const t of state.texts) {
      if (!t.active) continue;
      context.globalAlpha = Math.min(1, t.life / 0.5);
      text(t.text, t.x, t.y, 16, t.color, 'center');
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, ui, screen) {
    context.fillStyle = 'rgba(11,16,32,0.72)';
    context.fillRect(0, 0, FIELD.width, 52);
    context.textBaseline = 'top';
    text(goldLabel(state.gold), 20, 12, 26, PALETTE.gold, 'left', 'top');
    text(scoreLabel(state.score), 220, 12, 26, PALETTE.text, 'left', 'top');
    if (state.combo >= 2) {
      const mult = comboMult(state.combo);
      text(`COMBO x${mult.toFixed(2)} · ${state.combo}`, 420, 14, 20, '#fde047', 'left', 'top');
      // The combo timer drains under the label.
      context.fillStyle = '#334155';
      context.fillRect(420, 38, 120, 5);
      context.fillStyle = '#fde047';
      context.fillRect(420, 38, 120 * Math.max(0, state.comboTimer / 2.5), 5);
    }
    const waveText = screen === SCREEN_TITLE || state.wave === 0 ? 'Wave –/10' : waveLabel(state.wave) + ` / ${WAVES}`;
    text(waveText, 770, 12, 26, PALETTE.text, 'center', 'top');
    text(livesLabel(state.lives), 1260, 12, 26, state.lives <= 5 ? PALETTE.lives : PALETTE.text, 'right', 'top');
    if (screen === SCREEN_TITLE) return;
    if (state.waveActive) {
      const remaining = state.waveQueue.length + state.enemies.filter((e) => e.active).length;
      text(`Enemies left: ${remaining}`, 640, 38, 14, PALETTE.muted, 'center', 'top');
    } else if (!state.won && !state.lost && state.wave < WAVES) {
      text('Build phase — press Space to send the next wave', 640, 38, 14, PALETTE.gold, 'center', 'top');
    }
    text(DIFFICULTY[state.difficulty].name, 1060, 38, 13, PALETTE.muted, 'right', 'top');
    if (ui.speed > 1) text(`Speed x${ui.speed}`, 1080, 12, 16, PALETTE.muted, 'right', 'top');
    if (ui.muted) text('Muted (M)', 980, 12, 16, PALETTE.muted, 'right', 'top');
  }

  /** Build-phase panel: what the next wave brings, so the player can plan. */
  function drawWavePreview(state, screen) {
    if (screen !== SCREEN_PLAY || state.waveActive || state.won || state.lost || state.wave >= WAVES) return;
    const next = state.wave + 1;
    const comp = waveComposition(next);
    const x = 1000;
    const y = 60;
    const w = 264;
    const h = 34 + comp.length * 19 + 8;
    context.fillStyle = 'rgba(20,27,46,0.88)';
    context.fillRect(x, y, w, h);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1.5;
    context.strokeRect(x, y, w, h);
    const bossHere = comp.some(([kind]) => kind === 'golem' || kind === 'warden');
    text(`NEXT — WAVE ${next}${bossHere ? '  ⚠ BOSS' : ''}`, x + 12, y + 8, 15, bossHere ? '#f87171' : PALETTE.gold, 'left', 'top');
    for (let i = 0; i < comp.length; i += 1) {
      const [kind, count] = comp[i];
      const def = ENEMIES[kind];
      circle(x + 20, y + 40 + i * 19, 6, def.color);
      text(`${count}× ${def.name}`, x + 32, y + 34 + i * 19, 13, PALETTE.text, 'left', 'top');
    }
  }

  function drawRange(state, ui) {
    const tower = ui.selectedPad != null ? state.towers[ui.selectedPad] : null;
    if (tower && tower.type) {
      context.globalAlpha = 0.14;
      circle(tower.x, tower.y, towerRange(tower.type, tower.level), '#ffffff');
      context.globalAlpha = 1;
      context.strokeStyle = 'rgba(255,255,255,0.5)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(tower.x, tower.y, towerRange(tower.type, tower.level), 0, Math.PI * 2);
      context.stroke();
    } else if (ui.selectedType) {
      const hover = ui.hover;
      if (hover) {
        context.globalAlpha = 0.12;
        circle(hover.x, hover.y, TOWERS[ui.selectedType].range, TOWERS[ui.selectedType].color);
        context.globalAlpha = 1;
      }
    }
  }

  function shopCard(index, key, state, ui) {
    const def = TOWERS[key];
    const x = 16 + index * (CARD_W + CARD_GAP);
    const y = SHOP.y + 6;
    const selected = ui.selectedType === key;
    const afford = state.gold >= def.cost;
    context.fillStyle = selected ? '#2e3d5f' : PALETTE.panel;
    context.fillRect(x, y, CARD_W, 52);
    context.strokeStyle = selected ? PALETTE.gold : PALETTE.panelEdge;
    context.lineWidth = selected ? 2.5 : 1.5;
    context.strokeRect(x, y, CARD_W, 52);
    circle(x + 20, y + 26, 11, def.color);
    text(`${index + 1} · ${def.name}`, x + 36, y + 10, 14, afford ? PALETTE.text : PALETTE.muted, 'left', 'top');
    text(`${def.cost}g — ${def.desc}`, x + 36, y + 30, 11, PALETTE.muted, 'left', 'top');
    return { x, y, w: CARD_W, h: 52 };
  }

  function drawShop(state, ui) {
    context.fillStyle = 'rgba(11,16,32,0.85)';
    context.fillRect(0, SHOP.y, FIELD.width, SHOP.height);
    const cards = TOWER_ORDER.map((key, i) => shopCard(i, key, state, ui));
    // Wave / speed buttons on the right.
    const waveX = 16 + TOWER_ORDER.length * (CARD_W + CARD_GAP) + 8;
    const waveW = 150;
    const waveY = SHOP.y + 6;
    const canWave = !state.waveActive && !state.won && !state.lost && state.wave < WAVES;
    context.fillStyle = canWave ? '#b45309' : '#334155';
    context.fillRect(waveX, waveY, waveW, 52);
    text(canWave ? '▶  Start wave [Space]' : state.won ? 'Victory!' : state.lost ? 'Fallen…' : 'Wave running…', waveX + waveW / 2, waveY + 30, 14, '#fff7d6', 'center');
    const speedX = waveX + waveW + 10;
    context.fillStyle = PALETTE.panel;
    context.fillRect(speedX, waveY, 100, 52);
    context.strokeStyle = PALETTE.panelEdge;
    context.strokeRect(speedX, waveY, 100, 52);
    text(`Speed x${ui.speed} [F]`, speedX + 50, waveY + 30, 14, PALETTE.text, 'center');
    // Selected tower panel: upgrade / sell.
    const tower = ui.selectedPad != null ? state.towers[ui.selectedPad] : null;
    if (tower && tower.type) {
      const def = TOWERS[tower.type];
      const px = speedX + 110;
      const pw = FIELD.width - px - 16;
      context.fillStyle = PALETTE.panel;
      context.fillRect(px, waveY, pw, 52);
      context.strokeStyle = PALETTE.panelEdge;
      context.strokeRect(px, waveY, pw, 52);
      const upCost = tower.level < MAX_LEVEL ? upgradeCost(tower.type, tower.level) : null;
      const sell = Math.floor(tower.invested * 0.7);
      text(`${def.name} · Lv ${tower.level} · ${Math.round(towerDamage(tower.type, tower.level))} dmg · ${Math.round(towerRange(tower.type, tower.level))} range`, px + 12, waveY + 12, 14, PALETTE.text, 'left', 'top');
      text(upCost != null ? `[U] Upgrade ${upCost}g    [X] Sell +${sell}g` : `[X] Sell +${sell}g  (max level)`, px + 12, waveY + 32, 13, PALETTE.gold, 'left', 'top');
    }
    return { cards, wave: { x: waveX, y: waveY, w: waveW, h: 52 }, speed: { x: speedX, y: waveY, w: 100, h: 52 } };
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10,14,28,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 44, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + PANEL.top + i * PANEL.line, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 34, 22, PALETTE.gold, 'center');
  }

  /** Title screen: the pitch, the tower roster, and the difficulty pick. */
  function drawTitle(state, best, ui) {
    const lines = [
      'Lantern Defense — hold the road for 10 waves.',
      'Click a pad, pick a tower (1 / 2 / 3 / 4), then send the wave.',
      'Spark is fast · Ember splashes · Frost slows · Volt chains lightning.',
      'Kills in a row build a combo — up to x2.00 score and bonus gold.',
      'Wave 5 hides the Cinder Warden, wave 10 the Ember Golem.',
      best > 0 ? bestLabel(best) : 'No keeper has held the light yet.',
    ];
    const btnW = 240;
    const btnH = 56;
    const btnY = 150 + lines.length * PANEL.line + 18;
    const height = btnY + btnH + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10,14,28,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text('EMBERKEEP', FIELD.width / 2, y + 72, 44, PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + PANEL.top + i * PANEL.line, 19, PALETTE.muted, 'center');
    }
    titleButtons = DIFFICULTY_ORDER.map((key, i) => {
      const def = DIFFICULTY[key];
      const bx = x + 24 + i * (btnW + 16);
      const selected = ui.difficulty === key;
      context.fillStyle = selected ? '#2e3d5f' : '#0f172a';
      context.fillRect(bx, y + btnY, btnW, btnH);
      context.strokeStyle = selected ? PALETTE.gold : PALETTE.panelEdge;
      context.lineWidth = selected ? 2.5 : 1.5;
      context.strokeRect(bx, y + btnY, btnW, btnH);
      text(def.name, bx + btnW / 2, y + btnY + 24, 19, selected ? PALETTE.gold : PALETTE.text, 'center');
      text(def.desc, bx + btnW / 2, y + btnY + 44, 12, PALETTE.muted, 'center');
      return { key, x: bx, y: y + btnY, w: btnW, h: btnH };
    });
    text('Click a difficulty, then press Space or click to begin  ·  [C] Chill  [N] Normal  [E] Ember', FIELD.width / 2, y + height - 30, 17, PALETTE.gold, 'center');
  }

  /** Victory screen: the score broken down, and every wave's own line. */
  function drawVictory(state, best) {
    const stats = state.waveStats;
    const waveBonusTotal = stats.reduce((sum, s) => sum + 100 * s.wave, 0);
    const livesBonus = state.lives * 50;
    const killScore = state.score - waveBonusTotal - livesBonus;
    const title = 'THE LIGHT HOLDS!';
    const breakdown = [
      `Kills: ${state.kills} invaders felled — ${killScore.toLocaleString()} pts (combo best x${comboMult(state.comboBest).toFixed(2)})`,
      `Wave bonuses: ${waveBonusTotal.toLocaleString()} pts`,
      `Lantern lives bonus: ${state.lives} × 50 = ${livesBonus.toLocaleString()} pts`,
      `Total: ${state.score.toLocaleString()} pts`,
    ];
    const rowH = 21;
    const height = 84 + breakdown.length * 27 + 30 + stats.length * rowH + 92;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = Math.max(8, (FIELD.height - height) / 2);
    context.fillStyle = 'rgba(10,14,28,0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 56, 40, PALETTE.gold, 'center');
    for (let i = 0; i < breakdown.length; i += 1) {
      text(breakdown[i], FIELD.width / 2, y + 96 + i * 27, 18, i === breakdown.length - 1 ? PALETTE.text : PALETTE.muted, 'center');
    }
    const tableY = y + 96 + breakdown.length * 27 + 14;
    const cols = [300, 480, 620, 760, 920];
    const heads = ['WAVE', 'KILLS', 'LEAKS', 'GOLD', 'SCORE'];
    for (let c = 0; c < cols.length; c += 1) text(heads[c], cols[c], tableY, 14, PALETTE.muted, 'center');
    for (let i = 0; i < stats.length; i += 1) {
      const s = stats[i];
      const vals = [`Wave ${s.wave}`, String(s.kills), String(s.leaks), `+${s.gold}g`, String(s.score)];
      for (let c = 0; c < cols.length; c += 1) text(vals[c], cols[c], tableY + 8 + (i + 1) * rowH, 15, PALETTE.text, 'center');
    }
    text(bestLabel(best), FIELD.width / 2, y + height - 44, 18, PALETTE.muted, 'center');
    text('Press Space or R to play again', FIELD.width / 2, y + height - 16, 17, PALETTE.gold, 'center');
  }

  function draw(state, screen, best, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    // Screen shake (boss hits): a deterministic wobble from the clock, so a staged
    // screenshot is the same every run.
    const sh = state.shake || 0;
    const ox = sh * Math.sin(state.time * 127.1);
    const oy = sh * Math.cos(state.time * 149.7);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + ox * view.scale, view.y + oy * view.scale);
    drawSky(state.time);
    drawPath();
    drawPads(state, ui);
    drawLantern(state);
    drawTowers(state);
    drawEnemies(state);
    drawProjectiles(state);
    drawParticles(state);
    drawRange(state, ui);
    drawHud(state, ui, screen);
    drawWavePreview(state, screen);
    const shop = drawShop(state, ui);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best, ui);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The embers wait for you.'], 'Press P or Space to resume');
    } else if (screen === SCREEN_OVER) {
      drawPanel('The light went out', [
        finalLabel(state.score),
        `You held to wave ${state.wave} of ${WAVES} · ${state.kills} invaders felled`,
        bestLabel(best),
      ], 'Press Space or R to try again');
    } else if (screen === SCREEN_WON) {
      drawVictory(state, best);
    }
    return { ...shop, difficulty: titleButtons };
  }

  /** Map a field-coordinate click to a UI target, or null. */
  function hitTest(x, y, state, ui, shop, screen) {
    if (screen === SCREEN_TITLE) {
      for (const b of shop.difficulty || []) {
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { kind: 'difficulty', key: b.key };
      }
      return { kind: 'title' };
    }
    if (y >= SHOP.y) {
      for (let i = 0; i < TOWER_ORDER.length; i += 1) {
        const c = shop.cards[i];
        if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return { kind: 'shop', key: TOWER_ORDER[i] };
      }
      if (x >= shop.wave.x && x <= shop.wave.x + shop.wave.w && y >= shop.wave.y && y <= shop.wave.y + shop.wave.h) return { kind: 'wave' };
      if (x >= shop.speed.x && x <= shop.speed.x + shop.speed.w && y >= shop.speed.y && y <= shop.speed.y + shop.speed.h) return { kind: 'speed' };
      return { kind: 'shop-empty' };
    }
    for (const tower of state.towers) {
      const pad = PADS[tower.pad];
      if (Math.hypot(x - pad.x, y - pad.y) < 28) return { kind: 'pad', pad: tower.pad };
    }
    return null;
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toField, hitTest, view };
}
