// The screenshot scenes behind ?shot=start|play|boss|end. Each one plays the real rules
// forward from a fresh world, steered by the same build-and-upgrade spending a sensible
// player would do, so the frame is what a real game looks like and the same seed always
// gives the same frame.
import { STEP } from './config.js';
import { EVENT_LOST, EVENT_WON } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WON } from './render.js';

function playWaves(world, targetWave, maxSeconds) {
  const steps = Math.floor(maxSeconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const s = world.state;
    if (s.lost || s.won) break;
    if (!s.waveActive && s.wave < targetWave) {
      world.autoSpend();
      world.startWave();
    }
    const events = world.step(STEP);
    if (events & EVENT_WON) break;
    if (events & EVENT_LOST) break;
    // Keep spending between waves.
    if (!s.waveActive && s.wave >= targetWave) break;
  }
}

export function stageShot(name, world) {
  world.reset();
  if (name === 'play') {
    // A few towers up, mid-wave 3, enemies on the road.
    world.autoSpend();
    playWaves(world, 3, 90);
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'boss') {
    // Waves 1-9 cleared, then wave 10 in progress with the Ember Golem on the road.
    playWaves(world, 9, 600);
    world.autoSpend();
    world.startWave();
    for (let i = 0; i < 150 / STEP; i += 1) {
      world.step(STEP);
      const golem = world.state.enemies.find((e) => e.active && e.kind === 'golem');
      if (golem && golem.x > 420) break;
      if (world.state.lost || world.state.won) break;
    }
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'end' || name === 'win') {
    playWaves(world, 10, 900);
    if (world.state.won) return { screen: SCREEN_WON, best: world.state.score };
    if (world.state.lost) return { screen: SCREEN_OVER, best: world.state.score };
    return { screen: SCREEN_PLAY, best: world.state.score };
  }
  // start: title over a road already marching, with a few towers built.
  world.autoSpend();
  world.startWave();
  for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP);
  return { screen: SCREEN_TITLE, best: 0 };
}
