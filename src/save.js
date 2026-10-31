// What the game remembers between visits, and how it cleans up what it loads.
// Loaded data is never trusted: anything missing, the wrong type or out of range is
// replaced by the default, so an old, hand-edited or corrupted save can't break the game.
//
// Keys (all prefixed "plagueIT:" by storage.js):
//   settings   { speed, muted }
//   profile    { strainName, lastStrain, lastDifficulty }
// Phase 4–5 add unlocks, best scores and stats.

export const DEFAULT_SETTINGS = { speed: 1, muted: false };
export const DEFAULT_PROFILE = { strainName: '', lastStrain: 'worm', lastDifficulty: 'normal' };
export const MAX_NAME = 24;

export function cleanSettings(raw) {
  const s = isObject(raw) ? raw : {};
  return {
    speed: [1, 2, 3].includes(s.speed) ? s.speed : DEFAULT_SETTINGS.speed,
    muted: typeof s.muted === 'boolean' ? s.muted : DEFAULT_SETTINGS.muted,
  };
}

export function cleanProfile(raw) {
  const p = isObject(raw) ? raw : {};
  return {
    strainName: cleanName(p.strainName),
    lastStrain: typeof p.lastStrain === 'string' ? p.lastStrain : DEFAULT_PROFILE.lastStrain,
    lastDifficulty: typeof p.lastDifficulty === 'string' ? p.lastDifficulty : DEFAULT_PROFILE.lastDifficulty,
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

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
