// The setup screen: name your strain, pick a strain and a difficulty, then deploy.
// (Phase 5 puts a proper title screen in front of this.)

import { $, el } from './dom.js';
import { MAX_NAME } from '../save.js';

export function showSetup(data, profile, onStart) {
  const overlay = $('#overlay');
  let strain = data.strains.find((s) => s.id === profile.lastStrain) ?? data.strains[0];
  let difficulty = data.difficulties.find((d) => d.id === profile.lastDifficulty) ?? data.difficulties[1];

  const strainCards = data.strains.map((s) =>
    el('button', { class: 'card strain', type: 'button', 'data-strain': s.id, onclick: () => pickStrain(s) },
      el('strong', {}, s.name), el('span', {}, s.tagline)),
  );
  const diffButtons = data.difficulties.map((d) =>
    el('button', { class: 'seg', type: 'button', 'data-difficulty': d.id, title: d.description, onclick: () => pickDifficulty(d) }, d.name),
  );
  const name = el('input', {
    id: 'strain-name', type: 'text', maxlength: String(MAX_NAME), autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Name your strain', value: profile.strainName,
  });
  const desc = el('p', { class: 'desc' });
  const start = el('button', { id: 'start', class: 'primary', type: 'submit' }, 'Deploy');

  const form = el('form', { class: 'panel setup', onsubmit: (e) => {
    e.preventDefault();
    overlay.replaceChildren();
    overlay.hidden = true;
    onStart({ strainId: strain.id, difficultyId: difficulty.id, strainName: name.value });
  } },
    el('h1', { class: 'logo' }, 'PLAGUE', el('span', {}, 'IT')),
    el('p', { class: 'kicker' }, 'You are the malware. One laptop. Every endpoint. Before SecOps finds you.'),
    el('label', { for: 'strain-name' }, 'Strain name'), name,
    el('div', { class: 'label' }, 'Strain'), el('div', { class: 'cards' }, strainCards), desc,
    el('div', { class: 'label' }, 'Difficulty'), el('div', { class: 'segs' }, diffButtons),
    start,
  );

  function pickStrain(s) {
    strain = s;
    for (const c of strainCards) c.classList.toggle('on', c.dataset.strain === s.id);
    desc.textContent = s.description;
  }
  function pickDifficulty(d) {
    difficulty = d;
    for (const b of diffButtons) b.classList.toggle('on', b.dataset.difficulty === d.id);
  }
  pickStrain(strain);
  pickDifficulty(difficulty);
  overlay.replaceChildren(form);
  overlay.hidden = false;
}
