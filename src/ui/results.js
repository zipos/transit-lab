import { html, raw } from '../html.js';

export function renderResults(ctx) {
  const { $, state, format, compactMillions, region, maybeStartIntro } = ctx;
  const stats = state.stats;
  const baseline = state.baseline;
  if (!stats) return;
  const served = stats.passengers > 0;
  $('pulse-passengers').textContent = compactMillions(stats.passengers);
  $('pulse-satisfaction').textContent = served ? stats.satisfaction.toFixed(2) : '—';
  $('stat-passengers').textContent = format(stats.passengers);
  $('stat-satisfaction').textContent = served ? `${stats.satisfaction.toFixed(2)}/100` : 'No trips';
  $('stat-satisfaction').closest('.stat-card').classList.toggle('unavailable', !served);
  $('stat-satisfaction').title = served ? 'Modeled satisfaction index, not observed survey data.' : 'No modeled transit trips were served; satisfaction cannot be estimated.';
  $('stat-wait').textContent = served ? `${stats.wait.toFixed(2)} min` : '—';
  $('stat-wait').title = served ? 'Average modeled waiting time across all boardings.' : 'No modeled transit trips were served; waiting time cannot be estimated.';
  $('stat-cost').textContent = compactMillions(stats.cost);
  $('stat-cost').title = `zł ${format(stats.cost)} per simulated day`;
  $('stat-cost').setAttribute('aria-label', `Operating cost: ${format(stats.cost)} Polish złoty per simulated day`);
  const delta = (value, base, suffix = '', digits = 0) => {
    const difference = value - base;
    return `${difference > 0 ? '+' : ''}${digits ? difference.toFixed(digits) : format(difference)}${suffix} vs baseline`;
  };
  $('delta-passengers').textContent = baseline ? delta(stats.passengers, baseline.passengers) : 'Model estimate';
  $('delta-satisfaction').textContent = served ? (baseline ? delta(stats.satisfaction, baseline.satisfaction, ' pts', 2) : 'Model index') : 'Unavailable';
  $('secondary-stats').innerHTML = html`<span><b>${served ? `${stats.travel.toFixed(2)} min` : '—'}</b> journey</span><span><b>${served ? stats.transfers : '—'}</b> transfers</span><span><b>${stats.coverage}%</b> demand served</span>`;
  const cities = Object.keys(stats.cityStats || {}).sort((a, b) => a.localeCompare(b, 'pl'));
  state.resultCity = cities.includes(state.resultCity) ? state.resultCity : (cities.includes(region.defaultResultArea) ? region.defaultResultArea : cities[0]);
  const local = stats.cityStats?.[state.resultCity];
  const original = baseline?.cityStats?.[state.resultCity];
  $('local-results').innerHTML = html`<label>Local impact<select id="result-city">${raw(cities.map(city => html`<option value="${city}" ${raw(city === state.resultCity ? 'selected' : '')}>${city}</option>`).join(''))}</select></label><div class="local-results-grid"><span><b>${format(local?.passengers || 0)}</b> trips <small>${original ? delta(local.passengers, original.passengers) : ''}</small></span><span><b>${local?.passengers ? local.satisfaction.toFixed(2) : '—'}</b> satisfaction <small>${original && local?.passengers ? delta(local.satisfaction, original.satisfaction, ' pts', 2) : ''}</small></span><span><b>${local?.coverage.toFixed(2) || '0.00'}%</b> demand served <small>${original ? delta(local.coverage, original.coverage, ' pts', 2) : ''}</small></span></div>`;
  $('result-city').onchange = event => { state.resultCity = event.target.value; renderResults(ctx); };
  maybeStartIntro();
}
