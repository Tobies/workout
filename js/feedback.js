// Sound (WebAudio synth — no asset files) + haptics, with persisted prefs.
// Audio must be unlocked by a user gesture (call unlock() from the START tap).

const PREF_KEY = 'slworkout.prefs';

function loadPrefs() {
  try {
    return { sound: true, haptics: true, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return { sound: true, haptics: true };
  }
}
let prefs = loadPrefs();
function savePrefs() { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }

export const isSoundOn = () => prefs.sound;
export const isHapticOn = () => prefs.haptics;
export function toggleSound() { prefs.sound = !prefs.sound; savePrefs(); if (prefs.sound) unlock(); return prefs.sound; }
export function toggleHaptic() { prefs.haptics = !prefs.haptics; savePrefs(); if (prefs.haptics) vibrate(20); return prefs.haptics; }

// ---- Audio -----------------------------------------------------------------

let ctx = null;

export function unlock() {
  if (!prefs.sound) return;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio unsupported */ }
}

// One note: frequency, start offset, duration, waveform, peak gain.
function note(freq, at, dur, type = 'triangle', peak = 0.18) {
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function play(seq) {
  if (!prefs.sound) return;
  unlock();
  if (!ctx) return;
  for (const n of seq) note(n.f, n.at, n.d, n.type, n.g);
}

// ---- Haptics ---------------------------------------------------------------

export function vibrate(pattern) {
  if (!prefs.haptics) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

// ---- Named feedback presets (sound + haptic together) ----------------------

export const fx = {
  tap() {
    play([{ f: 520, at: 0, d: 0.06, type: 'square', g: 0.08 }]);
    vibrate(8);
  },
  start() {
    play([
      { f: 392, at: 0, d: 0.12 },
      { f: 587, at: 0.1, d: 0.14 },
      { f: 784, at: 0.22, d: 0.22 },
    ]);
    vibrate([20, 30, 40]);
  },
  complete() {
    play([
      { f: 660, at: 0, d: 0.1, type: 'triangle', g: 0.2 },
      { f: 990, at: 0.08, d: 0.16, type: 'triangle', g: 0.2 },
    ]);
    vibrate(30);
  },
  tick() {
    play([{ f: 880, at: 0, d: 0.05, type: 'square', g: 0.1 }]);
    vibrate(12);
  },
  restEnd() {
    // Clear two-tone bell "ding-dong" — the rest-over alert.
    play([
      { f: 1318, at: 0,    d: 0.5,  type: 'sine', g: 0.34 }, // E6 ding
      { f: 1046, at: 0.0,  d: 0.5,  type: 'sine', g: 0.16 }, // C6 harmony
      { f: 880,  at: 0.42, d: 0.6,  type: 'sine', g: 0.34 }, // A5 dong
      { f: 1318, at: 0.42, d: 0.6,  type: 'sine', g: 0.14 },
    ]);
    vibrate([120, 80, 160]);
  },
  levelUp() {
    play([
      { f: 523, at: 0, d: 0.14 },
      { f: 659, at: 0.13, d: 0.14 },
      { f: 784, at: 0.26, d: 0.14 },
      { f: 1046, at: 0.39, d: 0.4, g: 0.24 },
    ]);
    vibrate([30, 40, 30, 40, 90]);
  },
  finish() {
    play([
      { f: 440, at: 0, d: 0.12 },
      { f: 554, at: 0.12, d: 0.12 },
      { f: 659, at: 0.24, d: 0.3, g: 0.22 },
    ]);
    vibrate([50, 40, 80]);
  },
};
