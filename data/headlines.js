// News ticker headlines: the comedy layer. src/news.js picks them.
//
// {
//   id:    string, unique
//   text:  the headline. Placeholders: {site} (the event's state/province), {strain}
//          (your strain's name), {company} (the company's name), {day} (the game day).
//   when:  conditions, all optional; every one given must match:
//     event:     an event type: 'siteReached' | 'siteFallen' | 'siteCleaned' | 'detected' |
//                'response' | 'responseEnded' | 'irFirm' | 'evolved' | 'updateJump' |
//                'mutated' (Polymorphic) | 'encryption' (Ransomware) | 'merger' (The Merger)
//                Headlines with an event run when it happens; ones without are "ambient"
//                filler, picked at random every so often while their conditions hold.
//     id:        for 'evolved' / 'response' / 'responseEnded' / 'mutated' events: the
//                evolution or response id
//     gained:    for 'mutated': true = it gained the evolution, false = it lost one
//     strain:    only when playing this strain;  scenario: only in this scenario
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

  // ── More ambient ───────────────────────────────────────────────────────────
  { id: 'q-standup', text: 'Daily stand-up now runs 55 minutes; nobody is sure why', when: { detected: false } },
  { id: 'q-rebrand', text: '{company} unveils new logo; it is the old logo, but teal', when: { detected: false } },
  { id: 'q-cleandesk', text: 'Clean-desk policy enforced; three plants and a sandwich confiscated', when: { detected: false } },
  { id: 'q-cloud', text: 'Someone in marketing asks IT to "make the cloud faster"', when: { detected: false, minShare: 0.01 } },
  { id: 'q-cursor', text: 'Staff report the mouse cursor "moving on its own, but politely"', when: { detected: false, minShare: 0.08 } },
  { id: 'q-battery', text: 'Laptop batteries now last 40 minutes; vendor blames "usage patterns"', when: { detected: false, minShare: 0.15 } },
  { id: 'd-vpn', text: 'Remote staff discover the joys of "working offline"', when: { detected: true, minShare: 0.3 } },
  { id: 'd-sticky', text: 'New password policy produces record sales of sticky notes', when: { detected: true } },
  { id: 'd-allnighter', text: 'SecOps lead seen sleeping under desk "on purpose, for vigilance"', when: { detected: true, minRemediation: 40 } },
  { id: 'd-reply-all', text: 'Company-wide "please stop replying all" email gets 900 replies-all', when: { detected: true, minShare: 0.25 } },
  { id: 'd-board', text: 'Board asks if this is "the cyber thing they saw on the news"', when: { detected: true, minStat: { impact: 6 } } },
  { id: 'd-lawyers', text: 'Legal department begins drafting a statement about "an incident"', when: { detected: true, minShare: 0.6 } },
  { id: 'd-hope', text: 'IT says the end is in sight; IT has said this before', when: { minRemediation: 50, maxShare: 0.5 } },
  { id: 'd-lost', text: 'Staff advised to "just use a pen" until further notice', when: { minShare: 0.9 } },
  { id: 'd-ceo', text: 'CEO addresses staff from a borrowed laptop, which promptly freezes', when: { minShare: 0.7, minStat: { impact: 4 } } },

  // ── Strains ────────────────────────────────────────────────────────────────
  { id: 's-worm', text: 'Network team describes traffic as "a lot. Just, a lot."', when: { strain: 'worm', minShare: 0.2 } },
  { id: 's-trojan', text: 'Everyone accepted the "Team Lunch Q3" calendar invite. There was no lunch.', when: { strain: 'trojan', detected: false, minShare: 0.05 } },
  { id: 's-trojan-2', text: 'Auditors find nothing unusual. Auditors are wrong.', when: { strain: 'trojan', detected: false, minShare: 0.3 } },
  { id: 's-macro', text: 'Finance asked to stop clicking "Enable Content" "just to see what happens"', when: { strain: 'macro', minShare: 0.1 } },
  { id: 's-macro-2', text: 'Budget spreadsheet now 4 GB and growing; nobody added a row', when: { strain: 'macro', minShare: 0.3 } },
  { id: 's-botnet', text: 'Bandwidth bill triples; finance assumes "the video calls"', when: { strain: 'botnet', minShare: 0.2 } },
  { id: 's-botnet-2', text: 'Every printer in the company now sends a "heartbeat" at 3 a.m.', when: { strain: 'botnet', minShare: 0.4 } },
  { id: 's-rootkit', text: 'IT reinstalls the operating system twice; problem "reinstalls itself"', when: { strain: 'rootkit', detected: true } },
  { id: 's-rootkit-2', text: 'Antivirus scan comes back clean, which is how you know', when: { strain: 'rootkit', minShare: 0.3 } },
  { id: 's-poly', text: 'Malware samples from Monday and Tuesday "look like different species"', when: { strain: 'polymorphic', detected: true } },
  { id: 's-ransom', text: 'Help desk wonders why everyone\'s files are suddenly called .locked', when: { strain: 'ransomware', event: 'encryption' }, once: true },
  { id: 's-ransom-2', text: 'Exec demands to know why his screen says PAY UP', when: { strain: 'ransomware', event: 'encryption' }, once: true },
  { id: 's-ransom-3', text: 'Finance asks if "Bitcoin" is an approved vendor', when: { strain: 'ransomware', minShare: 0.5, minStat: { impact: 2 } } },
  { id: 'e-mutate-gain', text: 'Malware analysts report the strain "grew a new limb overnight"', when: { event: 'mutated', gained: true } },
  { id: 'e-mutate-loss', text: 'Analysts baffled as strain drops a feature "like a lizard drops its tail"', when: { event: 'mutated', gained: false } },
  { id: 'e-encryption', text: 'Every screen at {company} turns red at once; coffee machine also demands payment', when: { event: 'encryption' } },

  // ── Scenarios ──────────────────────────────────────────────────────────────
  { id: 'c-skeleton', text: 'Only person in the office is the intern watering the plants', when: { scenario: 'skeleton-crew', detected: false } },
  { id: 'c-skeleton-2', text: 'On-call engineer replies "will look after the holidays" with a palm tree emoji', when: { scenario: 'skeleton-crew', event: 'detected' }, once: true },
  { id: 'c-intern', text: 'Intern asks if "macros" are a kind of snack', when: { scenario: 'intern-summer' } },
  { id: 'c-intern-2', text: 'Intern cohort wins "most phishing links clicked" for the third week running', when: { scenario: 'intern-summer', minShare: 0.2 } },
  { id: 'c-merger', text: 'Acquisition paperwork "nearly done", says legal, from under a pile of paperwork', when: { scenario: 'merger', minShare: 0.01, maxShare: 0.6 } },
  { id: 'c-merger-2', text: 'Acquired company\'s servers found running in a broom cupboard', when: { scenario: 'merger', event: 'merger' }, once: true },
  { id: 'c-zero', text: 'Zero Trust rollout reaches phase 12 of 40; staff now need a badge to enter the badge office', when: { scenario: 'zero-trust' } },
  { id: 'c-zero-2', text: 'SecOps announces "nobody is trusted," including SecOps', when: { scenario: 'zero-trust', detected: false } },
  { id: 'c-patch', text: 'Patch testing enters day {day}; the patch is "basically ready"', when: { scenario: 'patch-tuesday' } },
  { id: 'c-patch-2', text: 'Patch release notes now 300 pages long; section 1 is an apology', when: { scenario: 'patch-tuesday', minShare: 0.3 } },
];
