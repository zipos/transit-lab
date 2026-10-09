/* Deterministic accessibility model. All outputs are estimates, never observed ridership. */
import { modes, vehicles, cruiseSpeed, costPerKm as rate } from '../modes.js';
import { resolveChoice, waitMinutes, carMinutes } from './params.js';

export const modelVersion = 4;

export function walkMinutes(distanceKm) {
  return distanceKm * 1.25 / 4.5 * 60;
}

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
  const zoneIds = [];
  const zoneResidents = [];
  const zoneAttraction = [];
  const zoneDensity = [];
  const zoneCities = [];
  const preparedZones = Array.isArray(population?.zones) && population.zones.length ? population.zones : null;
  let preparedAccess = null;
  // Homes use the published residents. Daytime destinations are a transparent
  // centrality/density proxy, not observed workplaces, schools or shops.
  if (preparedZones) {
    let massLon = 0, massLat = 0, mass = 0;
    for (const zone of preparedZones) {
      massLon += zone.centroid[0] * zone.residents;
      massLat += zone.centroid[1] * zone.residents;
      mass += zone.residents;
    }
    const regionCenter = mass > 0 ? [massLon / mass, massLat / mass] : [19.1, 50.2];
    preparedAccess = [];
    for (const zone of preparedZones) {
      const centrality = 1 / (1 + km(zone.centroid, regionCenter) / 7);
      zones.push([zone.municipality, zone.centroid[0], zone.centroid[1]]);
      zoneIds.push(zone.id);
      zoneResidents.push(zone.residents);
      zoneAttraction.push(Math.sqrt(zone.residents) * (0.6 + Math.log1p(zone.density) / 8) * (0.7 + centrality));
      zoneDensity.push(zone.density);
      zoneCities.push(zone.municipality);
      preparedAccess.push(zone.access.map(([index, minutes]) => [index, minutes]));
    }
  } else {
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
        const name = count === 1 ? city : `${city} ${index + 1}`;
        zones.push([name, lon, lat]);
        zoneIds.push(name);
        zoneResidents.push(residents);
        zoneAttraction.push(Math.sqrt(residents) * (0.6 + Math.log1p(density) / 8) * (0.7 + centrality));
        zoneDensity.push(density);
        zoneCities.push(city);
      }
    }
  }
  const residentTotal = zoneResidents.reduce((a, b) => a + b, 0);
  // 0.6 potential cross-neighborhood journeys per resident/day is a game
  // assumption, not a published travel survey result.
  const tripRate = Number(options.tripRate) > 0 ? Number(options.tripRate) : 0.6;
  const choice = resolveChoice(options.choice);
  const estimatedDemand = residentTotal > 0 ? Math.round(residentTotal * tripRate) : 90000;
  const meanResidents = residentTotal / zones.length || 1;
  const originWeights = zoneResidents.map(n => n / meanResidents);
  const meanAttraction = zoneAttraction.reduce((a, b) => a + b, 0) / zones.length || 1;
  const destinationWeights = zoneAttraction.map(n => n / meanAttraction);
  let scratch = null;
  function scratchFor(nodes) {
    const heapCap = nodes * 8;
    if (!scratch || !scratch.ivt || scratch.dist.length < nodes || scratch.heapKeys.length < heapCap) {
      const nodeCap = Math.max(nodes, scratch ? Math.max(scratch.dist.length, nodes) : nodes);
      const cap = Math.max(heapCap, scratch ? scratch.heapKeys.length : 0);
      scratch = {
        dist: new Float64Array(nodeCap),
        wait: new Float64Array(nodeCap),
        ivt: new Float64Array(nodeCap),
        walk: new Float64Array(nodeCap),
        boards: new Uint16Array(nodeCap),
        alights: new Uint16Array(nodeCap),
        targets: new Uint8Array(nodeCap),
        pred: new Int32Array(nodeCap),
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
        if (distance < 1.4) nearby.push([index + shift, distance / 4.5 * 60]);
      }
      nearby.sort((a, b) => a[1] - b[1]);
      return nearby.slice(0, 8);
    });
  }
  function zoneWalk(zone, pos, limit) {
    let weighted = 0, weight = 0;
    for (const cell of zone.cells) {
      const minutes = km([cell.lon, cell.lat], pos) * 1.25 / 4.5 * 60;
      if (minutes > limit) continue;
      const population = +cell.population;
      weighted += population * minutes;
      weight += population;
    }
    return weight > 0 ? weighted / weight : Infinity;
  }
  let maxPreparedIndex = 0;
  if (preparedAccess) {
    for (const list of preparedAccess) for (const [index] of list) if (index > maxPreparedIndex) maxPreparedIndex = index;
  }
  function limitFor(routes, stopId, fallback = 15) {
    let limit = fallback;
    for (const route of routes) {
      if (route.mode !== 'rail' && route.mode !== 'metro') continue;
      if (route.stopIds.includes(stopId)) return 20;
    }
    return limit;
  }
  function accessFor(networkStops, customStops, routes) {
    const aligned = preparedAccess && networkStops.length > maxPreparedIndex;
    if (!preparedAccess) {
      if (!publishedAccess) publishedAccess = nearestStops(networkStops, 0);
      const customAccess = customStops.length ? nearestStops(customStops, networkStops.length) : null;
      return customAccess ? publishedAccess.map((list, index) => list.concat(customAccess[index])) : publishedAccess;
    }
    if (!aligned) {
      const present = networkStops.concat(customStops);
      return preparedZones.map(zone => {
        const entries = [];
        for (let index = 0; index < present.length; index++) {
          const stop = present[index];
          const limit = limitFor(routes, stop.id);
          const minutes = zoneWalk(zone, stop.pos, limit);
          if (minutes <= limit) entries.push([index, +minutes.toFixed(2)]);
        }
        return entries;
      });
    }
    if (!customStops.length) return preparedAccess;
    return preparedAccess.map((list, index) => {
      const extra = [];
      const zone = preparedZones[index];
      for (let stopIndex = 0; stopIndex < customStops.length; stopIndex++) {
        const stop = customStops[stopIndex];
        const limit = limitFor(routes, stop.id);
        const minutes = zoneWalk(zone, stop.pos, limit);
        if (minutes <= limit) extra.push([networkStops.length + stopIndex, +minutes.toFixed(2)]);
      }
      return extra.length ? list.concat(extra) : list;
    });
  }
  function blankLocal() {
    return Object.fromEntries([...new Set(zoneCities)].map(city => [city, {
      demand: 0, riders: 0, satisfaction: 0, walk: 0, withinDemand: 0, withinRiders: 0, withinWalk: 0,
    }]));
  }
  function describeFlows(flow, demandTotal) {
    const scale = estimatedDemand / Math.max(1, demandTotal || 1);
    const exact = value => value * scale;
    const roundFlow = value => Math.round(exact(value));
    const segmentDaily = Float32Array.from(flow.segment, roundFlow);
    let passengerKm = 0;
    let overloaded = 0;
    let boardingsTotal = 0;
    let firstGap = 0;
    const routes = {};
    const stops = {};
    const top = [];
    const consider = item => {
      if (!(item.vc > 0)) return;
      top.push(item);
      top.sort((a, b) => b.vc - a.vc);
      if (top.length > 5) top.pop();
    };
    flow.patterns.forEach((pattern, index) => {
      const riders = roundFlow(flow.patternBoard[index]);
      const firstFlow = pattern.segments.length ? exact(flow.segment[pattern.offset]) : 0;
      const firstBoardings = exact(flow.firstBoard[index]);
      if (!pattern.ring && pattern.segments.length) {
        const gap = Math.abs(firstFlow - firstBoardings) / Math.max(firstFlow, firstBoardings, 1);
        if (gap > firstGap) firstGap = gap;
      }
      let best = null;
      for (let s = 0; s < pattern.segments.length; s++) {
        const daily = segmentDaily[pattern.offset + s];
        const seg = pattern.segments[s];
        const peak = daily * choice.peakHourShare;
        const hourly = (60 / pattern.headway) * (pattern.capacity || modes[pattern.mode]?.capacity || 1);
        const vc = hourly > 0 ? peak / hourly : 0;
        passengerKm += daily * seg.km;
        if (vc > 1) overloaded++;
        const item = { routeId: pattern.routeId, fromId: seg.fromId, toId: seg.toId, fromName: seg.fromName, toName: seg.toName, daily, vc };
        if (!best || vc > best.vc) best = item;
        consider(item);
      }
      const prior = routes[pattern.routeId];
      if (!prior) routes[pattern.routeId] = { riders, vc: best?.vc || 0, fromName: best?.fromName, toName: best?.toName, fromId: best?.fromId, toId: best?.toId };
      else {
        prior.riders += riders;
        if (best && best.vc > prior.vc) Object.assign(prior, { vc: best.vc, fromName: best.fromName, toName: best.toName, fromId: best.fromId, toId: best.toId });
      }
    });
    for (let i = 0; i < flow.boardings.length; i++) {
      const boardings = roundFlow(flow.boardings[i]);
      const transfers = roundFlow(flow.transfers[i]);
      boardingsTotal += boardings;
      if (boardings < 0.05 && transfers < 0.05) continue;
      stops[flow.stopIds[i]] = { boardings, transfers };
    }
    const stopBoardings = Float32Array.from(flow.boardings, roundFlow);
    const stopTransfers = Float32Array.from(flow.transfers, roundFlow);
    return {
      calibrated: false,
      refined: false,
      peakHourShare: choice.peakHourShare,
      passengerKm: Math.round(passengerKm),
      overloaded,
      boardingsTotal: Math.round(boardingsTotal),
      firstSegmentGap: +firstGap.toFixed(6),
      segmentDaily,
      stopBoardings,
      stopTransfers,
      stopIds: flow.stopIds,
      patternRiders: Float32Array.from(flow.patternBoard, roundFlow),
      layout: flow.patterns.map(pattern => ({
        routeId: pattern.routeId,
        mode: pattern.mode,
        capacity: pattern.capacity,
        headway: pattern.headway,
        offset: pattern.offset,
        km: pattern.segments.map(segment => segment.km),
        fromId: pattern.segments.map(segment => segment.fromId),
        toId: pattern.segments.map(segment => segment.toId),
        fromName: pattern.segments.map(segment => segment.fromName),
        toName: pattern.segments.map(segment => segment.toName),
      })),
      routes,
      stops,
      top,
    };
  }
  function presentFlows(stats, segmentDaily, stopBoardings, stopTransfers) {
    const layout = stats.flows.layout;
    const stopIds = stats.flows.stopIds;
    let passengerKm = 0;
    let overloaded = 0;
    const routes = {};
    const top = [];
    const consider = item => {
      if (!(item.vc > 1)) return;
      top.push(item);
      top.sort((a, b) => b.vc - a.vc);
      if (top.length > 5) top.pop();
    };
    layout.forEach((pattern, index) => {
      let best = null;
      const riders = stats.flows.patternRiders?.[index] || 0;
      for (let s = 0; s < pattern.km.length; s++) {
        const daily = segmentDaily[pattern.offset + s];
        const peak = daily * choice.peakHourShare;
        const hourly = (60 / pattern.headway) * (pattern.capacity || modes[pattern.mode]?.capacity || 1);
        const vc = hourly > 0 ? peak / hourly : 0;
        passengerKm += daily * pattern.km[s];
        if (vc > 1) overloaded++;
        const item = { routeId: pattern.routeId, fromId: pattern.fromId[s], toId: pattern.toId[s], fromName: pattern.fromName[s], toName: pattern.toName[s], daily, vc };
        if (!best || vc > best.vc) best = item;
        consider(item);
      }
      const prior = routes[pattern.routeId];
      if (!prior) routes[pattern.routeId] = { riders, vc: best?.vc || 0, fromName: best?.fromName, toName: best?.toName, fromId: best?.fromId, toId: best?.toId };
      else {
        prior.riders += riders;
        if (best && best.vc > prior.vc) Object.assign(prior, { vc: best.vc, fromName: best.fromName, toName: best.toName, fromId: best.fromId, toId: best.toId });
      }
    });
    const stops = {};
    let boardingsTotal = 0;
    for (let i = 0; i < stopBoardings.length; i++) {
      boardingsTotal += stopBoardings[i];
      if (stopBoardings[i] < 0.05 && stopTransfers[i] < 0.05) continue;
      stops[stopIds[i]] = { boardings: stopBoardings[i], transfers: stopTransfers[i] };
    }
    return {
      ...stats,
      flows: {
        ...stats.flows,
        passengerKm,
        overloaded,
        boardingsTotal,
        segmentDaily,
        stopBoardings,
        stopTransfers,
        routes,
        stops,
        top,
      },
    };
  }
  function shareOf(riders, demand, walk) {
    return +(100 * riders / Math.max(1e-9, demand - walk)).toFixed(1);
  }
  function project(sums, serviceKm) {
    const passengerCount = Math.round(estimatedDemand * sums.riders / Math.max(1, sums.demandTotal));
    const boardings = Math.round(estimatedDemand * sums.boardSum / Math.max(1, sums.demandTotal));
    const cityStats = Object.fromEntries(Object.entries(sums.local).map(([city, value]) => [city, {
      passengers: Math.round(estimatedDemand * value.riders / Math.max(1, sums.demandTotal)),
      share: shareOf(value.riders, value.demand, value.walk),
      withinShare: shareOf(value.withinRiders, value.withinDemand, value.withinWalk),
      satisfaction: value.riders > 0 ? Math.round(value.satisfaction / value.riders) : 0,
    }]));
    const zoneStats = zoneIds.map((id, index) => ({
      id,
      from: Math.round(estimatedDemand * (sums.zoneFrom?.[index] || 0) / Math.max(1, sums.demandTotal)),
      to: Math.round(estimatedDemand * (sums.zoneTo?.[index] || 0) / Math.max(1, sums.demandTotal)),
      journey: sums.zoneFrom?.[index] > 0 ? +(sums.zoneJourney[index] / sums.zoneFrom[index]).toFixed(2) : 0,
      access45: +(sums.zoneAccess?.[index] || 0).toFixed(2),
    }));
    return {
      demandPopulation: residentTotal,
      demandTrips: estimatedDemand,
      passengers: passengerCount,
      boardings,
      share: shareOf(sums.riders, sums.demandTotal, sums.walkWeight),
      calibrated: false,
      asc: 0,
      walkTrips: Math.round(estimatedDemand * sums.walkWeight / Math.max(1, sums.demandTotal)),
      satisfaction: sums.reachedWeight > 0 ? Math.round(sums.satisfaction / sums.reachedWeight) : 0,
      wait: +(sums.waitTotal / Math.max(1, sums.reachedWeight)).toFixed(2),
      travel: +(sums.travelTotal / Math.max(1, sums.reachedWeight)).toFixed(2),
      transfers: +(sums.transferTotal / Math.max(1, sums.reachedWeight)).toFixed(1),
      cost: Math.round(serviceKm),
      accessResidents: sums.accessResidents,
      accessShare: +(100 * sums.accessResidents / Math.max(1, residentTotal)).toFixed(1),
      cityStats,
      zoneStats,
      access45: zoneStats.map(zone => zone.access45),
      flows: sums.flow ? describeFlows(sums.flow, sums.demandTotal) : null,
    };
  }
  function residentsNearRapid(stops, routes, daypart, stopIndex) {
    const points = [];
    const seen = new Uint8Array(stops.length);
    for (const route of routes) {
      if (route.mode !== 'tram' && route.mode !== 'rail' && route.mode !== 'metro') continue;
      if (!resolveService(route, daypart).runs) continue;
      for (const id of route.stopIds) {
        const index = stopIndex.get(id);
        if (index === undefined || seen[index]) continue;
        seen[index] = 1;
        points.push(stops[index].pos);
      }
    }
    if (!points.length || !preparedZones) return 0;
    const buckets = new Map();
    const keyOf = (lon, lat) => `${Math.floor(lon / 0.015)}:${Math.floor(lat / 0.015)}`;
    for (const pos of points) {
      const key = keyOf(pos[0], pos[1]);
      let bucket = buckets.get(key);
      if (!bucket) buckets.set(key, bucket = []);
      bucket.push(pos);
    }
    let residents = 0;
    for (const zone of preparedZones) {
      for (const cell of zone.cells) {
        const x = Math.floor(cell.lon / 0.015);
        const y = Math.floor(cell.lat / 0.015);
        let near = false;
        for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1 && !near; dy++) {
          const bucket = buckets.get(`${x + dx}:${y + dy}`);
          if (!bucket) continue;
          for (let n = 0; n < bucket.length; n++) {
            if (km(bucket[n], [cell.lon, cell.lat]) <= choice.rapidAccessKm) { near = true; break; }
          }
        }
        if (near) residents += cell.population;
      }
    }
    return Math.round(residents);
  }
  function calculate(network, customRoutes, customStops, overrides, daypart = 'peak', hooks = {}) {
    const started = performance.now();
    const routes = network.routes.concat(customRoutes).map(route => ({ ...route, ...(overrides[route.id] || {}) })).filter(route => route.active !== false);
    const stops = network.stops.concat(customStops);
    const stopIndex = new Map(stops.map((stop, index) => [stop.id, index]));
    const stopCount = stops.length;
    const raw = [];
    const link = (from, to, gc, wait, board, kind, ivt, walk, alight, pattern = -1, segment = -1, stopRef = -1) => {
      raw.push(from, to, gc, wait, board, kind, ivt, walk, alight, pattern, segment, stopRef);
    };
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
          const walkGc = choice.walkWeight * walk;
          link(stopCount + index, 2 * stopCount + other, walkGc, 0, 0, K_WALK, 0, walk, 0);
          link(stopCount + other, 2 * stopCount + index, walkGc, 0, 0, K_WALK, 0, walk, 0);
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
    let serviceKm = 0, nextNode = 3 * stopCount;
    const flowPatterns = [];
    const segmentScale = hooks.segmentScale;
    let segmentCursor = 0;
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
        const waitMin = waitMinutes(headway, choice);
        const boardGc = choice.waitWeight * waitMin + choice.boardMinutes;
        const transferGc = boardGc + choice.transferPenalty;
        const patternIndex = flowPatterns.length;
        const segments = [];
        let length = 0;
        for (let i = 0; i < direction.length; i++) {
          const stop = direction[i];
          const onboard = base + i;
          if (!indexed || !noBoard.has(i)) {
            link(stop, onboard, boardGc, waitMin, 1, K_BOARD, 0, 0, 0, -1, -1, stop);
            link(stopCount + stop, onboard, transferGc, waitMin, 1, K_TRANSFER, 0, 0, 0, -1, -1, stop);
            link(2 * stopCount + stop, onboard, transferGc, waitMin, 1, K_TRANSFER, 0, 0, 0, -1, -1, stop);
          }
          if (!indexed || !noAlight.has(i)) { link(onboard, stopCount + stop, choice.alightMinutes, 0, 0, K_ALIGHT, 0, 0, 1, -1, -1, stop); canAlight[stop] = 1; }
          if (i < direction.length - 1 || ring) {
            const next = (i + 1) % direction.length;
            const nextStop = direction[next];
            const forwardIndex = indexed ? i : sequence.length - 2 - i;
            const hops = route.waypoints?.[forwardIndex];
            const ordered = hops?.length && !indexed ? hops.slice().reverse() : hops;
            const distance = ordered?.length
              ? [stops[stop].pos, ...ordered, stops[nextStop].pos].reduce((sum, point, index, chain) => index ? sum + km(chain[index - 1], point) : 0, 0)
              : km(stops[stop].pos, stops[nextStop].pos) * distanceFactor;
            length += distance;
            const ride = useTimes && next > i
              ? Math.max(choice.alightMinutes, service.times[next] - service.times[i])
              : modes[route.mode].dwell + distance / cruiseSpeed[route.mode] * 60;
            const segment = segments.length;
            const scale = segmentScale ? (segmentScale[segmentCursor + segment] || 1) : 1;
            link(onboard, base + next, ride * scale, 0, 0, K_RIDE, ride, 0, 0, patternIndex, segment, -1);
            segments.push({
              km: distance,
              fromId: stops[stop].id,
              toId: stops[nextStop].id,
              fromName: stops[stop].name,
              toName: stops[nextStop].name,
            });
          }
        }
        flowPatterns.push({
          routeId: route.id,
          mode: route.mode,
          capacity: vehicles[route.vehicle]?.mode === route.mode ? vehicles[route.vehicle].capacity : modes[route.mode].capacity,
          headway,
          ring,
          firstStop: direction[0],
          offset: segmentCursor,
          segments,
        });
        segmentCursor += segments.length;
        serviceKm += length * departures * rate[route.mode];
      }
    }
    const nodeCount = nextNode;
    const edgeCount = raw.length / 12;
    // Full rebuild on each scenario. On the GZM snapshot this is about 20–50 ms,
    // under the 60 ms limit, so a static base graph plus an overflow block is unnecessary.
    const degree = new Uint32Array(nodeCount);
    for (let i = 0; i < raw.length; i += 12) degree[raw[i]]++;
    const offset = new Uint32Array(nodeCount + 1);
    for (let i = 0; i < nodeCount; i++) offset[i + 1] = offset[i] + degree[i];
    const cursor = new Uint32Array(offset);
    const target = new Int32Array(edgeCount);
    const edgeFrom = new Int32Array(edgeCount);
    const edgeCost = new Float64Array(edgeCount);
    const edgeWait = new Float32Array(edgeCount);
    const edgeBoard = new Uint8Array(edgeCount);
    const edgeKind = new Uint8Array(edgeCount);
    const edgeIvt = new Float32Array(edgeCount);
    const edgeWalk = new Float32Array(edgeCount);
    const edgeAlight = new Uint8Array(edgeCount);
    const edgePattern = new Int32Array(edgeCount);
    const edgeSegment = new Int32Array(edgeCount);
    const edgeStop = new Int32Array(edgeCount);
    for (let i = 0; i < raw.length; i += 12) {
      const at = cursor[raw[i]]++;
      edgeFrom[at] = raw[i];
      target[at] = raw[i + 1];
      edgeCost[at] = raw[i + 2];
      edgeWait[at] = raw[i + 3];
      edgeBoard[at] = raw[i + 4];
      edgeKind[at] = raw[i + 5];
      edgeIvt[at] = raw[i + 6];
      edgeWalk[at] = raw[i + 7];
      edgeAlight[at] = raw[i + 8];
      edgePattern[at] = raw[i + 9];
      edgeSegment[at] = raw[i + 10];
      edgeStop[at] = raw[i + 11];
    }
    const built = performance.now();
    const zoneStops = accessFor(network.stops, customStops, routes);
    const accessResidents = residentsNearRapid(stops, routes, daypart, stopIndex);
    const sums = {
      demandTotal: 0, riders: 0, satisfaction: 0, waitTotal: 0, travelTotal: 0, transferTotal: 0, reachedWeight: 0,
      walkWeight: 0, boardSum: 0, accessResidents,
      flow: {
        segment: new Float32Array(segmentCursor),
        boardings: new Float32Array(stopCount),
        transfers: new Float32Array(stopCount),
        patternBoard: new Float32Array(flowPatterns.length),
        firstBoard: new Float32Array(flowPatterns.length),
        patterns: flowPatterns,
        stopIds: stops.map(stop => stop.id),
      },
      zoneFrom: Array(zones.length).fill(0), zoneTo: Array(zones.length).fill(0), zoneJourney: Array(zones.length).fill(0),
      zoneAccess: Array(zones.length).fill(0),
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
    const pathIvt = state.ivt;
    const pathWalk = state.walk;
    const boards = state.boards;
    const pathAlight = state.alights;
    const pred = state.pred;
    const heapKeys = state.heapKeys;
    const heapVals = state.heapVals;
    const runSearch = (seedStops) => {
      dist.fill(Infinity, 0, nodeCount);
      pathWait.fill(0, 0, nodeCount);
      pathIvt.fill(0, 0, nodeCount);
      pathWalk.fill(0, 0, nodeCount);
      boards.fill(0, 0, nodeCount);
      pathAlight.fill(0, 0, nodeCount);
      pred.fill(-1, 0, nodeCount);
      let heapSize = 0;
      let remaining = targets.length;
      for (let n = 0; n < seedStops.length; n++) {
        const node = seedStops[n][0];
        const access = seedStops[n][1];
        if (node >= stopCount) continue;
        const seeded = choice.walkWeight * access;
        if (seeded < dist[node]) {
          dist[node] = seeded;
          pathWalk[node] = access;
          heapSize = heapPush(heapKeys, heapVals, heapSize, seeded, node);
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
            pathIvt[to] = pathIvt[at] + edgeIvt[edge];
            pathWalk[to] = pathWalk[at] + edgeWalk[edge];
            boards[to] = boards[at] + edgeBoard[edge];
            pathAlight[to] = pathAlight[at] + edgeAlight[edge];
            pred[to] = edge;
            heapSize = heapPush(heapKeys, heapVals, heapSize, next, to);
          }
        }
      }
    };
    const zoneBest = (destination) => {
      let best = Infinity, bestNode = -1, bestEgress = 0;
      const access = zoneStops[destination];
      for (let n = 0; n < access.length; n++) {
        if (access[n][0] >= stopCount) continue;
        const node = stopCount + access[n][0];
        const gc = dist[node] + choice.walkWeight * access[n][1];
        if (gc < best) { best = gc; bestNode = node; bestEgress = access[n][1]; }
      }
      return { best, bestNode, bestEgress };
    };
    if (hooks.travelPos) {
      const seeds = [];
      for (let index = 0; index < stopCount; index++) {
        const minutes = walkMinutes(km(hooks.travelPos, stops[index].pos));
        if (minutes <= 20) seeds.push([index, minutes]);
      }
      seeds.sort((a, b) => a[1] - b[1]);
      runSearch(seeds.slice(0, 24));
      const zoneClock = new Float32Array(zones.length);
      const zoneGc = new Float32Array(zones.length);
      zoneClock.fill(Infinity);
      zoneGc.fill(Infinity);
      let residents30 = 0, residents45 = 0;
      for (let destination = 0; destination < zones.length; destination++) {
        const { best, bestNode, bestEgress } = zoneBest(destination);
        if (!Number.isFinite(best) || boards[bestNode] === 0) continue;
        const clock = pathIvt[bestNode] + pathWalk[bestNode] + bestEgress + pathWait[bestNode] + boards[bestNode] * choice.boardMinutes + pathAlight[bestNode] * choice.alightMinutes;
        zoneClock[destination] = clock;
        zoneGc[destination] = best;
        if (clock <= 30) residents30 += zoneResidents[destination];
        if (clock <= 45) residents45 += zoneResidents[destination];
      }
      const stopClock = new Float32Array(stopCount);
      stopClock.fill(Infinity);
      for (let stopIndex = 0; stopIndex < stopCount; stopIndex++) {
        const node = stopCount + stopIndex;
        if (!Number.isFinite(dist[node]) || boards[node] === 0) continue;
        stopClock[stopIndex] = pathIvt[node] + pathWalk[node] + pathWait[node]
          + boards[node] * choice.boardMinutes + pathAlight[node] * choice.alightMinutes;
      }
      const finished = performance.now();
      lastTiming = { buildMs: +(built - started).toFixed(1), searchMs: +(finished - built).toFixed(1), nodes: nodeCount, edges: edgeCount };
      return {
        zoneClock,
        zoneGc,
        stopClock,
        residents30: Math.round(residents30),
        residents45: Math.round(residents45),
        buildMs: lastTiming.buildMs,
        searchMs: lastTiming.searchMs,
      };
    }
    const originStart = hooks.originStart || 0;
    const originEnd = hooks.originEnd == null ? zones.length : hooks.originEnd;
    const span = Math.max(1, originEnd - originStart);
    const progressStep = Math.max(1, Math.floor(span / 10));
    let cancelled = false;
    for (let origin = originStart; origin < originEnd; origin++) {
      if (hooks.shouldContinue && !hooks.shouldContinue()) { cancelled = true; break; }
      if (hooks.onProgress && (origin - originStart) % progressStep === 0) hooks.onProgress((origin - originStart) / span);
      runSearch(zoneStops[origin]);
      const originCity = zoneCities[origin];
      const local = sums.local[originCity];
      let accessScore = zoneAttraction[origin];
      for (let destination = 0; destination < zones.length; destination++) {
        if (origin === destination) continue;
        const straight = straightKm[origin][destination];
        const weight = originWeights[origin] * destinationWeights[destination] / (1 + straight / 6);
        const destinationCity = zoneCities[destination];
        const sameCity = originCity === destinationCity;
        sums.demandTotal += weight;
        local.demand += weight;
        if (sameCity) local.withinDemand += weight;
        if (straight < choice.walkExcludeKm) {
          sums.walkWeight += weight;
          local.walk += weight;
          if (sameCity) local.withinWalk += weight;
          continue;
        }
        const { best, bestNode, bestEgress } = zoneBest(destination);
        if (!Number.isFinite(best) || boards[bestNode] === 0) continue;
        if (best <= 45) accessScore += zoneAttraction[destination];
        const gcCar = carMinutes(straight, zoneDensity[origin], zoneDensity[destination], choice);
        const gap = choice.lambda * (best - gcCar);
        const share = gap > 40 ? 0 : gap < -40 ? 1 : 1 / (1 + Math.exp(gap));
        if (share <= 0) continue;
        const served = weight * share;
        let node = bestNode;
        let ridePattern = -1;
        let expectFirst = -1;
        for (let guard = 0; guard < 256 && node >= 0; guard++) {
          const edge = pred[node];
          if (edge < 0) break;
          const kind = edgeKind[edge];
          if (kind === K_RIDE) {
            const pattern = edgePattern[edge];
            const segment = edgeSegment[edge];
            sums.flow.segment[flowPatterns[pattern].offset + segment] += served;
            ridePattern = pattern;
            expectFirst = segment === 0 ? pattern : -1;
          } else if (kind === K_BOARD || kind === K_TRANSFER) {
            const stop = edgeStop[edge];
            sums.flow.boardings[stop] += served;
            if (kind === K_TRANSFER) sums.flow.transfers[stop] += served;
            if (ridePattern >= 0) sums.flow.patternBoard[ridePattern] += served;
            if (expectFirst >= 0 && stop === flowPatterns[expectFirst].firstStop) sums.flow.firstBoard[expectFirst] += served;
            ridePattern = -1;
            expectFirst = -1;
          }
          node = edgeFrom[edge];
        }
        const clock = pathIvt[bestNode] + pathWalk[bestNode] + bestEgress + pathWait[bestNode] + boards[bestNode] * choice.boardMinutes + pathAlight[bestNode] * choice.alightMinutes;
        const score = 50 + 50 * Math.tanh((gcCar - best) / choice.satisfactionScale);
        sums.riders += served;
        sums.reachedWeight += served;
        sums.boardSum += boards[bestNode] * served;
        sums.satisfaction += score * served;
        local.riders += served;
        local.satisfaction += score * served;
        if (sameCity) local.withinRiders += served;
        sums.waitTotal += pathWait[bestNode] * served;
        sums.travelTotal += clock * served;
        sums.transferTotal += Math.max(0, boards[bestNode] - 1) * served;
        sums.zoneFrom[origin] += served;
        sums.zoneTo[destination] += served;
        sums.zoneJourney[origin] += clock * served;
      }
      sums.zoneAccess[origin] = accessScore;
    }
    if (hooks.onProgress && !cancelled) hooks.onProgress(1);
    const finished = performance.now();
    lastTiming = { buildMs: +(built - started).toFixed(1), searchMs: +(finished - built).toFixed(1), nodes: nodeCount, edges: edgeCount };
    if (cancelled) return null;
    if (hooks.partial) return { ...sums, serviceKm };
    return project(sums, serviceKm);
  }
  function combinePartials(partials) {
    const total = {
      demandTotal: 0, riders: 0, satisfaction: 0, waitTotal: 0, travelTotal: 0, transferTotal: 0, reachedWeight: 0,
      walkWeight: 0, boardSum: 0, accessResidents: partials[0].accessResidents || 0,
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
      total.walkWeight += part.walkWeight || 0;
      total.boardSum += part.boardSum || 0;
      if (part.flow) {
        if (!total.flow) {
          total.flow = {
            segment: Float32Array.from(part.flow.segment),
            boardings: Float32Array.from(part.flow.boardings),
            transfers: Float32Array.from(part.flow.transfers),
            patternBoard: Float32Array.from(part.flow.patternBoard),
            firstBoard: Float32Array.from(part.flow.firstBoard),
            patterns: part.flow.patterns,
            stopIds: part.flow.stopIds,
          };
        } else {
          for (let i = 0; i < part.flow.segment.length; i++) total.flow.segment[i] += part.flow.segment[i];
          for (let i = 0; i < part.flow.boardings.length; i++) total.flow.boardings[i] += part.flow.boardings[i];
          for (let i = 0; i < part.flow.transfers.length; i++) total.flow.transfers[i] += part.flow.transfers[i];
          for (let i = 0; i < part.flow.patternBoard.length; i++) total.flow.patternBoard[i] += part.flow.patternBoard[i];
          for (let i = 0; i < part.flow.firstBoard.length; i++) total.flow.firstBoard[i] += part.flow.firstBoard[i];
        }
      }
      for (const city of Object.keys(part.local)) {
        const from = part.local[city];
        const into = total.local[city];
        into.demand += from.demand;
        into.riders += from.riders;
        into.satisfaction += from.satisfaction;
        into.walk += from.walk || 0;
        into.withinDemand += from.withinDemand || 0;
        into.withinRiders += from.withinRiders || 0;
        into.withinWalk += from.withinWalk || 0;
      }
      if (part.zoneFrom) {
        if (!total.zoneFrom) {
          total.zoneFrom = Array(part.zoneFrom.length).fill(0);
          total.zoneTo = Array(part.zoneTo.length).fill(0);
          total.zoneJourney = Array(part.zoneJourney.length).fill(0);
          total.zoneAccess = Array(part.zoneFrom.length).fill(0);
        }
        for (let index = 0; index < part.zoneFrom.length; index++) {
          total.zoneFrom[index] += part.zoneFrom[index];
          total.zoneTo[index] += part.zoneTo[index];
          total.zoneJourney[index] += part.zoneJourney[index];
          total.zoneAccess[index] += part.zoneAccess?.[index] || 0;
        }
      }
    }
    return project(total, partials[0].serviceKm);
  }
  function travelFrom(pos, network, customRoutes, customStops, overrides, daypart = 'peak') {
    return calculate(network, customRoutes, customStops, overrides, daypart, { travelPos: pos });
  }
  return {
    calculate, combinePartials, presentFlows, travelFrom, km, zones, zoneCities, zoneIds, zoneResidents, zoneAttraction,
    resolveService, timing: () => lastTiming,
  };
  }
export { createModel, km };
