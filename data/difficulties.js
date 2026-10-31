// Difficulty settings: multipliers on the detection, remediation and defender AI numbers.
//
// {
//   id, name, description,
//   detection:   × how fast noise turns into suspicion (higher = detected sooner)
//   remediation: × remediation speed
//   aiInterval:  × time between defender decisions (lower = reacts faster)
//   funding:     × defender funding (affords bigger responses, hires the IR firm sooner)
//   smarts:      × how strongly the AI targets the vectors and stats you rely on
//                (0 = picks at random, ignoring data/responses.js triggers)
//   scoreMult:   × final score
// }

export const DIFFICULTIES = [
  { id: 'understaffed', name: 'Understaffed IT', description: 'Two people and a ticket queue. Good luck to them.',
    detection: 0.7, remediation: 0.7, aiInterval: 1.4, funding: 0.7, smarts: 0.4, scoreMult: 0.75 },
  { id: 'normal', name: 'Normal', description: 'A real security team with real holidays.',
    detection: 1, remediation: 1, aiInterval: 1, funding: 1, smarts: 1, scoreMult: 1 },
  { id: 'competent', name: 'Competent SecOps', description: 'They read the alerts. All of them.',
    detection: 1.3, remediation: 1.2, aiInterval: 0.7, funding: 1.3, smarts: 1.6, scoreMult: 1.5 },
];
