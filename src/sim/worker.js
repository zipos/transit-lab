import { createModel } from './model.js?v=2026-09-28-share';

let model;
const baselines = {};

export function runJob(data, postMessage) {
  const finish = () => {
    const daypart = data.daypart || 'peak';
    const baseline = data.compare
      ? model.calculate(model.network, data.compare.customRoutes || [], data.compare.customStops || [], data.compare.overrides || {}, daypart)
      : (baselines[daypart] ||= model.calculate(model.network, [], [], {}, daypart));
    const stats = model.calculate(model.network, data.customRoutes, data.customStops, data.overrides, daypart);
    postMessage({ revision: data.revision, baseline, stats, compareId: data.compareId || null });
  };
  if (model) { finish(); return; }
  const ready = (network, population) => {
    model = createModel(network, population, { tripRate: data.tripRate });
    model.network = network;
    finish();
  };
  if (data.network && data.population) { ready(data.network, data.population); return; }
  return Promise.all([
    fetch(data.networkUrl).then(response => response.json()),
    fetch(data.populationUrl).then(response => response.json())
  ]).then(([network, population]) => ready(network, population));
}

const scope = globalThis;
if (typeof scope.WorkerGlobalScope !== 'undefined' && scope instanceof scope.WorkerGlobalScope) {
  scope.onmessage = ({ data }) => { runJob(data, message => scope.postMessage(message)); };
}
