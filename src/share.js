// Sharing a finished game's score: the text people paste or send, and a share that
// uses the phone's share sheet (Web Share API) where there is one, the clipboard
// where there isn't, and as a last resort hands the text back to show for copying.

import { fmt } from './ui/dom.js';

/** Where the game lives. Shares from a local or file:// copy still point people here. */
export const GAME_URL = 'https://michaelsturrup.com/plague-it/';

const VERBS = {
  compromised: 'took the whole network',
  encrypted: 'encrypted the whole network',
  remediated: 'got remediated',
  eradicated: 'got wiped out',
  patched: 'got patched out',
};

/** The link to share: this page without its query (seed, debug) when served over http(s). */
export function shareUrl(loc = globalThis.location) {
  if (loc && /^https?:$/.test(loc.protocol) && !/^(localhost|127\.|\[::1\])/.test(loc.hostname)) {
    return loc.origin + loc.pathname;
  }
  return GAME_URL;
}

/** { title, text } for a finished game. Pure, so Node tests can check it. */
export function shareMessage(state, world, score) {
  const days = Math.floor((state.endedAt ?? state.tick) / 24) + 1;
  const difficulty = world.difficulties.get(state.difficultyId)?.name;
  const scenario = world.scenario && world.scenario.id !== 'standard' ? world.scenario.name : null;
  const setting = [difficulty, scenario].filter(Boolean).join(', ');
  const verb = VERBS[state.outcome] ?? (state.status === 'won' ? 'won' : 'lost');
  const won = state.status === 'won';
  const lines = [
    `🦠 Plague IT: ${fmt(score.total)} points`,
    `My ${state.strainName} strain ${verb} in ${days} day${days === 1 ? '' : 's'}${setting ? ` (${setting})` : ''}, peaking at ${fmt(state.peakInfected)} infected machines.`,
    won ? 'Can you beat it?' : 'Think you can do better?',
  ];
  return { title: 'Plague IT', text: lines.join('\n') };
}

/**
 * Shares `msg` ({ title, text }) and `url`. Returns how it went:
 *   'shared'     the share sheet finished
 *   'cancelled'  they closed the share sheet
 *   'copied'     no share sheet, so the text and link went to the clipboard
 *   'manual'     neither worked: show the text so they can copy it themselves
 * `nav` and `doc` are injectable for tests.
 */
export async function shareScore(msg, url, { nav = globalThis.navigator, doc = globalThis.document } = {}) {
  const data = { title: msg.title, text: msg.text, url };
  if (typeof nav?.share === 'function' && (typeof nav.canShare !== 'function' || nav.canShare(data))) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
      // Otherwise (not allowed here, say) fall through to the clipboard.
    }
  }
  const full = `${msg.text}\n${url}`;
  try {
    if (typeof nav?.clipboard?.writeText !== 'function') throw new Error('no clipboard');
    await nav.clipboard.writeText(full);
    return 'copied';
  } catch {
    if (doc && copyWithSelection(doc, full)) return 'copied';
  }
  return 'manual';
}

/** The old clipboard route, for browsers without navigator.clipboard (or on file://). */
function copyWithSelection(doc, text) {
  try {
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    doc.body.append(ta);
    ta.select();
    const ok = doc.execCommand?.('copy') ?? false;
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
