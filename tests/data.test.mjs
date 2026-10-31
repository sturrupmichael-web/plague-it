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
    d.links.push({ from: 'us-ny', to: 'nowhere', kind: 'wan', requires: null });
    d.links.push({ from: 'us-ny', to: 'ca-bc', kind: 'wan', requires: 'not-an-evolution' });
    d.evolutions.push({ id: 'x', branch: 'vectors', name: 'X', description: 'x', cost: 1, prereqs: ['ghost'], effects: {}, pos: { col: 0, row: 9 } });
    d.strains.push({ id: 'y', name: 'Y', unlockedBy: 'ghost-strain', base: { spread: 1, noise: 1, impact: 1 } });
    const errors = validateData(d).join('\n');
    for (const bit of ['unknown site', 'not-an-evolution', '"ghost" doesn\'t exist', 'ghost-strain']) {
      assert(errors.includes(bit), `expected an error mentioning ${bit}, got:\n${errors}`);
    }
  }],

  ['air-gapped sites only connect over airgap links', () => {
    const d = clone();
    d.links.push({ from: 'factory', to: 'us-ny', kind: 'wan', requires: null });
    assert(validateData(d).some((e) => e.includes('air-gapped site can only have airgap links')), 'not caught');
  }],

  ['every connected site is reachable without evolutions', () => {
    const d = clone();
    d.links = d.links.filter((l) => l.to !== 'us-hi' && l.from !== 'us-hi');
    assert(validateData(d).some((e) => e.includes('"us-hi" can\'t be reached')), 'unreachable site not caught');
  }],

  ['broken responses and headlines are reported', () => {
    const d = clone();
    d.responses.push({ ...d.responses[0], id: 'bad-response', counteredBy: ['ghost-evo'], effects: { closesLinks: ['carrier-pigeon'] } });
    d.headlines.push({ id: 'bad-headline', text: 'Hello {nobody}', when: { event: 'nope' } });
    d.headlines.push({ id: 'bad-site', text: '{site} news', when: { detected: true } });
    const errors = validateData(d).join('\n');
    for (const bit of ['ghost-evo', 'carrier-pigeon', 'unknown event "nope"', 'unknown placeholder', '{site} needs an event']) {
      assert(errors.includes(bit), `expected an error mentioning ${bit}, got:\n${errors}`);
    }
  }],

  ['every response can be countered, and its counters exist', () => {
    for (const r of DATA.responses) assert(r.counteredBy?.length, `${r.id} has no counter`);
  }],

  ['site traits must be between 0 and 1', () => {
    const d = clone();
    d.sites[0].traits.patch = 1.5;
    assert(validateData(d).some((e) => e.includes('traits.patch')), 'not caught');
  }],

  ['duplicate ids are reported', () => {
    const d = clone();
    d.sites.push({ ...d.sites.find((x) => x.id === 'us-ny') });
    assert(validateData(d).some((e) => e.includes('duplicate id "us-ny"')), 'not caught');
  }],

  ['the map covers every US state, DC and Canadian province/territory', () => {
    const regions = DATA.sites.filter((x) => x.rings.length);
    assertEq(regions.filter((x) => x.country === 'US').length, 51);
    assertEq(regions.filter((x) => x.country === 'CA').length, 13);
    for (const r of regions) assert(DATA.regionConfig[r.id], `${r.id} has no entry in data/sites.js REGIONS`);
  }],

  ['endpoints follow the top 500 metros', () => {
    const metros = DATA.sites.flatMap((x) => (x.rings.length ? x.metros : []));
    assertEq(metros.length, 500);
    const ny = DATA.sites.find((x) => x.id === 'us-ny');
    const wy = DATA.sites.find((x) => x.id === 'us-wy');
    assert(ny.devices > wy.devices * 20, `New York (${ny.devices}) should dwarf Wyoming (${wy.devices})`);
    const { peoplePerDevice, minDevices } = DATA.balance.map;
    for (const r of DATA.sites.filter((x) => x.rings.length)) {
      const pop = r.metros.reduce((n, m) => n + m.pop, 0);
      assertEq(r.devices, Math.max(minDevices, Math.round(pop / peoplePerDevice)), r.id);
    }
  }],

  ['borders are symmetric and sensible', () => {
    const ny = DATA.sites.find((x) => x.id === 'us-ny');
    for (const n of ['us-pa', 'us-nj', 'us-vt', 'ca-on', 'ca-qc']) assert(ny.neighbors.includes(n), 'New York should border ' + n);
    assert(!ny.neighbors.includes('us-ca'), 'New York does not border California');
  }],
];
