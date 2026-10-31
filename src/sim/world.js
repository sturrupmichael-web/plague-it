// The static side of a game: lookups and derived numbers computed once from data/, so
// the per-tick code stays simple. Nothing here changes during a game (defender responses
// modify site traits through the game state's `dfx`, not through this).

export function createWorld(data) {
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
  return {
    data,
    balance,
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
