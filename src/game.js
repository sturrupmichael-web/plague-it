// The game controller: owns the current game state and runs the simulation on a fixed
// timestep, decoupled from rendering. Each frame, real time (× speed) is added to an
// accumulator and whole ticks are stepped; drawing happens separately at screen rate.

import { createWorld } from './sim/world.js';
import { createState } from './sim/state.js';
import { step, startInfection, collectBubble, drainEvents, triggerEncryption } from './sim/sim.js';

/** Never run more than this many ticks in one frame (e.g. after the tab was hidden). */
const MAX_TICKS_PER_FRAME = 30;

export class Game {
  constructor(data) {
    this.data = data;
    /** One world per scenario, built on first use. */
    this.worlds = new Map();
    this.world = this.worldFor('standard');
    this.state = null;
    this.speed = 1;
    this.paused = false;
    this.acc = 0;
  }

  worldFor(scenarioId) {
    if (!this.worlds.has(scenarioId)) this.worlds.set(scenarioId, createWorld(this.data, scenarioId));
    return this.worlds.get(scenarioId);
  }

  /** @param opts  { strainId, difficultyId, scenarioId, seed, strainName } */
  newGame({ scenarioId = 'standard', ...opts } = {}) {
    this.world = this.worldFor(scenarioId);
    this.state = createState(this.world, opts);
    this.acc = 0;
    this.paused = false;
    return this.state;
  }

  startInfection(siteId) {
    return !!this.state && startInfection(this.state, this.world, siteId);
  }

  collectBubble(id) {
    return this.state ? collectBubble(this.state, id) : 0;
  }

  triggerEncryption() {
    return !!this.state && triggerEncryption(this.state, this.world);
  }

  drainEvents() {
    return this.state ? drainEvents(this.state) : [];
  }

  get running() {
    return this.state?.status === 'running';
  }

  /** Advances by `dt` real seconds. Returns how many ticks ran. */
  update(dt) {
    if (!this.running || this.paused) return 0;
    this.acc += Math.min(dt, 0.25) * this.data.balance.ticksPerSecond * this.speed;
    let n = 0;
    // (The tiny epsilon stops float rounding, e.g. 60 × 8/60 = 7.9999…, from losing a tick.)
    while (this.acc >= 1 - 1e-9 && n < MAX_TICKS_PER_FRAME) {
      step(this.state, this.world);
      this.acc -= 1;
      n++;
    }
    if (this.acc >= 1) this.acc = 0;
    if (this.acc < 0) this.acc = 0; // Fell behind: drop the backlog instead of spiralling.
    return n;
  }

  /** Runs `ticks` ticks immediately (tests and the debug panel). */
  advance(ticks) {
    for (let i = 0; i < ticks && this.running; i++) step(this.state, this.world);
  }
}
