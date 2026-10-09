import { html, raw } from '../html.js';
import { t, fmtDecimal } from '../i18n/index.js?v=2026-10-09-budget';

export function renderResults(ctx) {
  const { $, state, format, compactMillions, region, maybeStartIntro, refreshBudget } = ctx;
  if (typeof refreshBudget === 'function') refreshBudget();
  const stats = state.stats;
  const baseline = state.baseline;
  if (!stats) return;
  const served = stats.passengers > 0;
  $('pulse-passengers').textContent = compactMillions(stats.passengers);
  $('pulse-share').textContent = `${fmtDecimal(stats.share, 1)}%`;
  $('pulse-share').title = t('results.notCalibrated');
  $('stat-passengers').textContent = format(stats.passengers);
  $('stat-passengers').title = t('results.tripsTitle');
  $('stat-share').textContent = `${fmtDecimal(stats.share, 1)}%`;
  $('stat-share').title = t('results.shareTitle');
  $('stat-travel').textContent = served ? `${fmtDecimal(stats.travel)} min` : '—';
  $('stat-travel').title = served ? t('results.doorTitle') : t('results.doorNone');
  $('stat-satisfaction').textContent = served ? `${format(stats.satisfaction)}` : t('results.noTrips');
  $('stat-satisfaction').closest('.stat-card').classList.toggle('unavailable', !served);
  $('stat-satisfaction').title = served ? t('results.satisfactionTitle') : t('results.satisfactionNone');
  $('stat-wait').textContent = served ? `${fmtDecimal(stats.wait)} min` : '—';
  $('stat-wait').title = served ? t('results.waitTitle') : t('results.waitNone');
  $('stat-cost').textContent = compactMillions(stats.cost);
  $('stat-cost').title = t('results.costTitle', { amount: format(stats.cost) });
  $('stat-cost').setAttribute('aria-label', t('results.costAria', { amount: format(stats.cost) }));
  const delta = (value, base, suffix = '', digits = 0) => {
    const difference = value - base;
    const text = `${difference > 0 ? '+' : ''}${digits ? fmtDecimal(difference, digits) : format(Math.round(difference))}${suffix}`;
    return state.compareName ? t('results.vsPlan', { delta: text, name: state.compareName }) : t('results.vsBaseline', { delta: text });
  };
  const paint = (id, difference, higherIsBetter) => {
    const card = $(id);
    card.classList.remove('positive', 'warning');
    if (!baseline || !difference) return;
    card.classList.add((higherIsBetter ? difference > 0 : difference < 0) ? 'positive' : 'warning');
  };
  $('delta-passengers').textContent = baseline ? delta(stats.passengers, baseline.passengers) : t('results.modelEstimate');
  paint('card-passengers', baseline ? stats.passengers - baseline.passengers : 0, true);
  $('delta-share').textContent = baseline ? `${delta(Math.round(stats.share), Math.round(baseline.share), ` ${t('results.pts')}`)} · ${t('results.notCalibrated')}` : t('results.notCalibrated');
  paint('card-share', baseline ? Math.round(stats.share) - Math.round(baseline.share) : 0, true);
  $('delta-travel').textContent = served ? (baseline ? delta(stats.travel, baseline.travel, ' min', 1) : t('results.minutes')) : t('results.unavailable');
  paint('card-travel', served && baseline ? stats.travel - baseline.travel : 0, false);
  $('delta-satisfaction').textContent = served ? (baseline ? delta(stats.satisfaction, baseline.satisfaction, ` ${t('results.pts')}`) : t('results.modelIndex')) : t('results.unavailable');
  paint('card-satisfaction', served && baseline ? stats.satisfaction - baseline.satisfaction : 0, true);
  $('delta-wait').textContent = served ? (baseline ? delta(stats.wait, baseline.wait, ' min', 1) : t('results.minutes')) : t('results.unavailable');
  paint('card-wait', served && baseline ? stats.wait - baseline.wait : 0, false);
  $('delta-cost').textContent = baseline ? delta(stats.cost, baseline.cost) : t('results.costUnit');
  paint('card-cost', baseline ? stats.cost - baseline.cost : 0, false);
  $('secondary-stats').innerHTML = html`<span title="${t('results.boardingsTitle')}"><b>${format(stats.boardings)}</b> ${t('results.boardings')}</span><span title="${t('results.transfersTitle')}"><b>${served ? fmtDecimal(stats.transfers, 1) : '—'}</b> ${t('results.transfers')}</span><span title="${t('results.accessTitle')}"><b>${format(stats.accessResidents)}</b> ${t('results.access800', { share: fmtDecimal(stats.accessShare, 1) })}</span><span title="${t('results.walkTitle')}"><b>${format(stats.walkTrips)}</b> ${t('results.walkExcluded')}</span>`;
  const cities = Object.keys(stats.cityStats || {}).sort((a, b) => a.localeCompare(b, 'pl'));
  state.resultCity = cities.includes(state.resultCity) ? state.resultCity : (cities.includes(region.defaultResultArea) ? region.defaultResultArea : cities[0]);
  const local = stats.cityStats?.[state.resultCity];
  const original = baseline?.cityStats?.[state.resultCity];
  $('local-results').innerHTML = html`<label>${t('results.local')}<select id="result-city">${raw(cities.map(city => html`<option value="${city}" ${raw(city === state.resultCity ? 'selected' : '')}>${city}</option>`).join(''))}</select></label><div class="local-results-grid"><span><b>${format(local?.passengers || 0)}</b> ${t('results.localTrips')} <small>${original ? delta(local.passengers, original.passengers) : ''}</small></span><span><b>${local?.passengers ? format(local.satisfaction) : '—'}</b> ${t('results.localSatisfaction')} <small>${original && local?.passengers ? delta(local.satisfaction, original.satisfaction, ` ${t('results.pts')}`) : ''}</small></span><span><b>${local?.withinShare != null ? fmtDecimal(local.withinShare, 1) : '—'}%</b> ${t('results.withinShare')} <small>${original ? delta(Math.round(local.withinShare), Math.round(original.withinShare), ` ${t('results.pts')}`) : ''}</small></span></div>`;
  $('result-city').onchange = event => { state.resultCity = event.target.value; renderResults(ctx); };
  const flows = stats.flows;
  const overloaded = (flows?.top || []).filter(item => item.vc > 1).slice(0, 5);
  const label = flows?.refined ? t('results.refined') : flows?.refining ? t('results.refining') : t('results.notCalibrated');
  const rows = !flows
    ? html`<p class="fine-print">${t('results.flowPending')}</p>`
    : overloaded.length
      ? overloaded.map(item => html`<div class="flow-row"><span><b>${item.fromName} → ${item.toName}</b><small>${t('results.overloadedItem', { load: format(Math.round(item.vc * 100)) })}</small></span><button type="button" data-flow-route="${item.routeId}" data-flow-from="${item.fromId}" data-flow-to="${item.toId}">${t('results.showOnMap')}</button></div>`).join('')
      : html`<p class="fine-print">${t('results.overloadedNone')}</p>`;
  $('flow-results').innerHTML = html`<div class="section-title"><h3>${t('results.overloaded')}</h3><span class="value">${label}</span></div>${raw(rows)}`;
  $('flow-results').querySelectorAll('[data-flow-route]').forEach(button => {
    button.onclick = () => ctx.focusFlow(button.dataset.flowRoute, button.dataset.flowFrom, button.dataset.flowTo);
  });
  const budgetHost = $('budget-results');
  if (budgetHost) {
    const budget = state.budgetSummary;
    const challengeLock = !!state.challenge;
    const farebox = budget?.calibrated && budget.fareboxRecovery != null
      ? html`<p><b>${fmtDecimal(budget.fareboxRecovery * 100, 0)}%</b> ${t('results.budgetFarebox')}</p>`
      : '';
    const revenue = budget?.calibrated
      ? html`<p><b>${compactMillions(Math.round(budget.revenueYear || 0))}</b> ${t('results.budgetRevenue')}</p>`
      : html`<p class="fine-print">${t('results.budgetRevenuePending')}</p>`;
    const card = state.budgetMode && budget
      ? html`<div class="budget-card ${raw(budget.overBudget ? 'warning' : '')}"><div class="section-title"><h3>${t('results.budget')}</h3><span class="value">${compactMillions(budget.capital)} / ${compactMillions(budget.budgetCap)}</span></div><p><b>${compactMillions(budget.capitalInfra)}</b> ${t('results.budgetCapital')}</p><p><b>${compactMillions(Math.round(budget.opDeltaYear))}</b> ${t('results.budgetOpYear')}</p>${raw(revenue)}${raw(farebox)}${raw(budget.costPerNewRider != null ? html`<p><b>${format(Math.round(budget.costPerNewRider))}</b> ${t('results.budgetPerRider')}</p>` : '')}</div>`
      : '';
    budgetHost.innerHTML = html`<label class="toggle-row"><input id="budget-mode" type="checkbox" ${raw(state.budgetMode ? 'checked' : '')} ${raw(challengeLock ? 'disabled' : '')}> ${t('results.budgetMode')}</label>${raw(card)}`;
    const toggle = $('budget-mode');
    if (toggle && !challengeLock) toggle.onchange = event => {
      state.budgetMode = event.target.checked;
      if (typeof refreshBudget === 'function') refreshBudget();
      renderResults(ctx);
      if (typeof ctx.renderInspector === 'function') ctx.renderInspector();
    };
  }
  maybeStartIntro();
}
