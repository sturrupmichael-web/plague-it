// Difficulty settings. Phase 1 only uses `normal`; Phase 2+ apply the multipliers.
//
// {
//   id, name, description,
//   detection:   × how fast noise turns into suspicion (higher = detected sooner)
//   remediation: × remediation speed
//   aiInterval:  × time between defender decisions (lower = reacts faster)
//   scoreMult:   × final score
// }

export const DIFFICULTIES = [
  { id: 'understaffed', name: 'Understaffed IT', description: 'Two people and a ticket queue. Good luck to them.',
    detection: 0.7, remediation: 0.7, aiInterval: 1.4, scoreMult: 0.75 },
  { id: 'normal', name: 'Normal', description: 'A real security team with real holidays.',
    detection: 1, remediation: 1, aiInterval: 1, scoreMult: 1 },
  { id: 'competent', name: 'Competent SecOps', description: 'They read the alerts. All of them.',
    detection: 1.3, remediation: 1.2, aiInterval: 0.7, scoreMult: 1.5 },
];
