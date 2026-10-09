import { html, raw } from '../html.js';
import { t, plural, fmtNumber, fmtDecimal } from '../i18n/index.js?v=2026-10-09-shell';
import { combinedHeadway } from '../lines.js?v=2026-09-28-share2';

export function intervalLabel(services) {
  const running = services.filter(service => service.runs);
  if (!running.length) return t('stop.off');
  if (running.length === 1) return t('stop.every', { minutes: running[0].headway });
  const minutes = String(fmtDecimal(combinedHeadway(running.map(service => service.headway)), 1)).replace(/[.,]0$/, '');
  return t('line.everyCombined', { minutes });
}

export function renderRouteList(ctx) {
  const { $, state, lines, routeColor, sim } = ctx;
  const catalog = lines();
  $('line-total').textContent = plural('count.lines', catalog.length);
  $('network-peek-total').textContent = fmtNumber(catalog.length);
  const q = state.search.toLocaleLowerCase('pl');
  const ranked = [];
  for (const line of catalog) {
    if (state.filter !== 'all' && line.mode !== state.filter) continue;
    if (!q) { ranked.push([0, line]); continue; }
    const name = line.name.toLocaleLowerCase('pl');
    const terminals = line.terminals.toLocaleLowerCase('pl');
    const stops = line.stopNames.toLocaleLowerCase('pl');
    const rank = name.includes(q) ? 0 : terminals.includes(q) ? 1 : stops.includes(q) ? 2 : -1;
    if (rank >= 0) ranked.push([rank, line]);
  }
  ranked.sort((a, b) => a[0] - b[0]);
  const shown = ranked.map(([, line]) => line);
  $('visible-total').textContent = t('network.shown', { count: fmtNumber(shown.length) });
  const list = state.showAll || q || state.filter !== 'all' ? shown : shown.slice(0, 80);
  const selected = state.selected;
  $('route-list').innerHTML = list.map(line => {
    const active = line.patterns.some(pattern => pattern.id === selected);
    const services = line.patterns.map(pattern => pattern.active === false ? { runs: false, headway: pattern.headway } : sim.resolveService(pattern, state.daypart));
    const variants = Math.max(...line.directions.map(([, patterns]) => patterns.length));
    const dim = line.patterns.every(pattern => pattern.active === false);
    return html`<button class="route-card mode-${line.mode}${active ? ' selected' : ''}" data-route="${line.directions[0][1][0].id}" aria-pressed="${active}" style="--route-color:${routeColor(line.patterns[0])};width:100%;text-align:left;${dim ? 'opacity:.48;' : ''}"><span class="route-info"><strong>${line.name}</strong><small>${line.terminals}</small>${raw(variants > 1 ? html`<small>${plural('count.variants', variants)}</small>` : '')}</span><span class="route-type">${intervalLabel(services)} · ${t('mode.' + line.mode)}</span></button>`;
  }).join('') || `<p class="empty-state">${t('network.empty')}</p>`;
  $('more-routes').style.display = !state.showAll && !q && state.filter === 'all' && shown.length > 80 ? '' : 'none';
  document.querySelectorAll('#mode-filters button').forEach(button => button.classList.toggle('active', button.dataset.mode === state.filter));
  $('undo-button').disabled = !state.history.length;
}
