// The setup screen: name your strain, pick a strain, a scenario and a difficulty, then
// deploy. Strains unlock by beating the one before. (Phase 5 puts a title screen in front.)

import { $, el } from './dom.js';
import { MAX_NAME, strainUnlocked } from '../save.js';

/**
 * @param onStart     ({ strainId, difficultyId, scenarioId, strainName }) => void
 * @param onUnlockAll optional: shows a playtest link that unlocks every strain
 */
export function showSetup(data, profile, onStart, { onUnlockAll } = {}) {
  const overlay = $('#overlay');
  const unlocked = (s) => strainUnlocked(s, profile);
  let strain = data.strains.find((s) => s.id === profile.lastStrain && unlocked(s)) ?? data.strains[0];
  let difficulty = data.difficulties.find((d) => d.id === profile.lastDifficulty) ?? data.difficulties[1];
  let scenario = data.scenarios.find((s) => s.id === profile.lastScenario) ?? data.scenarios[0];

  const strainCards = data.strains.map((s) => {
    const open = unlocked(s);
    const by = data.strains.find((x) => x.id === s.unlockedBy);
    return el('button', {
      class: 'card strain' + (open ? '' : ' locked'), type: 'button', 'data-strain': s.id, disabled: !open,
      title: open ? s.description : `Beat ${by?.name} to unlock`, onclick: () => pickStrain(s),
    }, el('strong', {}, open ? s.name : `🔒 ${s.name}`), el('span', {}, open ? s.tagline : `Beat ${by?.name} to unlock.`));
  });
  const scenarioCards = data.scenarios.map((s) =>
    el('button', { class: 'card scenario', type: 'button', 'data-scenario': s.id, title: s.description, onclick: () => pickScenario(s) },
      el('strong', {}, s.name), el('span', {}, s.tagline)),
  );
  const diffButtons = data.difficulties.map((d) =>
    el('button', { class: 'seg', type: 'button', 'data-difficulty': d.id, title: d.description, onclick: () => pickDifficulty(d) }, d.name),
  );
  const name = el('input', {
    id: 'strain-name', type: 'text', maxlength: String(MAX_NAME), autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Name your strain', value: profile.strainName,
  });
  const desc = el('p', { class: 'desc', id: 'strain-desc' });
  const scenarioDesc = el('p', { class: 'desc', id: 'scenario-desc' });
  const start = el('button', { id: 'start', class: 'primary', type: 'submit' }, 'Deploy');
  const locked = data.strains.some((s) => !unlocked(s));

  const form = el('form', { class: 'panel setup', onsubmit: (e) => {
    e.preventDefault();
    overlay.replaceChildren();
    overlay.hidden = true;
    onStart({ strainId: strain.id, difficultyId: difficulty.id, scenarioId: scenario.id, strainName: name.value });
  } },
    el('h1', { class: 'logo' }, 'PLAGUE', el('span', {}, 'IT')),
    el('p', { class: 'kicker' }, 'You are the malware. One laptop. Every endpoint. Before SecOps finds you.'),
    el('label', { for: 'strain-name' }, 'Strain name'), name,
    el('div', { class: 'label' }, 'Strain'), el('div', { class: 'cards' }, strainCards), desc,
    el('div', { class: 'label' }, 'Scenario'), el('div', { class: 'cards' }, scenarioCards), scenarioDesc,
    el('div', { class: 'label' }, 'Difficulty'), el('div', { class: 'segs' }, diffButtons),
    start,
    locked && onUnlockAll
      ? el('button', { type: 'button', class: 'link', id: 'unlock-all', onclick: () => onUnlockAll() }, 'Playtest: unlock every strain')
      : null,
  );

  function pickStrain(s) {
    strain = s;
    for (const c of strainCards) c.classList.toggle('on', c.dataset.strain === s.id);
    desc.textContent = s.description;
  }
  function pickScenario(s) {
    scenario = s;
    for (const c of scenarioCards) c.classList.toggle('on', c.dataset.scenario === s.id);
    scenarioDesc.textContent = s.description;
  }
  function pickDifficulty(d) {
    difficulty = d;
    for (const b of diffButtons) b.classList.toggle('on', b.dataset.difficulty === d.id);
  }
  pickStrain(strain);
  pickScenario(scenario);
  pickDifficulty(difficulty);
  overlay.replaceChildren(form);
  overlay.hidden = false;
}
