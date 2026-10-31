// The always-visible game UI: the top bar (clock, speed, points) and the bottom bar
// (Spread / Noise / Impact, the world totals bar, the Evolution button), plus a banner
// for prompts and short toasts.

import { $, el, setText, fmt } from './dom.js';
import { STAT_KEYS } from '../sim/stats.js';
import { evolveBlocker } from '../sim/sim.js';
import { isCountered } from '../sim/defense.js';

export class Hud {
  constructor(game, { onSpeed, onPause }) {
    this.game = game;
    this.clock = $('#clock');
    this.points = $('#points-value');
    this.evolvePoints = $('#evolve-points');
    this.banner = $('#banner');
    this.toastEl = $('#toast');
    this.stats = Object.fromEntries(
      STAT_KEYS.map((k) => [k, { bar: $(`#stat-${k} .fill`), value: $(`#stat-${k} .value`) }]),
    );
    this.totals = {
      healthy: $('#tot-healthy'),
      infected: $('#tot-infected'),
      remediated: $('#tot-remediated'),
      barInfected: $('#totals-bar .infected'),
      barRemediated: $('#totals-bar .remediated'),
    };
    for (const b of document.querySelectorAll('#speed [data-speed]')) {
      b.addEventListener('click', () => onSpeed(Number(b.dataset.speed)));
    }
    $('#pause').addEventListener('click', () => onPause());
    this.remediation = { root: $('#remediation'), bar: $('#remediation .fill'), value: $('#remediation .value') };
    this.evolveBtn = $('#evolve');
    this.defenses = $('#defenses');
    this.defenseKey = null;
    this.toastTimer = 0;
  }

  update() {
    const { game } = this;
    const s = game.state;
    if (!s) return;
    const hours = s.tick * game.data.balance.hoursPerTick;
    setText(this.clock, `Day ${Math.floor(hours / 24) + 1} · ${String(hours % 24).padStart(2, '0')}:00`);
    setText(this.points, fmt(s.points));
    setText(this.evolvePoints, fmt(s.points));
    const max = game.data.balance.statMax;
    for (const k of STAT_KEYS) {
      const v = s.stats[k];
      this.stats[k].bar.style.width = `${(v / max) * 100}%`;
      setText(this.stats[k].value, Number.isInteger(v) ? v : v.toFixed(1));
    }
    const t = s.totals;
    setText(this.totals.healthy, fmt(t.healthy));
    setText(this.totals.infected, fmt(t.infected));
    setText(this.totals.remediated, fmt(t.remediated));
    this.totals.barInfected.style.width = `${(t.infected / t.devices) * 100}%`;
    this.totals.barRemediated.style.width = `${(t.remediated / t.devices) * 100}%`;
    const detected = s.detectedAt !== null;
    if (this.remediation.root.hidden === detected) this.remediation.root.hidden = !detected;
    if (detected) {
      this.remediation.bar.style.width = `${s.remediation}%`;
      setText(this.remediation.value, `${Math.floor(s.remediation)}%`);
    }
    this.updateDefenses(s);
    const playing = s.status === 'running' || s.status === 'picking';
    this.evolveBtn.disabled = !playing;
    const affordable = playing && game.data.evolutions.some((e) => !s.evolved.includes(e.id) && evolveBlocker(s, game.world, e.id) === null);
    this.evolveBtn.classList.toggle('ready', affordable);
    for (const b of document.querySelectorAll('#speed [data-speed]')) {
      b.classList.toggle('on', !game.paused && game.speed === Number(b.dataset.speed));
    }
    $('#pause').classList.toggle('on', game.paused);
    document.body.classList.toggle('paused', game.paused);
  }

  /** The chips at the top left: SecOps responses in force, and the IR firm. */
  updateDefenses(s) {
    const { world } = this.game;
    const active = s.defense.active;
    const key = active.map((a) => a.id + a.site + (isCountered(s, world.responses.get(a.id)) ? '*' : '')).join() + s.defense.irFirmAt;
    if (key === this.defenseKey) return;
    this.defenseKey = key;
    const chips = [];
    if (s.defense.irFirmAt !== null) chips.push(el('li', { class: 'ir' }, 'IR firm hired'));
    // Newest first; site responses show their site.
    for (const a of [...active].reverse()) {
      const r = world.responses.get(a.id);
      const site = a.site ? world.data.sites[world.siteIndex.get(a.site)].name : null;
      chips.push(el('li', { class: isCountered(s, r) ? 'countered' : '', title: r.description },
        r.name, site ? el('span', {}, ` · ${site}`) : null));
    }
    this.defenses.replaceChildren(...chips);
    this.defenses.hidden = chips.length === 0;
  }

  showBanner(text) {
    setText(this.banner, text);
    this.banner.hidden = !text;
  }

  toast(text, ms = 2600) {
    setText(this.toastEl, text);
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
