import { readFileSync } from 'node:fs';
import { createModel } from '../src/sim/model.js';

const network = JSON.parse(readFileSync('data/gzm/network.json', 'utf8'));
const population = JSON.parse(readFileSync('data/gzm/population.json', 'utf8'));
const sim = createModel(network, population);
const stops = [0, 1, 2, 3, 4].map(index => network.stops[Math.floor(index * (network.stops.length - 1) / 4)]);
const metro = {
  id: 'bench:metro', source: 'player', mode: 'metro', name: 'M1', headway: 5, active: true,
  stopIds: stops.map(stop => stop.id),
  geometry: [stops.map(stop => stop.pos)],
};
const disabled = Object.fromEntries(network.routes.map(route => [route.id, { active: false }]));
const halved = Object.fromEntries(network.routes.map(route => [route.id, { headway: Math.max(3, Math.floor(route.headway / 2)) }]));
const cases = [
  ['baseline', [], {}],
  ['disabled', [], disabled],
  ['metro-5', [metro], {}],
  ['halved-headway', [], halved],
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const previous = { passengers: 93253, wait: 23.61, travel: 86.78, sameMachineMs: 1021, documentedMs: 1700 };
for (const [name, routes, overrides] of cases) {
  const samples = [];
  let stats = null;
  for (let run = 0; run < 5; run++) {
    const started = performance.now();
    stats = sim.calculate(network, routes, [], overrides);
    samples.push(performance.now() - started);
  }
  const ms = median(samples);
  console.log(JSON.stringify({
    name,
    medianMs: +ms.toFixed(1),
    samples: samples.map(value => +value.toFixed(1)),
    buildMs: sim.timing().buildMs,
    passengers: stats.passengers,
    wait: stats.wait,
    travel: stats.travel,
  }));
  if (name === 'baseline') {
    const tripChange = (stats.passengers - previous.passengers) / previous.passengers;
    console.log(JSON.stringify({
      previousPassengers: previous.passengers,
      previousWait: previous.wait,
      previousTravel: previous.travel,
      tripChange: +tripChange.toFixed(4),
      versusDocumented1_7s: +(previous.documentedMs / ms).toFixed(2),
      versusSameMachineOld: +(previous.sameMachineMs / ms).toFixed(2),
    }));
  }
}
