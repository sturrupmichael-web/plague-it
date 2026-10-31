// The evolution screen: three tabs (Vectors, Payloads, Abilities), each a tree of hex
// nodes joined by prerequisite lines, and a panel with the selected node's cost, effects
// and the Evolve / Devolve buttons. The game pauses while it's open.

import { $, el, setText } from './dom.js';
import { evolve, devolve, evolveCost, evolveBlocker, devolveRefund, dependents } from '../sim/sim.js';

const BRANCHES = [
  ['vectors', 'Vectors', 'How you spread'],
  ['payloads', 'Payloads', 'What you do to machines'],
  ['abilities', 'Abilities', 'How you survive'],
];
const SITE_TYPE_NAMES = {
  hq: 'headquarters', office: 'offices', warehouse: 'warehouses', retail: 'retail branches',
  datacenter: 'data centers', cloud: 'cloud regions', factory: 'factories',
};
const LINK_NAMES = { lan: 'LAN', wan: 'WAN', vpn: 'VPN', cloud: 'cloud sync', email: 'email', airgap: 'air-gap' };

// Node layout in CSS pixels.
const COL_W = 100;
const ROW_H = 92;
const PAD = 56;

const pct = (x) => `${Math.round(x * 100)}%`;
const signed = (x) => (x > 0 ? `+${x}` : `${x}`.replace('-', '−'));

/** Human-readable effect lines for an evolution. Exported for tests. */
export function describeEffects(evo, data) {
  const fx = evo.effects ?? {};
  const lines = [];
  for (const [k, label] of [['spread', 'Spread'], ['noise', 'Noise'], ['impact', 'Impact']]) {
    if (fx[k]) lines.push({ text: `${label} ${signed(fx[k])}`, good: k === 'spread' ? fx[k] > 0 : fx[k] < 0 });
  }
  for (const [type, x] of Object.entries(fx.siteTypeSpread ?? {})) {
    lines.push({ text: `+${pct(x)} spread in ${SITE_TYPE_NAMES[type] ?? type}`, good: true });
  }
  if (fx.remediationResist) lines.push({ text: `Remediation ${pct(fx.remediationResist)} slower`, good: true });
  if (fx.cleanResist) lines.push({ text: `Machines ${pct(fx.cleanResist)} harder to clean`, good: true });
  if (fx.reinfect) lines.push({ text: `Cleaned machines ${pct(fx.reinfect)} easier to retake`, good: true });
  if (fx.pointsPerDay) lines.push({ text: `Up to +${fx.pointsPerDay} Exploit Points a day`, good: true });
  if (fx.jump) lines.push({ text: 'Jumps straight to random sites', good: true });
  const links = data.links.filter((l) => l.requires === evo.id);
  if (links.length) {
    const kinds = [...new Set(links.map((l) => LINK_NAMES[l.kind] ?? l.kind))].join(' / ');
    lines.push({ text: `Opens ${links.length} ${kinds} link${links.length > 1 ? 's' : ''}`, good: true });
  }
  return lines;
}

export class EvolutionScreen {
  constructor(game, { onChange } = {}) {
    this.game = game;
    this.onChange = onChange;
    this.root = $('#evolution');
    this.branch = 'vectors';
    this.selected = null;
    this.wasPaused = false;
    this.justUnlocked = null;
  }

  get isOpen() {
    return !this.root.hidden;
  }

  open(branch = this.branch) {
    if (!this.game.state) return;
    this.wasPaused = this.game.paused;
    this.game.paused = true;
    this.branch = branch;
    this.root.hidden = false;
    this.render();
  }

  close() {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.game.paused = this.wasPaused;
    this.onChange?.();
  }

  render() {
    const { game } = this;
    const { state, data, world } = game;
    const list = data.evolutions.filter((e) => e.branch === this.branch);
    if (!this.selected || !list.some((e) => e.id === this.selected)) this.selected = list[0]?.id ?? null;

    const tabs = el('div', { class: 'evo-tabs', role: 'tablist' }, BRANCHES.map(([id, name]) => {
      const owned = data.evolutions.filter((e) => e.branch === id && state.evolved.includes(e.id)).length;
      const total = data.evolutions.filter((e) => e.branch === id).length;
      return el('button', {
        type: 'button', role: 'tab', class: 'evo-tab' + (id === this.branch ? ' on' : ''), 'data-branch': id,
        'aria-selected': String(id === this.branch),
        onclick: () => { this.branch = id; this.selected = null; this.render(); },
      }, name, el('small', {}, `${owned}/${total}`));
    }));

    // The tree: SVG lines underneath, hex buttons on top.
    const cols = Math.max(...list.map((e) => e.pos.col)) + 1;
    const rows = Math.max(...list.map((e) => e.pos.row)) + 1;
    const w = PAD * 2 + (cols - 1) * COL_W;
    const h = PAD * 2 + (rows - 1) * ROW_H;
    const at = (e) => [PAD + e.pos.col * COL_W, PAD + e.pos.row * ROW_H];
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('class', 'evo-lines');
    for (const e of list) {
      for (const p of e.prereqs) {
        const pe = world.evolutions.get(p);
        const [x1, y1] = at(pe);
        const [x2, y2] = at(e);
        const line = document.createElementNS(svgNS, 'line');
        Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => line.setAttribute(k, v));
        const lit = state.evolved.includes(p);
        line.setAttribute('class', (lit ? 'lit' : '') + (lit && state.evolved.includes(e.id) ? ' owned' : '') + (this.justUnlocked === e.id ? ' pulse' : ''));
        svg.append(line);
      }
    }
    const nodes = list.map((e) => {
      const [x, y] = at(e);
      const blocker = evolveBlocker(state, world, e.id);
      const cls = ['evo-node', blocker ?? 'available', e.id === this.selected ? 'selected' : '', e.id === this.justUnlocked ? 'unlocked' : '']
        .filter(Boolean).join(' ');
      return el('button', {
        type: 'button', class: cls, 'data-evo': e.id, style: `left:${x}px;top:${y}px`, title: e.name,
        onclick: () => { this.selected = e.id; this.render(); },
      }, el('span', { class: 'evo-label' }, e.name.replaceAll('-', '\u2011')));
    });
    const tree = el('div', { class: 'evo-tree', style: `width:${w}px;height:${h}px` }, svg, nodes);

    this.root.replaceChildren(el('div', { class: 'evo-panel', role: 'dialog', 'aria-label': 'Evolution' },
      el('header', { class: 'evo-head' },
        el('h2', {}, 'Evolution'),
        el('div', { class: 'evo-points' }, el('span', { class: 'hex' }, '⬢'), ' ', el('span', { id: 'evo-points' }, String(state.points)), ' Exploit Points'),
        el('button', { type: 'button', class: 'evo-close', 'aria-label': 'Close', onclick: () => this.close() }, '×')),
      tabs,
      el('div', { class: 'evo-body' },
        el('div', { class: 'evo-scroll' }, tree),
        this.renderDetail()),
    ));
    this.justUnlocked = null;
  }

  renderDetail() {
    const { state, data, world } = this.game;
    const e = world.evolutions.get(this.selected);
    if (!e) return el('aside', { class: 'evo-detail' });
    const owned = state.evolved.includes(e.id);
    const blocker = evolveBlocker(state, world, e.id);
    const effects = describeEffects(e, data);
    const prereqNames = e.prereqs.map((p) => world.evolutions.get(p).name);
    let action;
    if (owned) {
      const deps = dependents(state, world, e.id);
      action = el('button', {
        type: 'button', id: 'devolve', class: 'secondary', disabled: deps.length > 0 || state.status !== 'running' && state.status !== 'picking',
        onclick: () => this.doDevolve(e.id),
      }, `Devolve (+${devolveRefund(state, world, e.id)})`);
      if (deps.length) action = [action, el('p', { class: 'evo-note' }, `Needed by ${deps.map((d) => world.evolutions.get(d).name).join(', ')}.`)];
    } else {
      const cost = evolveCost(state, world, e.id);
      action = [
        el('button', { type: 'button', id: 'evolve-buy', class: 'primary', disabled: blocker !== null, onclick: () => this.doEvolve(e.id) },
          'Evolve ', el('span', { class: 'hex' }, '⬢'), ` ${cost}`),
        blocker === 'locked' ? el('p', { class: 'evo-note' }, `Requires ${prereqNames.join(' and ')}.`) : null,
        blocker === 'points' ? el('p', { class: 'evo-note' }, `You need ${cost - state.points} more Exploit Points.`) : null,
      ];
    }
    return el('aside', { class: 'evo-detail' },
      el('div', { class: 'evo-branch' }, BRANCHES.find(([id]) => id === e.branch)[1], owned ? ' · owned' : ''),
      el('h3', {}, e.name),
      el('p', { class: 'evo-desc' }, e.description),
      el('ul', { class: 'evo-effects' }, effects.map((l) => el('li', { class: l.good ? 'good' : 'bad' }, l.text))),
      action,
    );
  }

  doEvolve(id) {
    if (evolve(this.game.state, this.game.world, id)) {
      this.justUnlocked = id;
      this.render();
      this.onChange?.();
    }
  }

  doDevolve(id) {
    if (devolve(this.game.state, this.game.world, id)) {
      this.render();
      this.onChange?.();
    }
  }

  /** Keeps the points counter fresh (bubbles can't be popped while open, but income is paused too). */
  update() {
    if (!this.isOpen) return;
    const p = $('#evo-points');
    if (p) setText(p, this.game.state.points);
  }
}
