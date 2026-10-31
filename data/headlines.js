// News ticker headlines: the comedy layer. src/news.js picks them.
//
// {
//   id:    string, unique
//   text:  the headline. Placeholders: {site} (the event's state/province), {strain}
//          (your strain's name), {company} (the company's name).
//   when:  conditions, all optional; every one given must match:
//     event:     an event type: 'siteReached' | 'siteFallen' | 'siteCleaned' | 'detected' |
//                'response' | 'responseEnded' | 'irFirm' | 'evolved' | 'updateJump'.
//                Headlines with an event run when it happens; ones without are "ambient"
//                filler, picked at random every so often while their conditions hold.
//     id:        for 'evolved' / 'response' events: the evolution or response id
//     site:      the event's site id;  tag: the event's site has this tag (data/sites.js TAGS)
//     detected:  true = only after SecOps noticed you, false = only before
//     minShare:  at least this share (0..1) of all machines infected
//     maxShare:  at most this share
//     minStat:   { spread | noise | impact: minimum }
//     minRemediation: Remediation bar at least this (0..100)
//   once:  true = at most once per game (ambient headlines repeat less anyway)
//   weight: how often an ambient headline comes up compared to others (default 1)
// }
//
// Keep them original: no real companies, products or people.

export const COMPANY = 'Globex-Pinnacle Holdings';

export const HEADLINES = [
  // ── Ambient, before anyone notices ─────────────────────────────────────────
  { id: 'q-allhands', text: 'Quarterly all-hands moved again; "synergy" mentioned 41 times', when: { detected: false } },
  { id: 'q-coffee', text: '{company} cafeteria replaces coffee with "focus water"', when: { detected: false } },
  { id: 'q-slow', text: 'Staff agree the network "feels a bit sluggish lately"', when: { detected: false, minShare: 0.05 } },
  { id: 'q-mondays', text: 'Warehouse manager insists the slow scanner is "just Mondays"', when: { detected: false, minShare: 0.02 } },
  { id: 'q-reboot', text: 'Help desk\'s advice to turn it off and on again works 0% of the time this week', when: { detected: false, minShare: 0.1 } },
  { id: 'q-fans', text: 'Laptop fans across the company now audible from the parking lot', when: { minStat: { impact: 4 }, detected: false } },
  { id: 'q-training', text: 'Annual security training completion hits 12%, a new record', when: { detected: false } },
  { id: 'q-printer', text: 'Third-floor printer prints a 400-page document nobody sent', when: { detected: false, minShare: 0.03 } },

  // ── Ambient, after detection ───────────────────────────────────────────────
  { id: 'd-wait', text: 'Help desk wait times reach 4 hours', when: { detected: true, minShare: 0.15 } },
  { id: 'd-warroom', text: 'IT war room orders its sixth round of pizza', when: { detected: true } },
  { id: 'd-whiteboard', text: 'SecOps whiteboard now just says "WHY" in red marker', when: { detected: true, minShare: 0.4 } },
  { id: 'd-cio', text: 'CIO cancels vacation; "It\'s fine," says CIO, visibly not fine', when: { detected: true, minRemediation: 20 } },
  { id: 'd-lanyard', text: 'Visitors now need three badges, two escorts and a reason', when: { detected: true } },
  { id: 'd-ticket', text: 'Ticket #48,113 "computer is being weird" marked as duplicate of #48,112', when: { detected: true } },
  { id: 'd-memo', text: 'Memo reminds staff that "suspicious" is not a feeling but a policy', when: { detected: true } },
  { id: 'd-paper', text: 'Accounting returns to paper ledgers; morale unexpectedly high', when: { detected: true, minShare: 0.5 } },
  { id: 'd-closing', text: 'Remediation "nearly done," says team for the third day running', when: { minRemediation: 70 }, weight: 2 },
  { id: 'd-everything', text: 'Survey finds 9 in 10 employees "can\'t log in to anything"', when: { minShare: 0.8 }, weight: 2 },
  { id: 'd-payup', text: 'Exec demands to know why his screen says PAY UP', when: { minStat: { impact: 10 } }, weight: 2 },
  { id: 'd-goose', text: 'Every desktop now shows the same goose. The goose is winning.', when: { minStat: { impact: 3 }, minShare: 0.2 } },

  // ── Events ─────────────────────────────────────────────────────────────────
  { id: 'e-detected', text: 'IT investigating "unusual activity"; staff asked to stop clicking things', when: { event: 'detected' }, once: true },
  { id: 'e-first-ca', text: 'Northern offices report "the same weird pop-up" as head office', when: { event: 'siteReached', site: 'ca-on' }, once: true },
  { id: 'e-hawaii', text: 'Hawaii branch\'s laptops also infected, presumably while on the beach', when: { event: 'siteReached', site: 'us-hi' }, once: true },
  { id: 'e-alaska', text: 'Alaska office infected; IT blames "the long nights"', when: { event: 'siteReached', site: 'us-ak' }, once: true },
  { id: 'e-dc', text: 'D.C. lobbying team insists its laptops are "above this sort of thing"', when: { event: 'siteReached', site: 'us-dc' }, once: true },
  { id: 'e-factory', text: 'Air-gapped factory floor infected; nobody can explain how. Someone found a USB stick.', when: { event: 'siteReached', site: 'factory' }, once: true },
  { id: 'e-finance', text: '{site} finance team finds spreadsheet that "wasn\'t there yesterday"', when: { event: 'siteReached', tag: 'finance' } },
  { id: 'e-gov', text: '{site} government contracts team asks if this needs a form', when: { event: 'siteReached', tag: 'government' } },
  { id: 'e-energy', text: '{site} pipeline office reports control room screens "doing the wobble"', when: { event: 'siteReached', tag: 'energy' } },
  { id: 'e-tourism', text: '{site} resort desk computers now offer guests "exclusive prizes"', when: { event: 'siteReached', tag: 'tourism' } },
  { id: 'e-rural', text: '{site} office infected over a connection described as "two cans and a string"', when: { event: 'siteReached', tag: 'rural' } },
  { id: 'e-fallen', text: 'Every machine in {site} now answers to {strain}', when: { event: 'siteFallen' } },
  { id: 'e-cleaned', text: '{site} declared clean; IT celebrates with a single cupcake', when: { event: 'siteCleaned' } },
  { id: 'e-irfirm', text: 'CIO hires outside incident response firm; consultants arrive in matching vests', when: { event: 'irFirm' }, once: true },
  { id: 'e-jump', text: '{site} installs "urgent update" from IT. IT did not send an update.', when: { event: 'updateJump' } },
  { id: 'e-isolation-ends', text: '{site} reconnected to the network; staff "kind of miss the fax"', when: { event: 'responseEnded', id: 'isolate-site' } },
  { id: 'e-crypto', text: 'Power bill up 30%; facilities blames "the new kettle"', when: { event: 'evolved', id: 'crypto-mining' }, once: true },
  { id: 'e-popups', text: 'Staff win "free cruise" an average of 14 times a day', when: { event: 'evolved', id: 'popups' }, once: true },
  { id: 'e-encrypt', text: 'Files across {company} renamed to things like "Q3_report.locked"', when: { event: 'evolved', id: 'encryption' }, once: true },
  { id: 'e-brick', text: 'Facilities reports a sudden surplus of very expensive doorstops', when: { event: 'evolved', id: 'bricking' }, once: true },
  { id: 'e-wifi', text: 'Guest Wi-Fi password, still "Welcome123", now also welcomes {strain}', when: { event: 'evolved', id: 'guest-wifi' }, once: true },
];
