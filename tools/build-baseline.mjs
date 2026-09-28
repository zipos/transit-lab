import { readFileSync, writeFileSync } from 'node:fs';
import { createModel, modelVersion } from '../src/sim/model.js';

const region = process.argv[2];
if (!region) {
  console.error('Usage: node tools/build-baseline.mjs <region>');
  process.exit(1);
}
const network = JSON.parse(readFileSync(`data/${region}/network.json`, 'utf8'));
const population = JSON.parse(readFileSync(`data/${region}/population.json`, 'utf8'));
const manifest = JSON.parse(readFileSync(`regions/${region}/region.json`, 'utf8'));
const sim = createModel(network, population, { tripRate: manifest.demand?.tripRate, choice: manifest.demand?.choice });
const stats = sim.calculate(network, [], [], {}, 'peak');
const baseline = { modelVersion, networkVersion: network.version, daypart: 'peak', stats };
writeFileSync(`data/${region}/baseline.json`, `${JSON.stringify(baseline)}\n`);
console.log(`Wrote data/${region}/baseline.json`, { modelVersion, networkVersion: network.version, passengers: stats.passengers, wait: stats.wait, travel: stats.travel });
