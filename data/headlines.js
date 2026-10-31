// News ticker headlines (Phase 3). Each is picked when its condition matches:
//
// {
//   id:    string, unique
//   text:  the headline
//   when:  { event: 'siteReached' | 'detected' | ..., site?: id, minStat?: { noise: 8 } }
//   once:  true to show at most once per game
// }

export const HEADLINES = [];
