import { html, raw, directionGlyph } from '../html.js';

export function renderStopInspector(ctx) {
  const { $, state, stop, network, allRoutes, sim } = ctx;
  if (!state.selectedStop) return false;
  const el = $('inspector-content');
  $('inspector-peek-label').textContent = '◎';
  $('inspector-peek-kind').textContent = 'stop';
  const station = stop(state.selectedStop);
  if (!station) { state.selectedStop = null; ctx.renderInspector(); return true; }
  const areaIds = new Set([station.id]);
  if (station.area) {
    for (const candidate of network.stops.concat(state.customStops)) {
      if (candidate.area === station.area) areaIds.add(candidate.id);
    }
  }
  const services = allRoutes().filter(route => route.stopIds.some(id => areaIds.has(id))).map(route => {
    const inboundStops = new Set();
    route.stopIds.forEach((id, index) => {
      if (!areaIds.has(id)) return;
      const previous = route.stopIds[index - 1] || (route.ring ? route.stopIds.at(-1) : null);
      const next = route.source === 'player' && !route.ring ? route.stopIds[index + 1] : null;
      for (const neighbor of [previous, next]) if (neighbor) inboundStops.add(stop(neighbor)?.name || neighbor);
      if (!previous && !next) inboundStops.add('Origin');
    });
    return { route, inbound: [...inboundStops].join(' / ') || 'Origin' };
  }).sort((a, b) => Number(a.route.active === false) - Number(b.route.active === false) || a.route.mode.localeCompare(b.route.mode) || a.route.name.localeCompare(b.route.name, 'pl'));
  const rows = services.map(({ route, inbound }) => {
    const service = sim.resolveService(route, state.daypart);
    const interval = route.active === false || !service.runs ? 'Off' : `Every ${service.headway} min`;
    return html`<button type="button" class="stop-service mode-${route.mode}" data-inspect-route="${route.id}"><span class="stop-service-main"><b>${route.name} ${directionGlyph(route)}</b><small>${route.mode} · from ${inbound}</small></span><span class="stop-service-interval">${interval}</span></button>`;
  }).join('');
  el.innerHTML = html`<div class="section"><div class="section-title"><h2>STOP INSPECTOR</h2><button class="selection-close" type="button" data-clear-selection aria-label="Close stop inspector">×</button></div><h2 class="inspector-heading">${station.name}</h2><p class="intro">${station.city || 'Transit stop'} · ${services.length} ${services.length === 1 ? 'pattern' : 'patterns'} using this ${areaIds.size > 1 ? 'interchange' : 'stop'}</p><p class="fine-print">Intervals are scenario estimates per pattern and direction, not a live arrival board. Several patterns may share a line name.</p></div><div class="section"><div class="section-title"><h3>Service at this stop</h3><span class="value">${services.length}</span></div><div class="stop-service-list">${raw(rows || '<p class="empty-state">No lines currently use this stop.</p>')}</div></div>`;
  return true;
}
