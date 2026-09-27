/* Keep metropolitan path searches off the UI thread. */
'use strict';
self.window = self;
importScripts('./data/network.js?v=2026-09-26-region-2', './data/population-density.js?v=2026-09-23-gzm-v4', './sim.js?v=2026-09-28-dayparts');
const baselines = {};
self.onmessage = ({ data }) => {
  const daypart = data.daypart || 'peak';
  baselines[daypart] ||= TransitSim.calculate(GZM_NETWORK, [], [], {}, daypart);
  const stats = TransitSim.calculate(GZM_NETWORK, data.customRoutes, data.customStops, data.overrides, daypart);
  self.postMessage({ revision: data.revision, baseline: baselines[daypart], stats });
};
