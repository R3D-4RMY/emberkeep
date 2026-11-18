// Keyboard and pointer input for Emberkeep. One-shot presses (start wave, pause, mute,
// restart, tower keys) are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. Pointer clicks and hover are reported in
// field coordinates (the caller supplies the canvas-to-field mapping).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_RESTART = 8;
export const ACTION_SPEED = 16;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const RESTART = new Set(['KeyR']);
const SPEED = new Set(['KeyF']);
const TOWER_KEYS = { Digit1: 'spark', Digit2: 'ember', Digit3: 'frost', Digit4: 'volt', Digit5: 'snipe', Numpad1: 'spark', Numpad2: 'ember', Numpad3: 'frost', Numpad4: 'volt', Numpad5: 'snipe' };
const DIFFICULTY_KEYS = { KeyC: 'chill', KeyN: 'normal', KeyE: 'ember' };

export function createInput(canvas, toField) {
  let actions = 0;
  let towerKey = null;
  let difficultyKey = null;
  let click = null; // {x, y} in field coordinates, taken once
  let hover = { x: -9999, y: -9999 };

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else if (SPEED.has(event.code)) {
      if (!event.repeat) actions |= ACTION_SPEED;
    } else if (TOWER_KEYS[event.code]) {
      if (!event.repeat) towerKey = TOWER_KEYS[event.code];
    } else if (DIFFICULTY_KEYS[event.code]) {
      if (!event.repeat) difficultyKey = DIFFICULTY_KEYS[event.code];
    } else return;
    event.preventDefault();
  });

  function pointerPos(event) {
    const rect = canvas.getBoundingClientRect();
    return toField(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  }
  canvas.addEventListener('pointermove', (event) => { hover = pointerPos(event); });
  canvas.addEventListener('pointerdown', (event) => {
    click = pointerPos(event);
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('blur', () => { hover = { x: -9999, y: -9999 }; });

  return {
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    takeTowerKey() {
      const key = towerKey;
      towerKey = null;
      return key;
    },
    takeDifficultyKey() {
      const key = difficultyKey;
      difficultyKey = null;
      return key;
    },
    takeClick() {
      const c = click;
      click = null;
      return c;
    },
    hover() { return hover; },
  };
}
