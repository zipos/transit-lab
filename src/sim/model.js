/* Deterministic accessibility model. All outputs are estimates, never observed ridership. */
import { modes, cruiseSpeed, capacity as seats, costPerKm as rate } from '../modes.js';

export const modelVersion = 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = Math.PI / 180;
  function km(a, b) {
    const dLat = (b[1] - a[1]) * rad;
    const dLon = (b[0] - a[0]) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function createModel(network, population, options = {}) {
  const zones = [];
  const zoneResidents = [];
  const zoneAttraction = [];
  const zoneCities = [];
  // Each municipality has at least one demand anchor; larger ones have two.
  // Homes use the published residents. Daytime destinations are a transparent
  // centrality/density proxy, not observed workplaces, schools or shops.
  const populationCells = population?.cells || [];
  const cellsByCity = new Map();
  for (const cell of populationCells) {
    if (!(+cell.population > 0)) continue;
    if (!cellsByCity.has(cell.city)) cellsByCity.set(cell.city, []);
    cellsByCity.get(cell.city).push(cell);
  }
  for (const [city, cells] of cellsByCity) {
    const total = cells.reduce((sum, c) => sum + +c.population, 0);
    const count = total >= 80000 && cells.length > 1 ? 2 : 1;
    const center = [cells.reduce((s, c) => s + c.lon * c.population, 0) / total, cells.reduce((s, c) => s + c.lat * c.population, 0) / total];
    const seeds = [center];
    if (count > 1) {
      const far = cells.reduce((best, c) => c.population * km([c.lon, c.lat], center) > best.population * km([best.lon, best.lat], center) ? c : best);
      seeds.push([far.lon, far.lat]);
    }
    const groups = Array.from({ length: count }, () => []);
    for (const c of cells) {
      const p = [c.lon, c.lat];
      const idx = count === 1 || km(p, seeds[0]) <= km(p, seeds[1]) ? 0 : 1;
      groups[idx].push(c);
    }
    for (const [index, group] of groups.entries()) {
      if (!group.length) continue;
      const residents = group.reduce((s, c) => s + +c.population, 0);
      const lon = group.reduce((s, c) => s + c.lon * c.population, 0) / residents;
      const lat = group.reduce((s, c) => s + c.lat * c.population, 0) / residents;
      const density = group.reduce((s, c) => s + c.population * c.population, 0) / residents;
      const centrality = 1 / (1 + km([lon, lat], center) / 7);
      zones.push([count === 1 ? city : `${city} ${index + 1}`, lon, lat]);
      zoneResidents.push(residents);
      zoneAttraction.push(Math.sqrt(residents) * (0.6 + Math.log1p(density) / 8) * (0.7 + centrality));
      zoneCities.push(city);
    }
  }
  const residentTotal = zoneResidents.reduce((a, b) => a + b, 0);
  // 0.6 potential cross-neighborhood journeys per resident/day is a game
  // assumption, not a published travel survey result.
  const tripRate = Number(options.tripRate) > 0 ? Number(options.tripRate) : 0.6;
  const estimatedDemand = residentTotal > 0 ? Math.round(residentTotal * tripRate) : 90000;
  const meanResidents = residentTotal / zones.length || 1;
  const originWeights = zoneResidents.map(n => n / meanResidents);
  const meanAttraction = zoneAttraction.reduce((a, b) => a + b, 0) / zones.length || 1;
  const destinationWeights = zoneAttraction.map(n => n / meanAttraction);
  const TRANSFER_PENALTY = 4;
  const ALIGHT = 0.3;
  let scratch = null;
  function scratchFor(nodes) {
    const heapCap = nodes * 8;
    if (!scratch || scratch.dist.length < nodes || scratch.heapKeys.length < heapCap) {
      const nodeCap = Math.max(nodes, scratch ? Math.max(scratch.dist.length, nodes) : nodes);
      const cap = Math.max(heapCap, scratch ? scratch.heapKeys.length : 0);
      scratch = {
        dist: new Float64Array(nodeCap),
        wait: new Float64Array(nodeCap),
        boards: new Uint16Array(nodeCap),
        targets: new Uint8Array(nodeCap),
        heapKeys: new Float64Array(cap),
        heapVals: new Int32Array(cap),
      };
    }
    return scratch;
  }
  function heapPush(keys, vals, n, key, val) {
    let i = n;
    keys[i] = key;
    vals[i] = val;
    while (i) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
    return n + 1;
  }
  const popped = { n: 0, key: 0, val: 0 };
  function heapPop(keys, vals, n, out) {
    out.key = keys[0];
    out.val = vals[0];
    n -= 1;
    if (n > 0) {
      const x = keys[n];
      const xv = vals[n];
      let i = 0;
      while (i * 2 + 1 < n) {
        let j = i * 2 + 1;
        if (j + 1 < n && keys[j + 1] < keys[j]) j++;
        if (keys[j] >= x) break;
        keys[i] = keys[j];
        vals[i] = vals[j];
        i = j;
      }
      keys[i] = x;
      vals[i] = xv;
    }
    out.n = n;
  }
  function resolveService(route, daypart = 'peak') {
    const headwayOf = value => clamp(Number(value) || 30, 3, 120);
    if (route.source === 'player' || !route.dayparts) {
      const headway = headwayOf(route.headway);
      return { runs: true, headway, times: null, departures: 840 / headway };
    }
    const part = route.dayparts[daypart];
    if (daypart !== 'peak' && !part) return { runs: false, headway: headwayOf(route.headway), times: null, departures: 0 };
    const publishedPeak = Number(route.baseHeadway);
    const intervalEdited = Number.isFinite(publishedPeak) && Number(route.headway) !== publishedPeak;
    const headway = intervalEdited ? headwayOf(route.headway) : headwayOf(daypart === 'peak' || !part ? route.headway : part.headway);
    const times = part && Array.isArray(part.times) ? part.times : (daypart === 'peak' && Array.isArray(route.times) ? route.times : null);
    let departures;
    if (daypart === 'peak' || !part) {
      const baseHeadway = Number(route.baseHeadway);
      departures = Number.isFinite(Number(route.dailyTrips)) && Number.isFinite(baseHeadway) && baseHeadway > 0
        ? Number(route.dailyTrips) * baseHeadway / headway
        : 840 / headway;
    } else if (Number.isFinite(Number(part.trips))) {
      departures = Number(part.trips) * headwayOf(part.headway) / headway;
    } else if (Number.isFinite(Number(route.dailyTrips)) && Number.isFinite(publishedPeak) && publishedPeak > 0) {
      departures = Number(route.dailyTrips) * publishedPeak / headway;
    } else departures = 840 / headway;
    return { runs: true, headway, times, departures };
  }
  const K_RIDE = 0, K_BOARD = 1, K_TRANSFER = 2, K_ALIGHT = 3, K_WALK = 4;
  let lastTiming = { buildMs: 0, searchMs: 0, nodes: 0, edges: 0 };
  let publishedAccess = null;
  const straightKm = zones.map((origin, i) => zones.map((destination, j) => i === j ? 0 : km([origin[1], origin[2]], [destination[1], destination[2]])));
  function nearestStops(list, shift) {
    return zones.map(zone => {
      const point = [zone[1], zone[2]];
      const nearby = [];
      for (let index = 0; index < list.length; index++) {
        const distance = km(point, list[index].pos);
        if (distance < 1.4) nearby.push([index + shift, distance]);
      }
      nearby.sort((a, b) => a[1] - b[1]);
      return nearby.slice(0, 8);
    });
  }
  function blankLocal() {
    return Object.fromEntries([...new Set(zoneCities)].map(city => [city, { demand: 0, riders: 0, satisfaction: 0 }]));
  }
  function project(sums, serviceKm, seatTrips) {
    const passengerCount = Math.round(estimatedDemand * sums.riders / Math.max(1, sums.demandTotal));
    const cityStats = Object.fromEntries(Object.entries(sums.local).map(([city, value]) => [city, {
      passengers: Math.round(estimatedDemand * value.riders / Math.max(1, sums.demandTotal)),
      coverage: +(100 * value.riders / Math.max(1, value.demand)).toFixed(2),
      satisfaction: +(value.satisfaction / Math.max(1, value.riders)).toFixed(2),
    }]));
    return {
      demandPopulation: residentTotal,
      demandTrips: estimatedDemand,
      passengers: passengerCount,
      satisfaction: +(sums.satisfaction / Math.max(1, sums.reachedWeight)).toFixed(2),
      wait: +(sums.waitTotal / Math.max(1, sums.reachedWeight)).toFixed(2),
      travel: +(sums.travelTotal / Math.max(1, sums.reachedWeight)).toFixed(2),
      transfers: +(sums.transferTotal / Math.max(1, sums.reachedWeight)).toFixed(2),
      load: Math.round(clamp(passengerCount / Math.max(1, seatTrips) * 100, 0, 150)),
      cost: Math.round(serviceKm),
      coverage: +(sums.riders / Math.max(1, sums.demandTotal) * 100).toFixed(2),
      cityStats,
    };
  }
  function calculate(network, customRoutes, customStops, overrides, daypart = 'peak', hooks = {}) {
    const started = performance.now();
    const routes = network.routes.concat(customRoutes).map(route => ({ ...route, ...(overrides[route.id] || {}) })).filter(route => route.active !== false);
    const stops = network.stops.concat(customStops);
    const stopIndex = new Map(stops.map((stop, index) => [stop.id, index]));
    const stopCount = stops.length;
    const raw = [];
    const link = (from, to, mins, wait, board, kind) => { raw.push(from, to, mins, wait, board, kind); };
    const cells = new Map();
    const cellKey = (lon, lat) => `${Math.floor(lon / .003)}:${Math.floor(lat / .003)}`;
    for (let index = 0; index < stopCount; index++) {
      const stop = stops[index];
      const key = cellKey(stop.pos[0], stop.pos[1]);
      let bucket = cells.get(key);
      if (!bucket) cells.set(key, bucket = []);
      bucket.push(index);
    }
    for (let index = 0; index < stopCount; index++) {
      const stop = stops[index];
      const x = Math.floor(stop.pos[0] / .003);
      const y = Math.floor(stop.pos[1] / .003);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const bucket = cells.get(`${x + dx}:${y + dy}`);
        if (!bucket) continue;
        for (let n = 0; n < bucket.length; n++) {
          const other = bucket[n];
          if (index >= other) continue;
          const dist = km(stop.pos, stops[other].pos);
          if (dist > .34) continue;
          const sameArea = stop.area && stop.area === stops[other].area;
          const walk = sameArea ? 2 : 1.2 + dist / 4.5 * 60;
          link(stopCount + index, 2 * stopCount + other, walk, 0, 0, K_WALK);
          link(stopCount + other, 2 * stopCount + index, walk, 0, 0, K_WALK);
        }
      }
    }
    function routeDistanceFactor(route, sequence) {
      const fallback = route.mode === 'metro' ? 1.08 : 1.2;
      if (route.edited || !Array.isArray(route.geometry)) return fallback;
      let stopLength = 0, shapeLength = 0;
      for (let i = 1; i < sequence.length; i++) stopLength += km(stops[sequence[i - 1]].pos, stops[sequence[i]].pos);
      for (const segment of route.geometry) {
        if (!Array.isArray(segment)) continue;
        for (let i = 1; i < segment.length; i++) shapeLength += km(segment[i - 1], segment[i]);
      }
      const ratio = shapeLength / stopLength;
      return stopLength > 1 && Number.isFinite(ratio) && ratio >= .95 && ratio <= 1.7
        ? clamp(ratio, 1.02, 1.6)
        : fallback;
    }
    let serviceKm = 0, seatTrips = 0, nextNode = 3 * stopCount;
    const canAlight = new Uint8Array(stopCount);
    for (const route of routes) {
      const sequence = [];
      for (const id of route.stopIds) {
        const index = stopIndex.get(id);
        if (index !== undefined) sequence.push(index);
      }
      if (sequence.length < 2) continue;
      const service = resolveService(route, daypart);
      if (!service.runs) continue;
      const headway = service.headway;
      const distanceFactor = routeDistanceFactor(route, sequence);
      const departures = service.departures;
      const noBoard = new Set(route.noBoard || []);
      const noAlight = new Set(route.noAlight || []);
      const ring = route.source === 'player' && route.ring === true && sequence.length >= 3;
      const directions = route.source === 'player' && !ring ? [sequence, sequence.slice().reverse()] : [sequence];
      for (const direction of directions) {
        const base = nextNode;
        nextNode += direction.length;
        const indexed = direction === sequence;
        const useTimes = indexed && !route.edited && Array.isArray(service.times) && service.times.length === sequence.length;
        const waitMin = headway / 2;
        let length = 0;
        for (let i = 0; i < direction.length; i++) {
          const stop = direction[i];
          const onboard = base + i;
          if (!indexed || !noBoard.has(i)) {
            link(stop, onboard, waitMin + 1, waitMin, 1, K_BOARD);
            link(stopCount + stop, onboard, waitMin + 1 + TRANSFER_PENALTY, waitMin, 1, K_TRANSFER);
            link(2 * stopCount + stop, onboard, waitMin + 1 + TRANSFER_PENALTY, waitMin, 1, K_TRANSFER);
          }
          if (!indexed || !noAlight.has(i)) { link(onboard, stopCount + stop, ALIGHT, 0, 0, K_ALIGHT); canAlight[stop] = 1; }
          if (i < direction.length - 1 || ring) {
            const next = (i + 1) % direction.length;
            const distance = km(stops[stop].pos, stops[direction[next]].pos) * distanceFactor;
            length += distance;
            const ride = useTimes && next > i
              ? Math.max(ALIGHT, service.times[next] - service.times[i])
              : modes[route.mode].dwell + distance / cruiseSpeed[route.mode] * 60;
            link(onboard, base + next, ride, 0, 0, K_RIDE);
          }
        }
        serviceKm += length * departures * rate[route.mode];
        seatTrips += departures * seats[route.mode];
      }
    }
    const nodeCount = nextNode;
    const edgeCount = raw.length / 6;
    // Full rebuild on each scenario. On the GZM snapshot this is about 20–50 ms,
    // under the 60 ms limit, so a static base graph plus an overflow block is unnecessary.
    const degree = new Uint32Array(nodeCount);
    for (let i = 0; i < raw.length; i += 6) degree[raw[i]]++;
    const offset = new Uint32Array(nodeCount + 1);
    for (let i = 0; i < nodeCount; i++) offset[i + 1] = offset[i] + degree[i];
    const cursor = new Uint32Array(offset);
    const target = new Int32Array(edgeCount);
    const edgeCost = new Float32Array(edgeCount);
    const edgeWait = new Float32Array(edgeCount);
    const edgeBoard = new Uint8Array(edgeCount);
    const edgeKind = new Uint8Array(edgeCount);
    for (let i = 0; i < raw.length; i += 6) {
      const at = cursor[raw[i]]++;
      target[at] = raw[i + 1];
      edgeCost[at] = raw[i + 2];
      edgeWait[at] = raw[i + 3];
      edgeBoard[at] = raw[i + 4];
      edgeKind[at] = raw[i + 5];
    }
    const built = performance.now();
    if (!publishedAccess) publishedAccess = nearestStops(network.stops, 0);
    const customAccess = customStops.length ? nearestStops(customStops, network.stops.length) : null;
    const zoneStops = customAccess
      ? publishedAccess.map((list, index) => list.concat(customAccess[index]))
      : publishedAccess;
    const sums = {
      demandTotal: 0, riders: 0, satisfaction: 0, waitTotal: 0, travelTotal: 0, transferTotal: 0, reachedWeight: 0,
      local: blankLocal(),
    };
    const targets = [];
    const listed = new Uint8Array(stopCount);
    for (let zone = 0; zone < zoneStops.length; zone++) {
      const access = zoneStops[zone];
      for (let n = 0; n < access.length; n++) {
        const stop = access[n][0];
        if (!canAlight[stop] || listed[stop]) continue;
        listed[stop] = 1;
        targets.push(stopCount + stop);
      }
    }
    const state = scratchFor(nodeCount);
    const isTarget = state.targets;
    isTarget.fill(0, 0, nodeCount);
    for (let n = 0; n < targets.length; n++) isTarget[targets[n]] = 1;
    const dist = state.dist;
    const pathWait = state.wait;
    const boards = state.boards;
    const heapKeys = state.heapKeys;
    const heapVals = state.heapVals;
    const originStart = hooks.originStart || 0;
    const originEnd = hooks.originEnd == null ? zones.length : hooks.originEnd;
    const span = Math.max(1, originEnd - originStart);
    const progressStep = Math.max(1, Math.floor(span / 10));
    let cancelled = false;
    for (let origin = originStart; origin < originEnd; origin++) {
      if (hooks.shouldContinue && !hooks.shouldContinue()) { cancelled = true; break; }
      if (hooks.onProgress && (origin - originStart) % progressStep === 0) hooks.onProgress((origin - originStart) / span);
      dist.fill(Infinity, 0, nodeCount);
      pathWait.fill(0, 0, nodeCount);
      boards.fill(0, 0, nodeCount);
      let heapSize = 0;
      let remaining = targets.length;
      const originAccess = zoneStops[origin];
      for (let n = 0; n < originAccess.length; n++) {
        const access = originAccess[n][1] / 4.5 * 60;
        const node = originAccess[n][0];
        if (access < dist[node]) {
          dist[node] = access;
          heapSize = heapPush(heapKeys, heapVals, heapSize, access, node);
        }
      }
      while (heapSize) {
        heapPop(heapKeys, heapVals, heapSize, popped);
        heapSize = popped.n;
        const at = popped.val;
        if (popped.key > dist[at] + 1e-8) continue;
        if (isTarget[at] && --remaining === 0) break;
        for (let edge = offset[at]; edge < offset[at + 1]; edge++) {
          const next = popped.key + edgeCost[edge];
          const to = target[edge];
          if (next + 1e-8 < dist[to]) {
            dist[to] = next;
            pathWait[to] = pathWait[at] + edgeWait[edge];
            boards[to] = boards[at] + edgeBoard[edge];
            heapSize = heapPush(heapKeys, heapVals, heapSize, next, to);
          }
        }
      }
      for (let destination = 0; destination < zones.length; destination++) {
        if (origin === destination) continue;
        const straight = straightKm[origin][destination];
        const weight = originWeights[origin] * destinationWeights[destination] / (1 + straight / 6);
        sums.demandTotal += weight;
        sums.local[zoneCities[origin]].demand += weight;
        let best = Infinity, bestNode = -1;
        const access = zoneStops[destination];
        for (let n = 0; n < access.length; n++) {
          const node = stopCount + access[n][0];
          const time = dist[node] + access[n][1] / 4.5 * 60;
          if (time < best) { best = time; bestNode = node; }
        }
        if (!Number.isFinite(best) || boards[bestNode] === 0) continue;
        const reference = Math.max(8, straight / 28 * 60);
        const share = clamp(1 / (1 + Math.exp((best - reference * 1.65 - 11) / 8)), 0, 1);
        const served = weight * share;
        const score = clamp(93 - (best - reference) * .72, 8, 96);
        sums.riders += served;
        sums.reachedWeight += served;
        sums.satisfaction += score * served;
        sums.local[zoneCities[origin]].riders += served;
        sums.local[zoneCities[origin]].satisfaction += score * served;
        sums.waitTotal += pathWait[bestNode] * served;
        sums.travelTotal += best * served;
        sums.transferTotal += Math.max(0, boards[bestNode] - 1) * served;
      }
    }
    if (hooks.onProgress && !cancelled) hooks.onProgress(1);
    const finished = performance.now();
    lastTiming = { buildMs: +(built - started).toFixed(1), searchMs: +(finished - built).toFixed(1), nodes: nodeCount, edges: edgeCount };
    if (cancelled) return null;
    if (hooks.partial) return { ...sums, serviceKm, seatTrips };
    return project(sums, serviceKm, seatTrips);
  }
  function combinePartials(partials) {
    const total = {
      demandTotal: 0, riders: 0, satisfaction: 0, waitTotal: 0, travelTotal: 0, transferTotal: 0, reachedWeight: 0,
      local: blankLocal(),
    };
    for (const part of partials) {
      total.demandTotal += part.demandTotal;
      total.riders += part.riders;
      total.satisfaction += part.satisfaction;
      total.waitTotal += part.waitTotal;
      total.travelTotal += part.travelTotal;
      total.transferTotal += part.transferTotal;
      total.reachedWeight += part.reachedWeight;
      for (const city of Object.keys(part.local)) {
        total.local[city].demand += part.local[city].demand;
        total.local[city].riders += part.local[city].riders;
        total.local[city].satisfaction += part.local[city].satisfaction;
      }
    }
    return project(total, partials[0].serviceKm, partials[0].seatTrips);
  }
  return { calculate, combinePartials, km, zones, zoneCities, resolveService, timing: () => lastTiming };
  }
export { createModel, km };
