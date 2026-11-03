// The site panel: tap a state, province or facility to see its traits, its healthy /
// infected / remediated counts, its biggest metros and its links. Refreshed a few times a
// second while open.

import { $, el, setText, fmt } from './dom.js';
import { isCountered } from '../sim/defense.js';

const TRAITS = [
  ['patch', 'Patch level'],
  ['savvy', 'User savviness'],
  ['maturity', 'Security maturity'],
  ['connectivity', 'Connectivity'],
];
const COUNTRY = { US: 'United States', CA: 'Canada' };

const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export class SitePanel {
  constructor(game, { onClose }) {
    this.game = game;
    this.root = $('#site-panel');
    this.siteId = null;
    this.onClose = onClose;
    this.last = 0;
  }

  open(siteId) {
    // The world's copy of the data has the scenario's changes (traits, endpoint counts).
    const { world } = this.game;
    const data = world.data;
    const site = data.sites.find((s) => s.id === siteId);
    this.siteId = siteId;
    this.defenseKey = null;
    this.links = world.links.filter((l) => l.from === siteId || l.to === siteId);
    this.counts = {
      healthy: el('b', { class: 'healthy' }),
      infected: el('b', { class: 'infected' }),
      remediated: el('b', { class: 'remediated' }),
    };
    this.linksEl = el('p', { class: 'links' });
    const tagNames = site.tags.map((t) => data.tags[t]?.label ?? t).join(' · ');
    const metros = site.metros.filter((m) => m.pop > 0).slice(0, 4);
    this.root.replaceChildren(
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => this.close() }, '×'),
      el('div', { class: 'type' }, site.kind, ' · ', COUNTRY[site.country] ?? site.country, site.airGapped ? ' · air-gapped' : ''),
      el('h2', {}, site.name),
      el('div', { class: 'tags' }, tagNames),
      el('p', { class: 'blurb' }, site.blurb),
      el('div', { class: 'counts' },
        el('span', {}, this.counts.healthy, ' healthy'),
        el('span', {}, this.counts.infected, ' infected'),
        el('span', {}, this.counts.remediated, ' remediated')),
      el('div', { class: 'traits' }, TRAITS.map(([k, label]) =>
        el('div', { class: 'trait' }, el('span', {}, label),
          el('i', {}, el('b', { style: `width:${Math.round(site.traits[k] * 100)}%` }))))),
      metros.length
        ? el('p', { class: 'metros' }, `${site.metros.length} metro${site.metros.length > 1 ? 's' : ''}: `,
          metros.map((m) => `${m.name} ${compact(m.pop)}`).join(', '), site.metros.length > metros.length ? ', …' : '')
        : null,
      this.linksEl,
      (this.defensesEl = el('div', { class: 'defenses' })),
    );
    this.root.hidden = false;
    this.update(true);
  }

  close() {
    this.siteId = null;
    this.root.hidden = true;
    this.onClose?.();
  }

  update(force = false) {
    if (!this.siteId) return;
    const now = performance.now();
    if (!force && now - this.last < 200) return;
    this.last = now;
    const st = this.game.state?.sites.find((s) => s.id === this.siteId);
    const site = this.game.world.data.sites.find((s) => s.id === this.siteId);
    setText(this.counts.healthy, fmt(st ? st.healthy : site.devices));
    setText(this.counts.infected, fmt(st ? st.infected : 0));
    setText(this.counts.remediated, fmt(st ? st.remediated : 0));
    if (st?.pending) {
      setText(this.counts.healthy, fmt(site.devices));
      setText(this.linksEl, `Joins the company's network on day ${this.game.world.merger.tick / 24}.`);
      return;
    }
    const evolved = this.game.state?.evolved ?? [];
    const borders = this.links.filter((l) => l.kind === 'border').length;
    const others = this.links.filter((l) => l.kind !== 'border');
    const open = others.filter((l) => !l.requires || evolved.includes(l.requires)).length;
    const parts = [];
    if (borders) parts.push(`${borders} border${borders > 1 ? 's' : ''}`);
    if (others.length) parts.push(`${others.length} network link${others.length > 1 ? 's' : ''} (${open} open to you)`);
    setText(this.linksEl, parts.join(', ') + '.');
    this.updateDefenses();
  }

  updateDefenses() {
    const s = this.game.state;
    const { world } = this.game;
    const here = (s?.defense.active ?? []).filter((a) => a.site === this.siteId || a.site === null);
    const key = here.map((a) => a.id + (isCountered(s, world.responses.get(a.id)) ? '*' : '')).join() + (s?.defense.irFirmAt ?? '');
    if (key === this.defenseKey) return;
    this.defenseKey = key;
    if (!s || s.detectedAt === null) {
      this.defensesEl.replaceChildren(el('p', { class: 'none' }, 'Active defenses: none. SecOps hasn\'t noticed you yet.'));
      return;
    }
    const items = here.map((a) => {
      const r = world.responses.get(a.id);
      const left = a.until !== null ? ` · ${Math.max(1, Math.ceil((a.until - s.tick) / 24))} days left` : '';
      return el('li', { class: isCountered(s, r) ? 'countered' : '' },
        el('b', {}, r.name), a.site === null ? ' · company-wide' : left, isCountered(s, r) ? ' · countered' : '');
    });
    if (s.defense.irFirmAt !== null) items.push(el('li', {}, el('b', {}, 'Incident response firm'), ' · company-wide'));
    this.defensesEl.replaceChildren(
      el('h3', {}, 'Active defenses'),
      items.length ? el('ul', {}, items) : el('p', { class: 'none' }, 'None here yet.'),
    );
  }
}
