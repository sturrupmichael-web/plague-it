// The static side of a game: lookups and derived numbers computed once from data/, so
// the per-tick code stays simple. Nothing here changes during a game (Phase 3 defender
// responses will modify site traits through the game state, not through this).

export function createWorld(data) {
  const { balance } = data;
  const siteIndex = new Map(data.sites.map((s, i) => [s.id, i]));
  const w = balance.spread.traitWeights;
  const susceptibility = data.sites.map(
    (s) => (1 - s.traits.patch * w.patch) * (1 - s.traits.savvy * w.savvy) * (1 - s.traits.maturity * w.maturity),
  );
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
    links,
    metroWeights,
    strains: new Map(data.strains.map((s) => [s.id, s])),
    evolutions: new Map(data.evolutions.map((e) => [e.id, e])),
    difficulties: new Map(data.difficulties.map((d) => [d.id, d])),
  };
}
