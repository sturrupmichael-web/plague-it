// Saving to localStorage. Every key is prefixed with "plagueIT:" so this game's saves
// don't collide with other games on the same domain. Every call is wrapped in try/catch:
// if storage is blocked (private mode, disabled cookies, full quota) the game still runs,
// it just doesn't remember anything.

export const PREFIX = 'plagueIT:';

function defaultBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // Some browsers throw just for touching localStorage when it's blocked.
  }
}

/** Makes a storage wrapper over any localStorage-like object (tests pass a fake). */
export function createStorage(backend = defaultBackend()) {
  return {
    load(key, fallback = null) {
      try {
        const raw = backend?.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    save(key, value) {
      try {
        backend?.setItem(PREFIX + key, JSON.stringify(value));
        return !!backend;
      } catch {
        return false;
      }
    },
    remove(key) {
      try {
        backend?.removeItem(PREFIX + key);
      } catch {
        // Nothing to do: storage is unavailable.
      }
    },
  };
}
