// Emberkeep: Lantern Defense — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. Screens: title, play, paused, game over, victory.
//
// ?seed=N fixes the random pattern. ?shot=start|play|boss|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, STEP, TOWERS, WAVES } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  createWorld, EVENT_KILL, EVENT_LEAK, EVENT_LOST, EVENT_WAVE_CLEAR, EVENT_WON,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_SPEED, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { selectedPad: null, selectedType: null, hover: null, speed: 1, muted: audio.isMuted() });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (cx, cy, rw, rh) => renderer.toField(cx, cy, rw, rh));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let selectedPad = null;
  let selectedType = null;
  let speed = 1;
  let accumulator = 0;
  let last = performance.now();
  let lastShop = null;

  const ui = () => ({ selectedPad, selectedType, hover: input.hover(), speed, muted: audio.isMuted() });

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    selectedPad = null;
    selectedType = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. Defend the lantern for ${WAVES} waves.`);
  }

  function finish(won) {
    screen = won ? SCREEN_WON : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(won ? `Victory! Score ${world.state.score}. Best ${best}.` : `Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function handleEvents(events) {
    if (events & EVENT_KILL) audio.sfx.kill();
    if (events & EVENT_LEAK) { audio.sfx.leak(); announce(`A leak! ${world.state.lives} lantern lives left.`); }
    if (events & EVENT_WAVE_CLEAR) {
      audio.sfx.coin();
      announce(`Wave ${world.state.wave} clear. ${world.state.gold} gold.`);
    }
    if (events & EVENT_WON) { audio.sfx.win(); finish(true); }
    else if (events & EVENT_LOST) { audio.sfx.lose(); finish(false); }
  }

  function tryBuildAtPad(pad) {
    if (selectedType) {
      if (world.buildTower(pad, selectedType)) {
        audio.sfx.build();
        announce(`${TOWERS[selectedType].name} built.`);
        selectedType = null;
      } else {
        announce('Not enough gold for that tower.');
      }
      return;
    }
    selectedPad = pad;
    audio.sfx.click();
  }

  function handleClick(click) {
    if (!click || !lastShop) return;
    audio.unlock();
    const hit = renderer.hitTest(click.x, click.y, world.state, ui(), lastShop);
    if (!hit) { selectedPad = null; selectedType = null; return; }
    if (hit.kind === 'shop') {
      selectedType = selectedType === hit.key ? null : hit.key;
      selectedPad = null;
      audio.sfx.click();
      return;
    }
    if (hit.kind === 'wave') {
      if (world.startWave()) { audio.sfx.wave(); announce(`Wave ${world.state.wave} incoming!`); }
      return;
    }
    if (hit.kind === 'speed') {
      speed = speed === 1 ? 2 : 1;
      audio.sfx.click();
      return;
    }
    if (hit.kind === 'pad') {
      tryBuildAtPad(hit.pad);
      return;
    }
    selectedPad = null;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_SPEED) speed = speed === 1 ? 2 : 1;
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_WON)) { startGame(); return; }
    const towerKey = input.takeTowerKey();
    if (towerKey) {
      selectedType = selectedType === towerKey ? null : towerKey;
      selectedPad = null;
      audio.sfx.click();
    }
    // Clicks are only meaningful on the play screen (and title/over to start).
    const click = input.takeClick();
    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WON) {
      if (actions & ACTION_CONFIRM) { audio.unlock(); startGame(); }
      return;
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) { screen = SCREEN_PAUSED; announce('Paused.'); }
      else if (screen === SCREEN_PAUSED) { screen = SCREEN_PLAY; announce('Playing.'); }
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    if (actions & ACTION_CONFIRM) {
      // Space starts the next wave; a click is handled below, not as a wave start.
      if (click) handleClick(click);
      else if (world.startWave()) { audio.sfx.wave(); announce(`Wave ${world.state.wave} incoming!`); }
      return;
    }
    if (click) handleClick(click);
  }

  // Upgrade (U) and sell (X) are plain key presses while a tower is selected.
  window.addEventListener('keydown', (event) => {
    if (screen !== SCREEN_PLAY || selectedPad == null) return;
    if (event.code === 'KeyU' && !event.repeat) {
      if (world.upgradeTower(selectedPad)) { audio.sfx.upgrade(); announce('Tower upgraded.'); }
    } else if (event.code === 'KeyX' && !event.repeat) {
      if (world.sellTower(selectedPad)) { audio.sfx.coin(); selectedPad = null; announce('Tower sold.'); }
    }
  });

  function step() {
    const events = world.step(STEP);
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME) * speed;
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE) {
      // A living backdrop: the road marches behind the title panel, wave after wave.
      while (accumulator >= STEP) {
        world.step(STEP);
        accumulator -= STEP;
        if (!world.state.waveActive || world.state.lives <= 0) {
          world.reset();
          world.startWave();
        }
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        step();
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
    }
    audio.tick(1 / 60);
    lastShop = renderer.draw(world.state, screen, best, ui());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Emberkeep. Press Space or click to begin.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
