// Balance: headless games played by the autopilot (src/sim/bot.js) for every strain and
// difficulty. Each must be winnable (a sensible plan wins at least one of several seeds)
// and losable (doing nothing, or going loud too early, loses).
// If you change numbers in data/ and these fail, the game got too easy or too hard.

import { assert } from './harness.mjs';
import { DATA } from '../data/index.js';
import { createWorld } from '../src/sim/world.js';
import { playGame } from '../src/sim/bot.js';

const world = createWorld(DATA);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const STARTS = ['us-ny', 'us-tx', 'ca-bc', 'ca-on'];

const summary = (games) => games.map((s) => `${s.status} day ${Math.floor(s.endedAt / 24)}`).join(', ');

export const tests = [];
for (const strain of DATA.strains) {
  for (const diff of DATA.difficulties) {
    tests.push([`${strain.name} on ${diff.name}: can be won`, () => {
      const games = SEEDS.map((seed, i) => playGame(world, { strainId: strain.id, difficultyId: diff.id, seed, start: STARTS[i % STARTS.length], plan: 'smart' }));
      assert(games.every((s) => s.status !== 'running'), 'a game never ended: ' + summary(games));
      assert(games.some((s) => s.status === 'won'), 'the smart plan never won: ' + summary(games));
    }]);
    tests.push([`${strain.name} on ${diff.name}: can be lost`, () => {
      for (const plan of ['idle', 'reckless']) {
        const games = SEEDS.slice(0, 4).map((seed, i) => playGame(world, { strainId: strain.id, difficultyId: diff.id, seed, start: STARTS[i % STARTS.length], plan }));
        assert(games.some((s) => s.status === 'lost'), `the ${plan} plan never lost: ${summary(games)}`);
      }
    }]);
  }
  tests.push([`${strain.name}: a game lasts a sensible time`, () => {
    for (const seed of [1, 2, 3]) {
      const s = playGame(world, { strainId: strain.id, seed, plan: 'smart' });
      const days = s.endedAt / 24;
      assert(days > 20 && days < 200, `seed ${seed}: game ended on day ${days}`);
      assert(s.detectedAt !== null && s.detectedAt / 24 > 5, `seed ${seed}: detected on day ${s.detectedAt / 24}`);
      const minutes = s.endedAt / DATA.balance.ticksPerSecond / 60;
      assert(minutes >= 6 && minutes <= 25, `seed ${seed}: a 1× game takes ${minutes.toFixed(1)} real minutes; aim for 6–25`);
    }
  }]);
}

// Every scenario can be won (on some difficulty) and lost (on Normal) with the Worm.
for (const sc of DATA.scenarios.filter((x) => x.id !== 'standard')) {
  const w = createWorld(DATA, sc.id);
  tests.push([`scenario ${sc.name}: can be won and lost`, () => {
    const won = ['understaffed', 'normal'].some((difficultyId) =>
      SEEDS.some((seed, i) => playGame(w, { difficultyId, seed, start: STARTS[i % STARTS.length], plan: 'smart' }).status === 'won'));
    assert(won, 'the smart plan never won');
    const lost = SEEDS.slice(0, 4).some((seed) => playGame(w, { seed, plan: 'idle' }).status === 'lost');
    assert(lost, 'doing nothing never lost');
  }]);
}

