// The setup screen: name your strain, pick a strain, a scenario and a difficulty, then
// deploy. Strains unlock by beating the one before. The title screen (src/ui/menus.js)
// comes before it.

import { $, el } from './dom.js';
import { MAX_NAME, strainUnlocked } from '../save.js';

/**
 * @param onStart     ({ strainId, difficultyId, scenarioId, strainName }) => void
 * @param onBack      optional: shows a Back button (to the title screen)
 */
export function showSetup(data, profile, onStart, { onBack } = {}) {
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
    el('button', { class: 'seg', type: 'button', 'data-difficulty': d.id, title: `${d.description} Score × ${d.scoreMult}.`, onclick: () => pickDifficulty(d) }, d.name),
  );
  const name = el('input', {
    id: 'strain-name', type: 'text', maxlength: String(MAX_NAME), autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Name your strain', value: profile.strainName,
  });
  const desc = el('p', { class: 'desc', id: 'strain-desc' });
  const scenarioDesc = el('p', { class: 'desc', id: 'scenario-desc' });
  const start = el('button', { id: 'start', class: 'primary', type: 'submit' }, 'Deploy');

  const form = el('form', { class: 'panel setup', onsubmit: (e) => {
    e.preventDefault();
    overlay.replaceChildren();
    overlay.hidden = true;
    onStart({ strainId: strain.id, difficultyId: difficulty.id, scenarioId: scenario.id, strainName: name.value });
  } },
    el('h2', {}, 'New infection'),
    el('label', { for: 'strain-name' }, 'Strain name'), name,
    el('div', { class: 'label' }, 'Strain'), el('div', { class: 'cards' }, strainCards), desc,
    el('div', { class: 'label' }, 'Scenario'), el('div', { class: 'cards' }, scenarioCards), scenarioDesc,
    el('div', { class: 'label' }, 'Difficulty'), el('div', { class: 'segs' }, diffButtons),
    el('div', { class: 'end-actions' },
      onBack ? el('button', { type: 'button', id: 'back', class: 'secondary', onclick: onBack }, 'Back') : null,
      start),
  );

  function pickStrain(s) {
    strain = s;
    for (const c of strainCards) c.classList.toggle('on', c.dataset.strain === s.id);
    desc.textContent = s.description;
  }
  function pickScenario(s) {
    scenario = s;
    for (const c of scenarioCards) c.classList.toggle('on', c.dataset.scenario === s.id);
    const mult = s.scoreMult ?? 1;
    scenarioDesc.textContent = s.description + (mult === 1 ? '' : ` Score × ${mult}.`);
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
