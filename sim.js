/* Deterministic accessibility model. All outputs are estimates, never observed ridership. */
(() => {
  const zones = [];
  const zoneResidents = [];
  const zoneAttraction = [];
  const zoneCities = [];
  const speed = { bus: 22, tram: 25, rail: 48, metro: 42 };
  const capacity = { bus: 75, tram: 170, rail: 380, metro: 650 };
  const costPerKm = { bus: 12, tram: 20, rail: 38, metro: 55 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = Math.PI / 180;
  function km(a, b) {
    const dLat = (b[1] - a[1]) * rad;
    const dLon = (b[0] - a[0]) * rad;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  // Each municipality has at least one demand anchor; larger ones have two.
  // Homes use the published residents. Daytime destinations are a transparent
  // centrality/density proxy, not observed workplaces, schools or shops.
  const populationCells = window.GZM_POPULATION?.cells || [];
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
  const estimatedDemand = residentTotal > 0 ? Math.round(residentTotal * .6) : 90000;
  const meanResidents = residentTotal / zones.length || 1;
  const originWeights = zoneResidents.map(n => n / meanResidents);
  const meanAttraction = zoneAttraction.reduce((a, b) => a + b, 0) / zones.length || 1;
  const destinationWeights = zoneAttraction.map(n => n / meanAttraction);
  class Heap {
    constructor() { this.a = []; }
    push(x) { const a = this.a; let i = a.length; a.push(x); while (i) { const p = (i - 1) >> 1; if (a[p][0] <= x[0]) break; a[i] = a[p]; i = p; } a[i] = x; }
    pop() { const a = this.a, first = a[0], x = a.pop(); if (!a.length) return first; let i = 0; while (i * 2 + 1 < a.length) { let j = i * 2 + 1; if (j + 1 < a.length && a[j + 1][0] < a[j][0]) j++; if (a[j][0] >= x[0]) break; a[i] = a[j]; i = j; } a[i] = x; return first; }
    get length() { return this.a.length; }
  }
  function calculate(network, customRoutes, customStops, overrides) {
    const routes = network.routes.concat(customRoutes).map(route => ({ ...route, ...(overrides[route.id] || {}) })).filter(route => route.active !== false);
    const stops = network.stops.concat(customStops);
    const stopMap = new Map(stops.map((s, i) => [s.id, { ...s, index: i }]));
    const graph = Array.from({ length: stops.length }, () => []);
    const addNode = () => (graph.push([]), graph.length - 1);
    // A separate arrival state allows one station-to-station walk before the next boarding,
    // but prevents adjacent 340 m links from chaining into unbounded pedestrian journeys.
    const transferArrival = new Map(stops.map(s => [s.id, addNode()]));
    const edge = (a, b, mins, wait = 0, board = 0, walk = false) => graph[a].push([b, mins, wait, board, walk]);
    // Nearby platforms provide a single walkable interchange. This is a geometric proxy, not a pedestrian router.
    const cells = new Map(), cell = p => `${Math.floor(p[0] / .003)}:${Math.floor(p[1] / .003)}`;
    for (const s of stops) {
      const key = cell(s.pos); if (!cells.has(key)) cells.set(key, []); cells.get(key).push(s);
    }
    for (const s of stops) {
      const x = Math.floor(s.pos[0] / .003), y = Math.floor(s.pos[1] / .003);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        for (const other of cells.get(`${x + dx}:${y + dy}`) || []) {
          if (s.id >= other.id) continue;
          const dist = km(s.pos, other.pos);
          if (dist > .34) continue;
          const t = s.area && s.area === other.area ? 2 : 1.2 + dist / 4.5 * 60;
          edge(stopMap.get(s.id).index, transferArrival.get(other.id), t, 0, 0, true);
          edge(stopMap.get(other.id).index, transferArrival.get(s.id), t, 0, 0, true);
        }
      }
    }
    function routeDistanceFactor(route, sequence) {
      const fallback = route.mode === 'metro' ? 1.08 : 1.2;
      if (route.edited || !Array.isArray(route.geometry)) return fallback;
      let stopLength = 0, shapeLength = 0;
      for (let i = 1; i < sequence.length; i++) stopLength += km(sequence[i - 1].pos, sequence[i].pos);
      for (const segment of route.geometry) {
        if (!Array.isArray(segment)) continue;
        for (let i = 1; i < segment.length; i++) shapeLength += km(segment[i - 1], segment[i]);
      }
      const ratio = shapeLength / stopLength;
      // Imported shapes can be abbreviated or mismatched to the selected trip.
      // Accept only plausible whole-pattern detours; otherwise retain the mode fallback.
      return stopLength > 1 && Number.isFinite(ratio) && ratio >= .95 && ratio <= 1.7
        ? clamp(ratio, 1.02, 1.6)
        : fallback;
    }
    let serviceKm = 0, seatTrips = 0;
    for (const r of routes) {
      const seq = r.stopIds.map(id => stopMap.get(id)).filter(Boolean);
      if (seq.length < 2) continue;
      const headway = clamp(Number(r.headway) || 30, 3, 120);
      const distanceFactor = routeDistanceFactor(r, seq);
      const baseHeadway = Number(r.baseHeadway);
      const departures = Number.isFinite(Number(r.dailyTrips)) && Number.isFinite(baseHeadway) && baseHeadway > 0
        ? Number(r.dailyTrips) * baseHeadway / headway
        : 840 / headway;
      const noBoard = new Set(r.noBoard || []);
      const noAlight = new Set(r.noAlight || []);
      // Ring service follows the drawn stop order and closes back to the first stop.
      // Other player lines run in both directions; GTFS patterns are directional.
      const ring = r.source === 'player' && r.ring === true && seq.length >= 3;
      for (const direction of r.source === 'player' && !ring ? [seq, seq.slice().reverse()] : [seq]) {
        const onboard = direction.map(() => addNode());
        const indexed = direction === seq;
        const useTimes = indexed && !r.edited && Array.isArray(r.times) && r.times.length === seq.length;
        let length = 0;
        for (let i = 0; i < direction.length; i++) {
          if (!indexed || !noBoard.has(i)) {
            for (const platform of [direction[i].index, transferArrival.get(direction[i].id)]) {
              edge(platform, onboard[i], headway / 2 + 1, headway / 2, 1);
            }
          }
          if (!indexed || !noAlight.has(i)) edge(onboard[i], direction[i].index, .3);
          if (i < direction.length - 1 || ring) {
            const next = (i + 1) % direction.length;
            const distance = km(direction[i].pos, direction[next].pos) * distanceFactor;
            length += distance;
            const ride = useTimes && next > i ? Math.max(.3, r.times[next] - r.times[i]) : .55 + distance / speed[r.mode] * 60;
            edge(onboard[i], onboard[next], ride);
          }
        }
        serviceKm += length * departures * costPerKm[r.mode];
        seatTrips += departures * capacity[r.mode];
      }
    }
    const baseStopCount = network.stops.length;
    const zoneStops = zones.map(z => {
      const p = [z[1], z[2]];
      const nearby = (slice, offset) => slice.map((s, i) => [i + offset, km(p, s.pos)]).filter(x => x[1] < 1.4).sort((a, b) => a[1] - b[1]).slice(0, 8);
      // New stops supplement access rather than pushing published stops out of a fixed cutoff.
      return nearby(network.stops, 0).concat(nearby(customStops, baseStopCount));
    });
    let demandTotal = 0, riders = 0, satisfaction = 0, waitTotal = 0, travelTotal = 0, transferTotal = 0, reachedWeight = 0;
    const local = Object.fromEntries([...new Set(zoneCities)].map(city => [city, { demand: 0, riders: 0, satisfaction: 0 }]));
    for (let i = 0; i < zones.length; i++) {
      const dist = new Float64Array(graph.length).fill(Infinity);
      const wait = new Float64Array(graph.length);
      const boards = new Uint8Array(graph.length);
      const heap = new Heap();
      for (const [idx, distance] of zoneStops[i]) {
        const t = distance / 4.5 * 60;
        if (t < dist[idx]) { dist[idx] = t; heap.push([t, idx]); }
      }
      while (heap.length) {
        const [cost, at] = heap.pop();
        if (cost > dist[at] + 1e-8) continue;
        for (const [to, mins, waiting, boarding, walking] of graph[at]) {
          // Before the first boarding, the zone-to-stop walk already models access.
          if (walking && boards[at] === 0) continue;
          const next = cost + mins + (boarding && boards[at] ? 4 : 0);
          if (next + 1e-8 < dist[to]) {
            dist[to] = next; wait[to] = wait[at] + waiting; boards[to] = boards[at] + boarding; heap.push([next, to]);
          }
        }
      }
      for (let j = 0; j < zones.length; j++) {
        if (i === j) continue;
        const straight = km([zones[i][1], zones[i][2]], [zones[j][1], zones[j][2]]);
        // Nearby destinations are more likely than equally populated distant ones.
        const weight = originWeights[i] * destinationWeights[j] / (1 + straight / 6);
        demandTotal += weight;
        local[zoneCities[i]].demand += weight;
        let best = Infinity, bestNode = -1;
        for (const [idx, distance] of zoneStops[j]) {
          const time = dist[idx] + distance / 4.5 * 60;
          if (time < best) { best = time; bestNode = idx; }
        }
        // A walk-only path is not a public-transport passenger trip.
        if (!Number.isFinite(best) || boards[bestNode] === 0) continue;
        const reference = Math.max(8, straight / 28 * 60);
        const share = clamp(1 / (1 + Math.exp((best - reference * 1.65 - 11) / 8)), 0, 1);
        const served = weight * share;
        // The route search already prices waiting and transfers into journey time.
        const score = clamp(93 - (best - reference) * .72, 8, 96);
        riders += served; reachedWeight += served; satisfaction += score * served;
        local[zoneCities[i]].riders += served;
        local[zoneCities[i]].satisfaction += score * served;
        waitTotal += wait[bestNode] * served; travelTotal += best * served;
        transferTotal += Math.max(0, boards[bestNode] - 1) * served;
      }
    }
    const passengerCount = Math.round(estimatedDemand * riders / Math.max(1, demandTotal));
    const cityStats = Object.fromEntries(Object.entries(local).map(([city, value]) => [city, {
      passengers: Math.round(estimatedDemand * value.riders / Math.max(1, demandTotal)),
      coverage: +(100 * value.riders / Math.max(1, value.demand)).toFixed(2),
      satisfaction: +(value.satisfaction / Math.max(1, value.riders)).toFixed(2),
    }]));
    return {
      demandPopulation: residentTotal,
      demandTrips: estimatedDemand,
      passengers: passengerCount,
      satisfaction: +(satisfaction / Math.max(1, reachedWeight)).toFixed(2),
      wait: +(waitTotal / Math.max(1, reachedWeight)).toFixed(2),
      travel: +(travelTotal / Math.max(1, reachedWeight)).toFixed(2),
      transfers: +(transferTotal / Math.max(1, reachedWeight)).toFixed(2),
      load: Math.round(clamp(passengerCount / Math.max(1, seatTrips) * 100, 0, 150)),
      cost: Math.round(serviceKm),
      coverage: +(riders / Math.max(1, demandTotal) * 100).toFixed(2),
      cityStats,
    };
  }
  window.TransitSim = { calculate, km, zones, zoneCities };
})();
