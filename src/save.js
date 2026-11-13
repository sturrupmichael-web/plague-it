// What the game remembers between visits, and how it cleans up what it loads.
// Loaded data is never trusted: anything missing, the wrong type or out of range is
// replaced by the default, so an old, hand-edited or corrupted save can't break the game.
//
// Keys (all prefixed "plagueIT:" by storage.js):
//   settings   { speed, muted, volume, reduceMotion, ticker }
//   profile    { strainName, lastStrain, lastDifficulty, lastScenario, beaten: [strain ids] }
//   scores     the best MAX_SCORES games, best first (see gameSummary in src/score.js)
//   stats      lifetime totals for the stats page

export const DEFAULT_SETTINGS = { speed: 1, muted: false, volume: 0.7, reduceMotion: false, ticker: true };
export const MAX_SCORES = 10;
export const DEFAULT_PROFILE = { strainName: '', lastStrain: 'worm', lastDifficulty: 'normal', lastScenario: 'standard', beaten: [] };
export const MAX_NAME = 24;

export function cleanSettings(raw) {
  const s = isObject(raw) ? raw : {};
  return {
    speed: [1, 2, 3].includes(s.speed) ? s.speed : DEFAULT_SETTINGS.speed,
    muted: typeof s.muted === 'boolean' ? s.muted : DEFAULT_SETTINGS.muted,
    volume: isNum(s.volume) ? Math.min(1, Math.max(0, s.volume)) : DEFAULT_SETTINGS.volume,
    reduceMotion: typeof s.reduceMotion === 'boolean' ? s.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    ticker: typeof s.ticker === 'boolean' ? s.ticker : DEFAULT_SETTINGS.ticker,
  };
}

export function cleanProfile(raw) {
  const p = isObject(raw) ? raw : {};
  return {
    strainName: cleanName(p.strainName),
    lastStrain: typeof p.lastStrain === 'string' ? p.lastStrain : DEFAULT_PROFILE.lastStrain,
    lastDifficulty: typeof p.lastDifficulty === 'string' ? p.lastDifficulty : DEFAULT_PROFILE.lastDifficulty,
    lastScenario: typeof p.lastScenario === 'string' ? p.lastScenario : DEFAULT_PROFILE.lastScenario,
    /** Strains won with at least once (unlocks the next strain). */
    beaten: Array.isArray(p.beaten) ? [...new Set(p.beaten.filter((x) => typeof x === 'string' && x.length <= 40))].slice(0, 50) : [],
  };
}

/** Player-chosen strain names: trimmed, single-spaced, printable, at most MAX_NAME characters. */
export function cleanName(name) {
  if (typeof name !== 'string') return '';
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  return name.replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME);
}

export function loadSettings(storage) {
  return cleanSettings(storage.load('settings'));
}
export function saveSettings(storage, settings) {
  return storage.save('settings', cleanSettings(settings));
}
export function loadProfile(storage) {
  return cleanProfile(storage.load('profile'));
}
export function saveProfile(storage, profile) {
  return storage.save('profile', cleanProfile(profile));
}

/** Is this strain playable? (Its unlocking strain has been beaten, or it needs none.) */
export function strainUnlocked(strain, profile) {
  return !strain.unlockedBy || profile.beaten.includes(strain.unlockedBy);
}

// ── Best scores ─────────────────────────────────────────────────────────────

const ID = (v) => typeof v === 'string' && v.length > 0 && v.length <= 40;

function cleanScore(raw) {
  if (!isObject(raw) || !isNum(raw.score) || !ID(raw.strain)) return null;
  return {
    score: Math.max(0, Math.round(raw.score)),
    won: raw.won === true,
    outcome: ID(raw.outcome) ? raw.outcome : null,
    strain: raw.strain,
    name: cleanName(raw.name),
    difficulty: ID(raw.difficulty) ? raw.difficulty : 'normal',
    scenario: ID(raw.scenario) ? raw.scenario : 'standard',
    days: isNum(raw.days) ? Math.max(1, Math.round(raw.days)) : 1,
    peak: isNum(raw.peak) ? Math.max(0, Math.round(raw.peak)) : 0,
    evolutions: isNum(raw.evolutions) ? Math.max(0, Math.round(raw.evolutions)) : 0,
    at: isNum(raw.at) ? raw.at : 0,
  };
}

export function cleanScores(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(cleanScore).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
}

/**
 * Adds a finished game to the best scores. Returns { scores, rank } where rank is its
 * 1-based place, or null if it didn't make the list.
 */
export function addScore(scores, entry) {
  const list = cleanScores([...scores, entry]);
  const i = list.findIndex((x) => x.at === entry.at && x.score === entry.score && x.strain === entry.strain);
  return { scores: list, rank: i < 0 ? null : i + 1 };
}

export function loadScores(storage) {
  return cleanScores(storage.load('scores'));
}
export function saveScores(storage, scores) {
  return storage.save('scores', cleanScores(scores));
}

// ── Lifetime stats ──────────────────────────────────────────────────────────

export const DEFAULT_STATS = { games: 0, wins: 0, days: 0, peak: 0, evolutions: 0, fastestWin: null, best: 0, outcomes: {}, strains: {} };

const count = (v) => (isNum(v) && v >= 0 ? Math.round(v) : 0);
const counts = (o, keyOk = ID) => Object.fromEntries(Object.entries(isObject(o) ? o : {}).filter(([k]) => keyOk(k)).slice(0, 50).map(([k, v]) => [k, count(v)]));

export function cleanStats(raw) {
  const s = isObject(raw) ? raw : {};
  const strains = {};
  for (const [k, v] of Object.entries(isObject(s.strains) ? s.strains : {}).slice(0, 50)) {
    if (ID(k) && isObject(v)) strains[k] = { played: count(v.played), won: count(v.won) };
  }
  return {
    games: count(s.games),
    wins: count(s.wins),
    days: count(s.days),
    peak: count(s.peak),
    evolutions: count(s.evolutions),
    fastestWin: isNum(s.fastestWin) && s.fastestWin >= 1 ? Math.round(s.fastestWin) : null,
    best: count(s.best),
    outcomes: counts(s.outcomes),
    strains,
  };
}

/** Adds a finished game (a gameSummary) to the lifetime stats. Returns new stats. */
export function addGameToStats(stats, g) {
  const s = cleanStats(stats);
  s.games++;
  if (g.won) s.wins++;
  s.days += g.days;
  s.peak = Math.max(s.peak, g.peak);
  s.evolutions += g.evolutions;
  if (g.won && (s.fastestWin === null || g.days < s.fastestWin)) s.fastestWin = g.days;
  s.best = Math.max(s.best, g.score);
  if (g.outcome) s.outcomes[g.outcome] = (s.outcomes[g.outcome] ?? 0) + 1;
  const st = (s.strains[g.strain] ??= { played: 0, won: 0 });
  st.played++;
  if (g.won) st.won++;
  return s;
}

export function loadStats(storage) {
  return cleanStats(storage.load('stats'));
}
export function saveStats(storage, stats) {
  return storage.save('stats', cleanStats(stats));
}

/** Forgets everything but settings: unlocks, best scores and stats. */
export function resetProgress(storage) {
  for (const k of ['profile', 'scores', 'stats']) storage.remove(k);
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
