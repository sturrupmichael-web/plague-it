// Sound effects, synthesized with the Web Audio API (no sound files). Every sound is a
// short recipe of oscillator notes below. The AudioContext is only created after the
// first tap or key press (browsers block audio before that), and nothing is created at
// all while muted. If Web Audio is missing, every call quietly does nothing.

/**
 * Each sound: a list of notes { f: start Hz, to: end Hz, t: start s, d: length s,
 * type: oscillator wave, v: volume 0..1 }, and `gap`: the fewest seconds between two
 * plays of it (stops a burst of events from turning into noise).
 */
export const SOUNDS = {
  click: { gap: 0.04, notes: [{ f: 880, to: 660, d: 0.05, type: 'square', v: 0.12 }] },
  pop: { gap: 0.05, notes: [{ f: 520, to: 1250, d: 0.09, type: 'triangle', v: 0.35 }] },
  reached: { gap: 0.25, notes: [{ f: 330, to: 300, d: 0.12, type: 'sine', v: 0.18 }, { f: 495, t: 0.07, d: 0.12, type: 'sine', v: 0.12 }] },
  evolve: {
    gap: 0.1,
    notes: [
      { f: 392, d: 0.09, type: 'square', v: 0.14 },
      { f: 523, t: 0.08, d: 0.09, type: 'square', v: 0.14 },
      { f: 784, t: 0.16, d: 0.18, type: 'square', v: 0.14 },
    ],
  },
  devolve: { gap: 0.1, notes: [{ f: 523, to: 262, d: 0.22, type: 'square', v: 0.12 }] },
  detected: {
    gap: 1,
    notes: [
      { f: 880, d: 0.18, type: 'sawtooth', v: 0.16 },
      { f: 660, t: 0.2, d: 0.18, type: 'sawtooth', v: 0.16 },
      { f: 880, t: 0.4, d: 0.18, type: 'sawtooth', v: 0.16 },
      { f: 660, t: 0.6, d: 0.24, type: 'sawtooth', v: 0.16 },
    ],
  },
  response: { gap: 0.4, notes: [{ f: 150, to: 70, d: 0.3, type: 'sawtooth', v: 0.22 }, { f: 300, to: 140, d: 0.18, type: 'square', v: 0.08 }] },
  mutated: { gap: 0.3, notes: [{ f: 300, to: 900, d: 0.15, type: 'triangle', v: 0.2 }, { f: 900, to: 450, t: 0.15, d: 0.15, type: 'triangle', v: 0.2 }] },
  encrypt: {
    gap: 1,
    notes: [
      { f: 110, to: 55, d: 0.8, type: 'sawtooth', v: 0.25 },
      { f: 1760, t: 0.05, d: 0.05, type: 'square', v: 0.08 },
      { f: 1760, t: 0.15, d: 0.05, type: 'square', v: 0.08 },
      { f: 1760, t: 0.25, d: 0.05, type: 'square', v: 0.08 },
    ],
  },
  won: {
    gap: 2,
    notes: [262, 330, 392, 523, 659, 784].map((f, i) => ({ f, t: i * 0.11, d: i === 5 ? 0.6 : 0.14, type: 'square', v: 0.16 })),
  },
  lost: {
    gap: 2,
    notes: [392, 330, 262, 196].map((f, i) => ({ f, to: f * 0.97, t: i * 0.22, d: i === 3 ? 0.7 : 0.24, type: 'triangle', v: 0.25 })),
  },
};

export class Sound {
  /** @param settings  { muted, volume } (read on every play, so changes apply at once) */
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.lastPlayed = {};
    /** Names of the sounds played, most recent last (for tests; capped). */
    this.played = [];
    this.unlocked = false;
    const unlock = () => {
      this.unlocked = true;
      this.ensure();
    };
    addEventListener('pointerdown', unlock, { once: true, capture: true });
    addEventListener('keydown', unlock, { once: true, capture: true });
  }

  /** Creates the AudioContext (after a user gesture, and only when not muted). */
  ensure() {
    if (this.ctx || this.settings.muted || !this.unlocked) return this.ctx;
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return null;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  play(name) {
    const sound = SOUNDS[name];
    if (!sound || this.settings.muted) return false;
    const now = performance.now() / 1000;
    if (now - (this.lastPlayed[name] ?? -1e9) < sound.gap) return false;
    this.lastPlayed[name] = now;
    this.played.push(name);
    if (this.played.length > 50) this.played.shift();
    const ctx = this.ensure();
    if (!ctx) return true;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.master.gain.value = this.settings.volume;
    const t0 = ctx.currentTime + 0.01;
    for (const n of sound.notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      const start = t0 + (n.t ?? 0);
      const end = start + n.d;
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.f, start);
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, end);
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(n.v ?? 0.2, start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(env).connect(this.master);
      osc.start(start);
      osc.stop(end + 0.02);
    }
    return true;
  }

  setMuted(muted) {
    this.settings.muted = muted;
    if (muted) this.ctx?.suspend().catch(() => {});
    else if (this.ctx) this.ctx.resume().catch(() => {});
    else this.ensure();
  }
}
