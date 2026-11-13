// The debug panel, for playtesting and balancing: toggle it with the ` (backquote) key,
// or open the page with ?debug=1 to get a 🐞 button (for phones). It shows live
// numbers the HUD hides, and has cheats: Exploit Points, time skips, forcing detection,
// firing any SecOps response, ending the game, unlocking every strain and restarting
// with a chosen seed. Using a cheat marks the game (state.cheated) so its score isn't
// saved.

import { $, el, setText, fmt } from './dom.js';
import { advance, detectNow, endNow } from '../sim/sim.js';
import { applyResponse } from '../sim/defense.js';

export class DebugPanel {
  /**
   * @param hooks { unlockAll(), restart(seed) }
   */
  constructor(game, hooks) {
    this.game = game;
    this.hooks = hooks;
    this.root = $('#debug');
    this.fps = 0;
    this.frames = 0;
    this.fpsAt = performance.now();
    const btn = (label, id, fn) => el('button', { type: 'button', id, onclick: () => fn() }, label);
    this.live = el('pre', { id: 'debug-live' });
    this.responseSel = el('select', { id: 'debug-response', 'aria-label': 'SecOps response' });
    this.siteSel = el('select', { id: 'debug-site', 'aria-label': 'Target site' });
    this.seedInput = el('input', { id: 'debug-seed', type: 'text', placeholder: 'seed', autocomplete: 'off', spellcheck: 'false' });
    this.root.replaceChildren(
      el('div', { class: 'debug-head' }, el('b', {}, 'Debug'), btn('×', 'debug-close', () => this.toggle(false))),
      this.live,
      el('div', { class: 'debug-row' },
        btn('+25 ⬢', 'debug-points', () => this.cheat((s) => (s.points += 25))),
        btn('+250 ⬢', 'debug-points-big', () => this.cheat((s) => (s.points += 250)))),
      el('div', { class: 'debug-row' },
        btn('Skip 1 day', 'debug-skip-day', () => this.cheat((s, w) => advance(s, w, 24))),
        btn('Skip 10 days', 'debug-skip-10', () => this.cheat((s, w) => advance(s, w, 240)))),
      el('div', { class: 'debug-row' },
        btn('Detect now', 'debug-detect', () => this.cheat((s, w) => detectNow(s, w))),
        btn('Win', 'debug-win', () => this.cheat((s, w) => endNow(s, w, 'won'))),
        btn('Lose', 'debug-lose', () => this.cheat((s, w) => endNow(s, w, 'lost')))),
      el('div', { class: 'debug-row' }, this.responseSel, this.siteSel, btn('Fire', 'debug-fire', () => this.fire())),
      el('div', { class: 'debug-row' }, this.seedInput, btn('Restart', 'debug-restart', () => hooks.restart(this.seedInput.value.trim()))),
      el('div', { class: 'debug-row' }, btn('Unlock every strain', 'debug-unlock', () => hooks.unlockAll())),
    );
  }

  get isOpen() {
    return !this.root.hidden;
  }

  toggle(open = !this.isOpen) {
    this.root.hidden = !open;
    if (open) this.refreshLists();
  }

  /** Runs a cheat on the current game (if one is running) and marks it. */
  cheat(fn) {
    const { state, world } = this.game;
    if (!state || state.status === 'won' || state.status === 'lost') return;
    state.cheated = true;
    fn(state, world);
  }

  fire() {
    const r = this.game.world.responses.get(this.responseSel.value);
    if (!r) return;
    this.cheat((s, w) => {
      if (s.status !== 'running') return;
      applyResponse(s, w, r, r.scope === 'site' ? this.siteSel.value || null : null);
    });
  }

  refreshLists() {
    const { world, state } = this.game;
    const key = world.scenario.id;
    if (this.listsFor !== key) {
      this.listsFor = key;
      this.responseSel.replaceChildren(...world.data.responses.map((r) => el('option', { value: r.id }, `${r.name}${r.scope === 'site' ? ' (site)' : ''}`)));
      this.siteSel.replaceChildren(...world.data.sites.map((s) => el('option', { value: s.id }, s.name)));
    }
    // Default the site to the busiest one.
    if (state?.sites.length) {
      const busiest = state.sites.reduce((a, b) => (b.infected > a.infected ? b : a));
      if (busiest.infected > 0) this.siteSel.value = busiest.id;
    }
    if (state && !this.seedInput.value) this.seedInput.value = state.seed;
  }

  /** Call every frame. */
  update(now = performance.now()) {
    this.frames++;
    if (now - this.fpsAt >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsAt));
      this.frames = 0;
      this.fpsAt = now;
    }
    if (!this.isOpen) return;
    const s = this.game.state;
    if (!s) return setText(this.live, `fps ${this.fps}\nno game`);
    const t = s.totals;
    const d = s.defense;
    const th = this.game.world.balance.detection.threshold;
    setText(this.live, [
      `fps ${this.fps}   seed ${s.seed}${s.cheated ? '   (cheated)' : ''}`,
      `tick ${s.tick}  day ${Math.floor(s.tick / 24) + 1}  ${s.status}${s.outcome ? ' ' + s.outcome : ''}`,
      `${s.strainId} · ${s.difficultyId} · ${s.scenarioId}`,
      `infected ${fmt(t.infected)} / ${fmt(t.devices)} (${((t.infected / (t.devices || 1)) * 100).toFixed(1)}%)`,
      `remediated ${fmt(t.remediated)}  encrypted ${fmt(t.encrypted)}`,
      `suspicion ${s.detectedAt === null ? `${s.suspicion.toFixed(1)} / ${th}` : `detected day ${Math.floor(s.detectedAt / 24) + 1}`}`,
      `remediation ${s.remediation.toFixed(2)}%`,
      `secops budget ${d.budget.toFixed(0)}  funded ${d.funded.toFixed(0)}  alert ${d.alert.toFixed(2)}`,
      `active ${d.active.map((a) => a.id + (a.site ? '@' + a.site : '')).join(', ') || 'none'}`,
      `points ${s.points}  earned ${s.pointsEarned}  evolutions ${s.evolved.length}`,
    ].join('\n'));
  }
}
