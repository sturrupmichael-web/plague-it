// The always-visible game UI: the top bar (clock, speed, points) and the bottom bar
// (Spread / Noise / Impact, the world totals bar, the Evolution button), plus a banner
// for prompts and short toasts.

import { $, setText, fmt } from './dom.js';
import { STAT_KEYS } from '../sim/stats.js';

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
      setText(this.stats[k].value, v);
    }
    const t = s.totals;
    setText(this.totals.healthy, fmt(t.healthy));
    setText(this.totals.infected, fmt(t.infected));
    setText(this.totals.remediated, fmt(t.remediated));
    this.totals.barInfected.style.width = `${(t.infected / t.devices) * 100}%`;
    this.totals.barRemediated.style.width = `${(t.remediated / t.devices) * 100}%`;
    for (const b of document.querySelectorAll('#speed [data-speed]')) {
      b.classList.toggle('on', !game.paused && game.speed === Number(b.dataset.speed));
    }
    $('#pause').classList.toggle('on', game.paused);
    document.body.classList.toggle('paused', game.paused);
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
