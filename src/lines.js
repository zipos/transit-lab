const modeRank = { metro: 0, rail: 1, tram: 2, bus: 3 };

export function combinedHeadway(headways) {
  const values = headways.filter(value => value > 0);
  if (!values.length) return null;
  const rate = values.reduce((sum, value) => sum + 1 / value, 0);
  return Math.round((1 / rate) * 10) / 10;
}

export function groupLines(routes, stopOf = () => null) {
  const buckets = new Map();
  for (const route of routes) {
    const key = `${route.source}:${route.name}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(route);
  }
  const lines = [];
  for (const [key, patterns] of buckets) {
    const byDir = new Map();
    for (const pattern of patterns) {
      const dir = pattern.direction == null ? '0' : String(pattern.direction);
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push(pattern);
    }
    const directions = [...byDir.entries()].map(([dir, list]) => {
      list.sort((a, b) => b.stopIds.length - a.stopIds.length);
      return [dir, list];
    }).sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }));
    const primary = directions[0][1][0];
    const first = stopOf(primary.stopIds[0])?.name || '';
    const last = stopOf(primary.stopIds.at(-1))?.name || '';
    const terminals = directions.length > 1 && first && last ? `${first} ⇄ ${last}` : `${first} → ${last}`;
    const stopNames = [];
    const seen = new Set();
    for (const pattern of patterns) {
      for (const id of pattern.stopIds) {
        const name = stopOf(id)?.name;
        if (name && !seen.has(name)) { seen.add(name); stopNames.push(name); }
      }
    }
    lines.push({
      key,
      name: patterns[0].name,
      mode: patterns[0].mode,
      source: patterns[0].source,
      patterns,
      directions,
      terminals,
      stopNames: stopNames.join(' ')
    });
  }
  lines.sort((a, b) => (modeRank[a.mode] ?? 9) - (modeRank[b.mode] ?? 9) || a.name.localeCompare(b.name, 'pl', { numeric: true }));
  return lines;
}
