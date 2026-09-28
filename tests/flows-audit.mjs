/* Flow conservation, a faster parallel metro, and crowding. Run with Node.js. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createModel } from '../src/sim/model.js';
import { crowdMultiplier, choiceParams } from '../src/sim/params.js';
import { capacity } from '../src/modes.js';

const root = new URL('..', import.meta.url);
const network = JSON.parse(fs.readFileSync(new URL('./data/gzm/network.json', root), 'utf8'));
const population = JSON.parse(fs.readFileSync(new URL('./data/gzm/population.json', root), 'utf8'));
const sim = createModel(network, population);
const started = performance.now();
const stats = sim.calculate(network, [], [], {});
const fullMs = performance.now() - started;
const expected = stats.boardings;
const gap = Math.abs(stats.flows.boardingsTotal - expected) / Math.max(1, expected);
assert.equal(stats.passengers, 115332);
assert.equal(stats.flows.calibrated, false);
assert.ok(gap < 0.005, `boardings ${stats.flows.boardingsTotal} vs ${expected}`);
assert.ok(stats.flows.firstSegmentGap < 0.005, stats.flows.firstSegmentGap);
assert.equal(stats.asc, 0);

let slowest = 0;
const partials = [];
const zones = sim.zones.length;
for (let index = 0; index < 4; index++) {
  const start = Math.floor(index * zones / 4);
  const end = Math.floor((index + 1) * zones / 4);
  const sliceStarted = performance.now();
  partials.push(sim.calculate(network, [], [], {}, 'peak', { originStart: start, originEnd: end, partial: true }));
  slowest = Math.max(slowest, performance.now() - sliceStarted);
}
const merged = sim.combinePartials(partials);
assert.equal(merged.passengers, stats.passengers);
assert.ok(Math.abs(merged.flows.boardingsTotal - stats.flows.boardingsTotal) / expected < 0.005);
assert.ok(slowest < 2000, `slowest origin slice ${slowest.toFixed(0)} ms`);

function toy(routes) {
  const people = {
    cells: [
      { city: 'North', population: 80000, lon: 19, lat: 50.25 },
      { city: 'South', population: 80000, lon: 19, lat: 50.2 },
    ],
  };
  const stops = [
    { id: 'n', name: 'North', pos: [19, 50.25], area: 'n' },
    { id: 's', name: 'South', pos: [19, 50.2], area: 's' },
  ];
  const net = { stops, routes, areas: [], sources: [] };
  const model = createModel(net, people);
  return { net, model };
}
function line(id, mode, headway) {
  return { id, name: id, source: 'player', mode, headway, active: true, stopIds: ['n', 's'] };
}
function carried(result, routeId) {
  let sum = 0;
  for (const pattern of result.flows.layout) {
    if (pattern.routeId !== routeId) continue;
    for (let s = 0; s < pattern.km.length; s++) sum += result.flows.segmentDaily[pattern.offset + s];
  }
  return sum;
}

const parallel = toy([line('tram', 'tram', 8), line('metro', 'metro', 8)]);
const assigned = parallel.model.calculate(parallel.net, [], [], {});
assert.ok(carried(assigned, 'metro') > carried(assigned, 'tram'), 'a parallel metro should take the corridor');

function crowded(headway) {
  const built = toy([line('bus', 'bus', headway)]);
  const first = built.model.calculate(built.net, [], [], {});
  const scale = new Float32Array(first.flows.segmentDaily.length);
  scale.fill(1);
  for (const pattern of first.flows.layout) {
    const hourly = (60 / pattern.headway) * capacity[pattern.mode];
    for (let s = 0; s < pattern.km.length; s++) {
      const vc = first.flows.segmentDaily[pattern.offset + s] * choiceParams.peakHourShare / hourly;
      scale[pattern.offset + s] = crowdMultiplier(vc);
    }
  }
  const second = built.model.calculate(built.net, [], [], {}, 'peak', { segmentScale: scale });
  const daily = new Float32Array(first.flows.segmentDaily.length);
  for (let i = 0; i < daily.length; i++) daily[i] = 0.5 * first.flows.segmentDaily[i] + 0.5 * second.flows.segmentDaily[i];
  const blended = built.model.presentFlows(second, daily, second.flows.stopBoardings, second.flows.stopTransfers);
  return { first: first.flows.routes.bus.vc, crowded: blended.flows.routes.bus.vc };
}
const long = crowded(120);
const short = crowded(20);
assert.ok(long.first > 1, `the long headway should overload, v/c ${long.first}`);
assert.ok(short.crowded <= long.crowded, `shorter headway v/c ${short.crowded} vs ${long.crowded}`);

console.log(JSON.stringify({
  fullMs: Math.round(fullMs),
  slowestSliceMs: Math.round(slowest),
  boardingsGap: +gap.toFixed(4),
  firstSegmentGap: +stats.flows.firstSegmentGap.toFixed(4),
  overloaded: stats.flows.overloaded,
  metro: Math.round(carried(assigned, 'metro')),
  tram: Math.round(carried(assigned, 'tram')),
  longVc: +long.crowded.toFixed(3),
  shortVc: +short.crowded.toFixed(3),
}));
