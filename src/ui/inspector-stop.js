import { html, raw, directionGlyph } from '../html.js';
import { t, plural } from '../i18n/index.js';

export function renderStopInspector(ctx) {
  const { $, state, stop, network, allRoutes, sim } = ctx;
  if (!state.selectedStop) return false;
  const el = $('inspector-content');
  $('inspector-peek-label').textContent = '◎';
  $('inspector-peek-kind').textContent = t('stop.kind');
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
      if (!previous && !next) inboundStops.add(t('stop.origin'));
    });
    return { route, inbound: [...inboundStops].join(' / ') || t('stop.origin') };
  }).sort((a, b) => Number(a.route.active === false) - Number(b.route.active === false) || a.route.mode.localeCompare(b.route.mode) || a.route.name.localeCompare(b.route.name, 'pl'));
  const rows = services.map(({ route, inbound }) => {
    const service = sim.resolveService(route, state.daypart);
    const interval = route.active === false || !service.runs ? t('stop.off') : t('stop.every', { minutes: service.headway });
    return html`<button type="button" class="stop-service mode-${route.mode}" data-inspect-route="${route.id}"><span class="stop-service-main"><b>${route.name} ${directionGlyph(route)}</b><small>${t('mode.' + route.mode)} · ${t('stop.from')} ${inbound}</small></span><span class="stop-service-interval">${interval}</span></button>`;
  }).join('');
  const place = station.city === 'Player' ? t('draft.playerLine', { mode: t('mode.line') }) : (station.city || t('stop.fallback'));
  el.innerHTML = html`<div class="section"><div class="section-title"><h2>${t('stop.chip')}</h2><button class="selection-close" type="button" data-clear-selection aria-label="${t('stop.close')}">×</button></div><h2 class="inspector-heading">${station.name}</h2><p class="intro">${place} · ${plural('count.patterns', services.length)}</p><p class="fine-print">${t('stop.fine')}</p></div><div class="section"><div class="section-title"><h3>${t('stop.service')}</h3><span class="value">${services.length}</span></div><div class="stop-service-list">${raw(rows || html`<p class="empty-state">${t('stop.empty')}</p>`)}</div></div>`;
  return true;
}
