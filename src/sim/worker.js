import { createModel } from './model.js?v=2026-09-28-zones';

let model;
const sliceBaseline = new Map();
let latestRevision = 0;
let pending = null;
let armed = false;

export function runJob(data, postMessage) {
  const finish = () => {
    const daypart = data.daypart || 'peak';
    const partial = data.originEnd != null;
    const live = () => !data.trackRevision || latestRevision === data.revision;
    const hooks = {
      originStart: data.originStart || 0,
      originEnd: partial ? data.originEnd : undefined,
      partial,
      shouldContinue: data.trackRevision ? live : undefined,
      onProgress: (fraction) => postMessage({ revision: data.revision, progress: fraction, workerIndex: data.workerIndex ?? 0 }),
    };
    if (!live()) return;
    if (!partial) {
      const baseline = data.compare
        ? model.calculate(model.network, data.compare.customRoutes || [], data.compare.customStops || [], data.compare.overrides || {}, daypart)
        : (sliceBaseline.get(daypart) || sliceBaseline.set(daypart, model.calculate(model.network, [], [], {}, daypart)).get(daypart));
      const stats = model.calculate(model.network, data.customRoutes, data.customStops, data.overrides, daypart, hooks);
      if (!stats || !live()) return;
      postMessage({ revision: data.revision, baseline, stats, compareId: data.compareId || null });
      return;
    }
    const quiet = { ...hooks, onProgress: undefined };
    let baseline = null;
    if (!data.skipBaseline && !data.compare) {
      const key = `${daypart}:${hooks.originStart}:${hooks.originEnd}`;
      baseline = sliceBaseline.get(key) || null;
      if (!baseline) {
        baseline = model.calculate(model.network, [], [], {}, daypart, quiet);
        if (baseline) sliceBaseline.set(key, baseline);
      }
    }
    if (!live()) return;
    const compare = data.compare
      ? model.calculate(model.network, data.compare.customRoutes || [], data.compare.customStops || [], data.compare.overrides || {}, daypart, quiet)
      : null;
    if (!live()) return;
    const stats = model.calculate(model.network, data.customRoutes, data.customStops, data.overrides, daypart, hooks);
    if (!stats || !compare && data.compare || !live()) return;
    postMessage({
      revision: data.revision,
      baseline,
      stats,
      compare,
      compareId: data.compareId || null,
      partial: true,
      workerIndex: data.workerIndex ?? 0,
    });
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
    fetch(data.populationUrl).then(response => response.json()),
  ]).then(([network, population]) => ready(network, population));
}

export function acceptJob(data, postMessage) {
  pending = data;
  latestRevision = data.revision || 0;
  data.trackRevision = true;
  if (armed) return;
  armed = true;
  setTimeout(() => {
    armed = false;
    const job = pending;
    pending = null;
    if (!job) return;
    runJob(job, (message) => {
      if (message.progress != null) {
        if (latestRevision === job.revision) postMessage(message);
        return;
      }
      if (!pending && latestRevision === job.revision) postMessage(message);
    });
  }, 0);
}

const scope = globalThis;
if (typeof scope.WorkerGlobalScope !== 'undefined' && scope instanceof scope.WorkerGlobalScope) {
  scope.onmessage = ({ data }) => { acceptJob(data, message => scope.postMessage(message)); };
}
