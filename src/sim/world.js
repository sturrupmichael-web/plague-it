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
  const links = data.links.map((l, i) => ({
    ...l,
    index: i,
    a: siteIndex.get(l.from),
    b: siteIndex.get(l.to),
    weight: balance.linkKinds[l.kind].weight,
  }));
  return {
    data,
    balance,
    siteIndex,
    susceptibility,
    links,
    strains: new Map(data.strains.map((s) => [s.id, s])),
    evolutions: new Map(data.evolutions.map((e) => [e.id, e])),
    difficulties: new Map(data.difficulties.map((d) => [d.id, d])),
  };
}
