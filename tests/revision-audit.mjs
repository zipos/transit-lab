import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createModel } from '../src/sim/model.js';
import { acceptJob } from '../src/sim/worker.js';

const network = JSON.parse(readFileSync('data/gzm/network.json', 'utf8'));
const population = JSON.parse(readFileSync('data/gzm/population.json', 'utf8'));
const sim = createModel(network, population);
const zones = sim.zones.length;
const full = sim.calculate(network, [], [], {});
const slices = 4;
const partials = [];
for (let index = 0; index < slices; index++) {
  const originStart = Math.floor(index * zones / slices);
  const originEnd = Math.floor((index + 1) * zones / slices);
  partials.push(sim.calculate(network, [], [], {}, 'peak', { originStart, originEnd, partial: true }));
}
assert.deepEqual(sim.combinePartials(partials), full, 'origin slices add back to one full run');

let checks = 0;
assert.equal(sim.calculate(network, [], [], {}, 'peak', { shouldContinue: () => ++checks < 2 }), null, 'a new revision stops at the next origin');

const received = [];
const job = revision => ({
  revision,
  network,
  population,
  customRoutes: [],
  customStops: [],
  overrides: {},
  daypart: 'peak',
  originStart: 0,
  originEnd: 1,
  workerIndex: 0,
});
acceptJob(job(1), message => received.push(message));
acceptJob(job(2), message => received.push(message));
acceptJob(job(3), message => received.push(message));
await new Promise(resolve => setTimeout(resolve, 1500));
const stats = received.filter(message => message.stats);
assert.deepEqual(stats.map(message => message.revision), [3], 'rapid revisions 1, 2 and 3 publish only revision 3');
assert.equal(received.some(message => message.revision === 1 || message.revision === 2), false);
console.log('Revision audit passed', { messages: received.length, passengers: full.passengers });
