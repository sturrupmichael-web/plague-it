// Scoring a finished game, and the summary of it that best scores and lifetime stats
// keep. Pure functions over the game state; the knobs are BALANCE.score
// (data/balance.js) and each difficulty's and scenario's scoreMult.

/**
 * The score for a finished game, with its breakdown for the end screen:
 * { total, base, mult, parts: [{ label, value }] }.
 */
export function scoreGame(state, world) {
  const cfg = world.balance.score;
  const end = state.endedAt ?? state.tick;
  const days = end / 24;
  const parts = [];
  if (state.status === 'won') {
    parts.push({ label: 'Network taken', value: cfg.win });
    parts.push({ label: 'Speed bonus', value: Math.round(Math.max(0, cfg.parDays - days) * cfg.perDayUnderPar) });
    const quiet = (state.detectedAt ?? end) / 24;
    parts.push({ label: 'Stealth bonus', value: Math.round(quiet * cfg.perDayUndetected) });
    parts.push({ label: 'Remediation dodged', value: Math.round((100 - state.remediation) * cfg.perRemediationLeft) });
  } else {
    const devices = state.totals?.devices || 1;
    parts.push({ label: 'Peak foothold', value: Math.round(Math.min(1, state.peakInfected / devices) * cfg.lossPeakShare) });
    parts.push({ label: 'Days survived', value: Math.round(Math.min(days, cfg.parDays) * cfg.lossPerDay) });
  }
  const base = parts.reduce((n, p) => n + p.value, 0);
  const diff = world.difficulties.get(state.difficultyId)?.scoreMult ?? 1;
  const scen = world.scenario?.scoreMult ?? 1;
  const mult = Math.round(diff * scen * 100) / 100;
  return { total: Math.max(0, Math.round(base * diff * scen)), base, mult, parts };
}

/** What best scores and lifetime stats remember about one finished game. */
export function gameSummary(state, world, score, now = Date.now()) {
  return {
    score,
    won: state.status === 'won',
    outcome: state.outcome,
    strain: state.strainId,
    name: state.strainName,
    difficulty: state.difficultyId,
    scenario: state.scenarioId,
    days: Math.floor((state.endedAt ?? state.tick) / 24) + 1,
    peak: state.peakInfected,
    evolutions: state.evolved.length,
    at: now,
  };
}
