// The static side of a game: lookups and derived numbers computed once from data/, so
// the per-tick code stays simple. Nothing here changes during a game (defender responses
// modify site traits through the game state's `dfx`, not through this).
//
// A scenario (data/scenarios.js) changes the world: createWorld(data, scenarioId) applies
// its site and balance changes to a copy of the data, so the engine just reads the result.

export function createWorld(baseData, scenarioId = 'standard') {
  const scenario = (baseData.scenarios ?? []).find((x) => x.id === scenarioId);
  if (!scenario && scenarioId !== 'standard') throw new Error(`Unknown scenario: ${scenarioId}`);
  const data = scenario ? applyScenario(baseData, scenario) : baseData;
  const { balance } = data;
  const siteIndex = new Map(data.sites.map((s, i) => [s.id, i]));
  const w = balance.spread.traitWeights;
  const clamp = (v) => Math.max(0, Math.min(0.98, v));
  /** How easily machines with these traits get infected (plus optional { patch, savvy, maturity } bonuses). */
  const susceptibilityOf = (t, add = null) =>
    (1 - clamp(t.patch + (add?.patch ?? 0)) * w.patch) *
    (1 - clamp(t.savvy + (add?.savvy ?? 0)) * w.savvy) *
    (1 - clamp(t.maturity + (add?.maturity ?? 0)) * w.maturity);
  const susceptibility = data.sites.map((s) => susceptibilityOf(s.traits));
  // Borders are links too (always open), listed after the data links.
  const borders = [];
  for (const s of data.sites) {
    for (const n of s.neighbors ?? []) if (s.id < n) borders.push({ from: s.id, to: n, kind: 'border', requires: null });
  }
  const links = [...data.links, ...borders].map((l, i) => ({
    ...l,
    index: i,
    a: siteIndex.get(l.from),
    b: siteIndex.get(l.to),
    weight: balance.linkKinds[l.kind].weight,
  }));
  // Cumulative metro populations per site, for picking where a bubble appears.
  const metroWeights = data.sites.map((s) => {
    let total = 0;
    return (s.metros ?? []).map((m) => (total += Math.max(1, m.pop)));
  });
  // The Merger: regions that join the network on a set day.
  const merger = scenario?.merger
    ? {
        tick: scenario.merger.atDay * 24,
        sites: data.sites.flatMap((s, i) => (s.country === scenario.merger.country && !s.airGapped ? [i] : [])),
      }
    : null;
  return {
    data,
    balance,
    scenario: scenario ?? { id: 'standard', name: 'Standard' },
    merger,
    patchDeadline: scenario?.patchDeadline ? scenario.patchDeadline.atDay * 24 : null,
    defenseFromStart: !!scenario?.defenseFromStart,
    siteIndex,
    susceptibility,
    susceptibilityOf,
    links,
    metroWeights,
    strains: new Map(data.strains.map((s) => [s.id, s])),
    evolutions: new Map(data.evolutions.map((e) => [e.id, e])),
    difficulties: new Map(data.difficulties.map((d) => [d.id, d])),
    responses: new Map(data.responses.map((r) => [r.id, r])),
  };
}

const clampTrait = (v) => Math.max(0.02, Math.min(0.95, v));

/** A copy of the data with a scenario's site and balance changes applied. */
export function applyScenario(data, scenario) {
  const { sites: siteChanges = {}, balance = {}, merger } = scenario;
  const minDevices = data.balance.map.minDevices;
  const mergerCountry = merger?.country;
  const sites = data.sites.map((s) => {
    if (s.airGapped) return s;
    const traits = { ...s.traits };
    for (const [k, v] of Object.entries(siteChanges.traits ?? {})) traits[k] = clampTrait(traits[k] + v);
    if (s.country === mergerCountry) for (const [k, v] of Object.entries(merger.traits ?? {})) traits[k] = clampTrait(traits[k] + v);
    const devices = siteChanges.devices ? Math.max(minDevices, Math.round(s.devices * siteChanges.devices)) : s.devices;
    return { ...s, traits, devices };
  });
  return { ...data, sites, balance: deepMerge(data.balance, balance) };
}

/** Plain-object deep merge: `over` wins; arrays and other values are replaced, not merged. */
export function deepMerge(base, over) {
  if (!isPlain(base) || !isPlain(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(base[k], v);
  return out;
}

const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
