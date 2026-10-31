// Picking news ticker headlines (data/headlines.js) for events and as ambient filler.
// Pure functions over the game state, so they're testable in Node. The ticker UI
// (src/ui/ticker.js) decides when to show them.

/** Does headline `h` fit this event (or, with event null, the current state as filler)? */
export function headlineMatches(h, event, state, data) {
  const w = h.when ?? {};
  if (event) {
    if (w.event !== event.type) return false;
    if (w.id !== undefined && w.id !== event.id) return false;
    if (w.site !== undefined && w.site !== event.site) return false;
    if (w.tag !== undefined && !data.sites.find((s) => s.id === event.site)?.tags.includes(w.tag)) return false;
  } else if (w.event !== undefined) {
    return false;
  }
  const t = state.totals;
  const share = t.devices ? t.infected / t.devices : 0;
  if (w.detected !== undefined && w.detected !== (state.detectedAt !== null)) return false;
  if (w.minShare !== undefined && share < w.minShare) return false;
  if (w.maxShare !== undefined && share > w.maxShare) return false;
  if (w.minRemediation !== undefined && state.remediation < w.minRemediation) return false;
  for (const [k, v] of Object.entries(w.minStat ?? {})) if ((state.stats[k] ?? 0) < v) return false;
  return true;
}

/** Fills {site}, {strain} and {company} in a headline. */
export function fillHeadline(text, event, state, data) {
  const site = event?.site ? data.sites.find((s) => s.id === event.site)?.name ?? event.site : 'Head office';
  return text
    .replaceAll('{site}', site)
    .replaceAll('{strain}', state.strainName)
    .replaceAll('{company}', data.company ?? 'The company');
}

/**
 * Headlines for one event, ready to show: { id, text, kind: 'event' | 'defense' }.
 * `seen` is a Set of ids already shown this game (for `once`); it's updated.
 * At most one headline per event, picked with `random` (0..1) among the matches.
 */
export function eventHeadlines(event, state, data, seen, random = Math.random) {
  if (event.type === 'response') {
    const r = data.responses.find((x) => x.id === event.id);
    if (!r?.headline) return [];
    return [{ id: `response:${r.id}`, text: fillHeadline(r.headline, event, state, data), kind: 'defense' }];
  }
  const options = data.headlines.filter((h) => !(h.once && seen.has(h.id)) && headlineMatches(h, event, state, data));
  if (!options.length) return [];
  const h = options[Math.floor(random() * options.length)];
  seen.add(h.id);
  return [{ id: h.id, text: fillHeadline(h.text, event, state, data), kind: 'event' }];
}

/**
 * An ambient headline for the current state, or null. Prefers ones not shown recently:
 * `recent` is a list of recently shown ids (most recent last).
 */
export function ambientHeadline(state, data, seen, recent = [], random = Math.random) {
  const options = data.headlines.filter(
    (h) => !(h.once && seen.has(h.id)) && !recent.includes(h.id) && headlineMatches(h, null, state, data),
  );
  if (!options.length) return null;
  const total = options.reduce((n, h) => n + (h.weight ?? 1), 0);
  let x = random() * total;
  const h = options.find((o) => (x -= o.weight ?? 1) < 0) ?? options[options.length - 1];
  seen.add(h.id);
  return { id: h.id, text: fillHeadline(h.text, null, state, data), kind: 'ambient' };
}
