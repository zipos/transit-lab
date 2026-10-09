/* Challenge catalog: baseline earns 0★; fixture solutions earn their claimed stars. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createModel } from '../src/sim/model.js';
import { evaluateChallenge, odMinutesForChallenge } from '../src/challenges.js';
import { summarizeBudget } from '../src/sim/budget.js';

const root = new URL('..', import.meta.url);
const network = JSON.parse(fs.readFileSync(new URL('./data/gzm/network.json', root), 'utf8'));
const population = JSON.parse(fs.readFileSync(new URL('./data/gzm/population.json', root), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(new URL('./regions/gzm/challenges.json', root), 'utf8'));
const sim = createModel(network, population);
const challenges = catalog.challenges || [];
assert.ok(challenges.length >= 5, 'GZM ships at least 5 challenges');

const baseline = sim.calculate(network, [], [], {}, 'peak');
const emptyBudget = summarizeBudget({
  customRoutes: [],
  overrides: {},
  publishedRoutes: network.routes,
  stopLookup: id => network.stops.find(stop => stop.id === id),
  km: sim.km,
  resolveService: (route, daypart) => sim.resolveService(route, daypart),
  stats: baseline,
  baseline,
  budgetCap: catalog.budgetDefaultPLN || 5e9,
});

for (const challenge of challenges) {
  const od = odMinutesForChallenge(challenge, sim, network, { customRoutes: [], customStops: [], overrides: {} }, 'peak');
  const empty = evaluateChallenge(challenge, {
    stats: baseline,
    baseline,
    budget: emptyBudget,
    odMinutes: od,
  });
  assert.equal(empty.stars, 0, `${challenge.id} baseline must earn 0★ (got ${empty.stars})`);
}

const fixturesDir = new URL('./tests/fixtures/challenges/', root);
const fixtures = fs.existsSync(fixturesDir) ? fs.readdirSync(fixturesDir).filter(name => name.endsWith('.json')) : [];
assert.ok(fixtures.length >= 1, 'at least one challenge fixture is required');

for (const file of fixtures) {
  const fixture = JSON.parse(fs.readFileSync(path.join(fixturesDir.pathname, file), 'utf8'));
  const challenge = challenges.find(item => item.id === fixture.id);
  assert.ok(challenge, `fixture ${file} maps to a catalog challenge`);
  const scenario = fixture.scenario || {};
  const customRoutes = scenario.customRoutes || [];
  const customStops = scenario.customStops || [];
  const overrides = scenario.overrides || {};
  const stats = sim.calculate(network, customRoutes, customStops, overrides, 'peak');
  const od = odMinutesForChallenge(challenge, sim, network, scenario, 'peak');
  const stopLookup = id => customStops.find(stop => stop.id === id) || network.stops.find(stop => stop.id === id);
  const budget = summarizeBudget({
    customRoutes,
    overrides,
    publishedRoutes: network.routes,
    stopLookup,
    km: sim.km,
    resolveService: (route, daypart) => sim.resolveService(route, daypart),
    stats,
    baseline,
    budgetCap: challenge.constraints?.budgetPLN || catalog.budgetDefaultPLN,
  });
  const verdict = evaluateChallenge(challenge, { stats, baseline, budget, odMinutes: od });
  assert.ok(
    verdict.stars >= fixture.claimedStars,
    `${fixture.id} claimed ${fixture.claimedStars}★ but earned ${verdict.stars}★ (od=${od?.toFixed?.(1)}, capital=${Math.round(budget.capital / 1e6)}m)`,
  );
  console.log(`${fixture.id}: ${verdict.stars}★ (claimed ${fixture.claimedStars}) · od ${od?.toFixed?.(1) ?? '—'} min`);
}

console.log(`challenges-audit ok · ${challenges.length} challenges · ${fixtures.length} fixtures`);
