// The site panel: tap a site to see its traits, its healthy / infected / remediated
// counts and its links. Refreshed a few times a second while open.

import { $, el, setText, fmt } from './dom.js';

const TRAITS = [
  ['patch', 'Patch level'],
  ['savvy', 'User savviness'],
  ['maturity', 'Security maturity'],
  ['connectivity', 'Connectivity'],
];
const TYPES = {
  hq: 'Headquarters', office: 'Regional office', warehouse: 'Warehouse', retail: 'Retail branch',
  datacenter: 'Data center', cloud: 'Cloud region', factory: 'Factory floor',
};

export class SitePanel {
  constructor(game, { onClose }) {
    this.game = game;
    this.root = $('#site-panel');
    this.siteId = null;
    this.onClose = onClose;
    this.last = 0;
  }

  open(siteId) {
    const { data } = this.game;
    const site = data.sites.find((s) => s.id === siteId);
    this.siteId = siteId;
    const links = data.links.filter((l) => l.from === siteId || l.to === siteId);
    this.counts = {
      healthy: el('b', { class: 'healthy' }),
      infected: el('b', { class: 'infected' }),
      remediated: el('b', { class: 'remediated' }),
    };
    this.linksEl = el('p', { class: 'links' });
    this.links = links;
    this.root.replaceChildren(
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => this.close() }, '×'),
      el('div', { class: 'type' }, TYPES[site.type] ?? site.type, site.airGapped ? ' · air-gapped' : ''),
      el('h2', {}, site.name),
      el('p', { class: 'blurb' }, site.blurb),
      el('div', { class: 'counts' },
        el('span', {}, this.counts.healthy, ' healthy'),
        el('span', {}, this.counts.infected, ' infected'),
        el('span', {}, this.counts.remediated, ' remediated')),
      el('div', { class: 'traits' }, TRAITS.map(([k, label]) =>
        el('div', { class: 'trait' }, el('span', {}, label),
          el('i', {}, el('b', { style: `width:${Math.round(site.traits[k] * 100)}%` }))))),
      this.linksEl,
      el('p', { class: 'defenses' }, 'Active defenses: none yet.'),
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
    const site = this.game.data.sites.find((s) => s.id === this.siteId);
    setText(this.counts.healthy, fmt(st ? st.healthy : site.devices));
    setText(this.counts.infected, fmt(st ? st.infected : 0));
    setText(this.counts.remediated, fmt(st ? st.remediated : 0));
    const evolved = this.game.state?.evolved ?? [];
    const open = this.links.filter((l) => !l.requires || evolved.includes(l.requires)).length;
    setText(this.linksEl, `${this.links.length} network links, ${open} open to you, ${this.links.length - open} locked.`);
  }
}
