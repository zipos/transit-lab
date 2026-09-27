import { html, raw, directionGlyph } from '../html.js';
import { t, plural, fmtNumber } from '../i18n/index.js';

export function renderRouteList(ctx) {
  const { $, state, allRoutes, routeColor } = ctx;
  const routes = allRoutes();
  $('line-total').textContent = plural('count.patterns', routes.length);
  $('network-peek-total').textContent = fmtNumber(routes.length);
  const q = state.search.toLocaleLowerCase('pl');
  const shown = routes.filter(route => (state.filter === 'all' || route.mode === state.filter) && (!q || `${route.name} ${route.longName}`.toLocaleLowerCase('pl').includes(q)));
  $('visible-total').textContent = t('network.shown', { count: fmtNumber(shown.length) });
  const list = state.showAll || q || state.filter !== 'all' ? shown : shown.slice(0, 80);
  $('route-list').innerHTML = list.map(route => html`<button class="route-card mode-${route.mode}${route.id === state.selected ? ' selected' : ''}" data-route="${route.id}" aria-pressed="${route.id === state.selected}" style="--route-color:${routeColor(route)};width:100%;text-align:left;${raw(route.active === false ? 'opacity:.48;' : '')}"><span class="route-info"><strong>${route.name} <span class="route-dir">${directionGlyph(route)}</span></strong><small>${route.longName || plural('count.stops', route.stopIds.length)}</small></span><span class="route-type">${t('mode.' + route.mode)}</span></button>`).join('') || `<p class="empty-state">${t('network.empty')}</p>`;
  $('more-routes').style.display = !state.showAll && !q && state.filter === 'all' && shown.length > 80 ? '' : 'none';
  document.querySelectorAll('#mode-filters button').forEach(button => button.classList.toggle('active', button.dataset.mode === state.filter));
  $('undo-button').disabled = !state.history.length;
}
