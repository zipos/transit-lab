import { html, raw, directionGlyph } from '../html.js';
import { t, plural } from '../i18n/index.js';
import { intervalLabel } from './list.js';

export function renderStopInspector(ctx) {
  const { $, state, stop, network, allRoutes, sim, lineFor } = ctx;
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
  const serving = allRoutes().filter(route => route.stopIds.some(id => areaIds.has(id)));
  const grouped = new Map();
  for (const route of serving) {
    const line = lineFor(route.id);
    const key = line?.key || route.id;
    if (!grouped.has(key)) grouped.set(key, { line, routes: [] });
    grouped.get(key).routes.push(route);
  }
  const services = [...grouped.values()].map(group => {
    const directions = [...new Set(group.routes.map(route => directionGlyph(route)))].join(' ');
    const chosen = group.routes.find(route => route.stopIds.includes(station.id)) || group.routes[0];
    return { ...group, directions, chosen };
  }).sort((a, b) => Number(a.routes.every(route => route.active === false)) - Number(b.routes.every(route => route.active === false)) || a.chosen.mode.localeCompare(b.chosen.mode) || a.chosen.name.localeCompare(b.chosen.name, 'pl'));
  const rows = services.map(({ routes, directions, chosen }) => {
    const interval = intervalLabel(routes.map(route => route.active === false ? { runs: false, headway: route.headway } : sim.resolveService(route, state.daypart)));
    return html`<button type="button" class="stop-service mode-${chosen.mode}" data-inspect-route="${chosen.id}"><span class="stop-service-main"><b>${chosen.name} ${directions}</b><small>${t('mode.' + chosen.mode)}</small></span><span class="stop-service-interval">${interval}</span></button>`;
  }).join('');
  const place = station.city === 'Player' ? t('draft.playerLine', { mode: t('mode.line') }) : (station.city || t('stop.fallback'));
  el.innerHTML = html`<div class="section"><div class="section-title"><h2>${t('stop.chip')}</h2><button class="selection-close" type="button" data-clear-selection aria-label="${t('stop.close')}">×</button></div><h2 class="inspector-heading">${station.name}</h2><p class="intro">${place} · ${plural('count.lines', services.length)}</p><p class="fine-print">${t('stop.fine')}</p></div><div class="section"><div class="section-title"><h3>${t('stop.service')}</h3><span class="value">${services.length}</span></div><div class="stop-service-list">${raw(rows || html`<p class="empty-state">${t('stop.empty')}</p>`)}</div></div>`;
  return true;
}
