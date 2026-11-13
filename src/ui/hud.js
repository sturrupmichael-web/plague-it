// The always-visible game UI: the top bar (clock, speed, points) and the bottom bar
// (Spread / Noise / Impact, the world totals bar, the Evolution button), plus a banner
// for prompts and short toasts.

import { $, el, setText, fmt } from './dom.js';
import { STAT_KEYS } from '../sim/stats.js';
import { evolveBlocker } from '../sim/sim.js';
import { isCountered } from '../sim/defense.js';

export class Hud {
  constructor(game, { onSpeed, onPause, onEncrypt }) {
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
      barEncrypted: $('#totals-bar .encrypted'),
      encrypted: $('#tot-encrypted'),
      legendEncrypted: $('#legend-encrypted'),
      barRemediated: $('#totals-bar .remediated'),
    };
    for (const b of document.querySelectorAll('#speed [data-speed]')) {
      b.addEventListener('click', () => onSpeed(Number(b.dataset.speed)));
    }
    $('#pause').addEventListener('click', () => onPause());
    this.remediation = { root: $('#remediation'), bar: $('#remediation .fill'), value: $('#remediation .value') };
    this.evolveBtn = $('#evolve');
    this.encryptBtn = $('#encrypt');
    this.countdown = $('#countdown');
    // Encrypt takes two taps: arm, then confirm (it can't be undone).
    this.encryptBtn.addEventListener('click', () => {
      if (!this.encryptBtn.classList.contains('armed')) {
        this.encryptBtn.classList.add('armed');
        this.encryptBtn.textContent = 'Sure? Tap again';
        clearTimeout(this.armTimer);
        this.armTimer = setTimeout(() => this.disarm(), 3000);
        return;
      }
      this.disarm();
      onEncrypt?.();
    });
    this.defenses = $('#defenses');
    this.defenseKey = null;
    this.toastTimer = 0;
  }

  update() {
    const { game } = this;
    const s = game.state;
    if (!s) return this.clear();
    this.cleared = false;
    const hours = s.tick * game.data.balance.hoursPerTick;
    setText(this.clock, `Day ${Math.floor(hours / 24) + 1} · ${String(hours % 24).padStart(2, '0')}:00`);
    setText(this.points, fmt(s.points));
    // A little bump when points come in.
    if (this.lastPoints !== undefined && s.points > this.lastPoints) {
      const p = this.points.parentElement;
      p.classList.remove('bump');
      void p.offsetWidth; // restart the CSS animation
      p.classList.add('bump');
    }
    this.lastPoints = s.points;
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
    this.totals.barInfected.style.width = `${((t.infected - t.encrypted) / t.devices) * 100}%`;
    this.totals.barEncrypted.style.width = `${(t.encrypted / t.devices) * 100}%`;
    const ransom = !!game.world.strains.get(s.strainId).special?.ransom;
    if (this.totals.legendEncrypted.hidden === ransom) this.totals.legendEncrypted.hidden = !ransom;
    if (ransom) setText(this.totals.encrypted, fmt(t.encrypted));
    if (this.encryptBtn.hidden === ransom) this.encryptBtn.hidden = !ransom;
    if (ransom) {
      const done = s.ransomAt !== null;
      this.encryptBtn.disabled = done || s.status !== 'running';
      if (done && this.encryptBtn.textContent !== 'Encrypting') this.encryptBtn.textContent = 'Encrypting';
    }
    this.updateCountdown(s);
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

  /** Back to a blank HUD (no game: the title and setup screens). */
  clear() {
    if (this.cleared) return;
    this.cleared = true;
    setText(this.clock, 'Day 1 · 00:00');
    setText(this.points, '0');
    setText(this.evolvePoints, '0');
    this.lastPoints = undefined;
    for (const k of STAT_KEYS) {
      this.stats[k].bar.style.width = '0%';
      setText(this.stats[k].value, '0');
    }
    for (const k of ['healthy', 'infected', 'remediated', 'encrypted']) setText(this.totals[k], '0');
    for (const k of ['barInfected', 'barEncrypted', 'barRemediated']) this.totals[k].style.width = '0%';
    this.totals.legendEncrypted.hidden = true;
    this.encryptBtn.hidden = true;
    this.disarm();
    this.remediation.root.hidden = true;
    this.countdown.hidden = true;
    this.defenses.replaceChildren();
    this.defenses.hidden = true;
    this.defenseKey = null;
    this.evolveBtn.disabled = true;
    this.evolveBtn.classList.remove('ready');
  }

  disarm() {
    clearTimeout(this.armTimer);
    this.encryptBtn.classList.remove('armed');
    if (this.game.state?.ransomAt == null) this.encryptBtn.textContent = 'Encrypt';
  }

  /** Top bar: days until the merger closes or the global patch lands. */
  updateCountdown(s) {
    const w = this.game.world;
    let text = '';
    const days = (tick) => Math.max(0, Math.ceil((tick - s.tick) / 24));
    if (w.merger && !s.merged) text = `Merger in ${days(w.merger.tick)}d`;
    else if (w.patchDeadline !== null && s.status === 'running') text = `Patch lands in ${days(w.patchDeadline)}d`;
    if (this.countdown.hidden === !!text) this.countdown.hidden = !text;
    setText(this.countdown, text);
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
