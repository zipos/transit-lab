/* Keep metropolitan path searches off the UI thread. */
'use strict';
self.window = self;
importScripts('./sim.js?v=2026-09-28-region');
let model;
const baselines = {};
self.onmessage = ({ data }) => {
  const finish = () => {
    const daypart = data.daypart || 'peak';
    baselines[daypart] ||= model.calculate(model.network, [], [], {}, daypart);
    const stats = model.calculate(model.network, data.customRoutes, data.customStops, data.overrides, daypart);
    self.postMessage({ revision: data.revision, baseline: baselines[daypart], stats });
  };
  if (model) { finish(); return; }
  const ready = (network, population) => {
    model = self.TransitSim.createModel(network, population, { tripRate: data.tripRate });
    model.network = network;
    finish();
  };
  if (data.network && data.population) { ready(data.network, data.population); return; }
  Promise.all([fetch(data.networkUrl).then(response => response.json()), fetch(data.populationUrl).then(response => response.json())]).then(([network, population]) => ready(network, population));
};
