// Data validation: everything in data/ is well-formed and every reference resolves.

import { assert, assertEq } from './harness.mjs';
import { DATA } from '../data/index.js';
import { validateData, findCycle } from '../src/validate.js';

const clone = () => structuredClone(DATA);

export const tests = [
  ['all game data is valid', () => {
    const errors = validateData(DATA);
    assert(errors.length === 0, 'data problems:\n  ' + errors.join('\n  '));
  }],

  ['the evolution tree has no cycles', () => {
    assertEq(findCycle(DATA.evolutions), null);
  }],

  ['a prerequisite cycle is caught', () => {
    const evos = [
      { id: 'a', prereqs: ['c'] },
      { id: 'b', prereqs: ['a'] },
      { id: 'c', prereqs: ['b'] },
    ];
    const cycle = findCycle(evos);
    assert(cycle && cycle.length === 4 && cycle[0] === cycle[3], 'cycle not found: ' + JSON.stringify(cycle));
  }],

  ['broken references are reported', () => {
    const d = clone();
    d.links.push({ from: 'hq', to: 'nowhere', kind: 'wan', requires: null });
    d.links.push({ from: 'hq', to: 'office-asia', kind: 'wan', requires: 'not-an-evolution' });
    d.evolutions.push({ id: 'x', branch: 'vectors', name: 'X', description: 'x', cost: 1, prereqs: ['ghost'], effects: {}, pos: { col: 0, row: 9 } });
    d.strains.push({ id: 'y', name: 'Y', unlockedBy: 'ghost-strain', base: { spread: 1, noise: 1, impact: 1 } });
    const errors = validateData(d).join('\n');
    for (const bit of ['unknown site', 'not-an-evolution', '"ghost" doesn\'t exist', 'ghost-strain']) {
      assert(errors.includes(bit), `expected an error mentioning ${bit}, got:\n${errors}`);
    }
  }],

  ['air-gapped sites only connect over airgap links', () => {
    const d = clone();
    d.links.push({ from: 'factory', to: 'hq', kind: 'wan', requires: null });
    assert(validateData(d).some((e) => e.includes('air-gapped site can only have airgap links')), 'not caught');
  }],

  ['every connected site is reachable without evolutions', () => {
    const d = clone();
    d.links = d.links.filter((l) => !(l.to === 'office-sydney' && l.requires === null) && !(l.from === 'office-sydney' && l.requires === null));
    assert(validateData(d).some((e) => e.includes('"office-sydney" can\'t be reached')), 'unreachable site not caught');
  }],

  ['site traits must be between 0 and 1', () => {
    const d = clone();
    d.sites[0].traits.patch = 1.5;
    assert(validateData(d).some((e) => e.includes('traits.patch')), 'not caught');
  }],

  ['duplicate ids are reported', () => {
    const d = clone();
    d.sites.push({ ...d.sites[0] });
    assert(validateData(d).some((e) => e.includes('duplicate id "hq"')), 'not caught');
  }],
];
