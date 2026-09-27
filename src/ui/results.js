import { html, raw } from '../html.js';
import { t, fmtDecimal } from '../i18n/index.js';

export function renderResults(ctx) {
  const { $, state, format, compactMillions, region, maybeStartIntro } = ctx;
  const stats = state.stats;
  const baseline = state.baseline;
  if (!stats) return;
  const served = stats.passengers > 0;
  $('pulse-passengers').textContent = compactMillions(stats.passengers);
  $('pulse-satisfaction').textContent = served ? fmtDecimal(stats.satisfaction) : '—';
  $('stat-passengers').textContent = format(stats.passengers);
  $('stat-satisfaction').textContent = served ? `${fmtDecimal(stats.satisfaction)}/100` : t('results.noTrips');
  $('stat-satisfaction').closest('.stat-card').classList.toggle('unavailable', !served);
  $('stat-satisfaction').title = served ? t('results.satisfactionTitle') : t('results.satisfactionNone');
  $('stat-wait').textContent = served ? `${fmtDecimal(stats.wait)} min` : '—';
  $('stat-wait').title = served ? t('results.waitTitle') : t('results.waitNone');
  $('stat-cost').textContent = compactMillions(stats.cost);
  $('stat-cost').title = t('results.costTitle', { amount: format(stats.cost) });
  $('stat-cost').setAttribute('aria-label', t('results.costAria', { amount: format(stats.cost) }));
  const delta = (value, base, suffix = '', digits = 0) => {
    const difference = value - base;
    return t('results.vsBaseline', { delta: `${difference > 0 ? '+' : ''}${digits ? fmtDecimal(difference, digits) : format(difference)}${suffix}` });
  };
  $('delta-passengers').textContent = baseline ? delta(stats.passengers, baseline.passengers) : t('results.modelEstimate');
  $('delta-satisfaction').textContent = served ? (baseline ? delta(stats.satisfaction, baseline.satisfaction, ` ${t('results.pts')}`, 2) : t('results.modelIndex')) : t('results.unavailable');
  $('secondary-stats').innerHTML = html`<span><b>${served ? `${fmtDecimal(stats.travel)} min` : '—'}</b> ${t('results.journey')}</span><span><b>${served ? stats.transfers : '—'}</b> ${t('results.transfers')}</span><span><b>${stats.coverage}%</b> ${t('results.demandServed')}</span>`;
  const cities = Object.keys(stats.cityStats || {}).sort((a, b) => a.localeCompare(b, 'pl'));
  state.resultCity = cities.includes(state.resultCity) ? state.resultCity : (cities.includes(region.defaultResultArea) ? region.defaultResultArea : cities[0]);
  const local = stats.cityStats?.[state.resultCity];
  const original = baseline?.cityStats?.[state.resultCity];
  $('local-results').innerHTML = html`<label>${t('results.local')}<select id="result-city">${raw(cities.map(city => html`<option value="${city}" ${raw(city === state.resultCity ? 'selected' : '')}>${city}</option>`).join(''))}</select></label><div class="local-results-grid"><span><b>${format(local?.passengers || 0)}</b> ${t('results.localTrips')} <small>${original ? delta(local.passengers, original.passengers) : ''}</small></span><span><b>${local?.passengers ? fmtDecimal(local.satisfaction) : '—'}</b> ${t('results.localSatisfaction')} <small>${original && local?.passengers ? delta(local.satisfaction, original.satisfaction, ` ${t('results.pts')}`, 2) : ''}</small></span><span><b>${local?.coverage != null ? fmtDecimal(local.coverage) : '0.00'}%</b> ${t('results.demandServed')} <small>${original ? delta(local.coverage, original.coverage, ` ${t('results.pts')}`, 2) : ''}</small></span></div>`;
  $('result-city').onchange = event => { state.resultCity = event.target.value; renderResults(ctx); };
  maybeStartIntro();
}
