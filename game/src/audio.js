// Sound only, synthesized with WebAudio: no audio files, no network. The context is created
// on the first user gesture (browsers block audio before that) and every effect is a short
// oscillator or noise burst. M toggles mute.

export function createAudio() {
  let context = null;
  let muted = false;
  let musicTimer = 0;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return context;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      context = new AC();
    } catch {
      context = null;
    }
    return context;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function noise(dur, vol, low) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  const sfx = {
    shoot(type) {
      if (type === 'ember') tone(180, 0.18, 'triangle', 0.10, 70);
      else if (type === 'frost') tone(880, 0.12, 'sine', 0.06, 520);
      else tone(660, 0.07, 'square', 0.045, 440);
    },
    kill() { tone(520, 0.12, 'sine', 0.08, 780); },
    coin() { tone(990, 0.09, 'sine', 0.05, 1320); },
    leak() { tone(220, 0.4, 'sawtooth', 0.12, 55); noise(0.25, 0.08, 400); },
    build() { tone(330, 0.1, 'triangle', 0.09, 495); tone(495, 0.12, 'triangle', 0.07, 660); },
    upgrade() { tone(440, 0.1, 'triangle', 0.08, 660); tone(660, 0.14, 'triangle', 0.08, 880); },
    wave() { tone(196, 0.35, 'triangle', 0.10, 196); tone(294, 0.35, 'triangle', 0.08, 294); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.10), i * 140)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'sawtooth', 0.07), i * 160)); },
    click() { tone(700, 0.05, 'sine', 0.05); },
  };

  /** A soft two-note lantern hum, once every few seconds, only while sound is on. */
  function tick(dt) {
    if (muted) return;
    musicTimer -= dt;
    if (musicTimer <= 0) {
      musicTimer = 4.5;
      tone(220, 1.8, 'sine', 0.018, 220);
      tone(330, 1.8, 'sine', 0.012, 330);
    }
  }

  return {
    unlock() { ensure(); },
    toggleMute() { muted = !muted; return muted; },
    isMuted() { return muted; },
    sfx, tick,
  };
}
