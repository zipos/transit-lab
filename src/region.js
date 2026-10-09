/* Loads one region. file:// cannot fetch the JSON snapshots. */
import { t, getLocale, applyDom } from './i18n/index.js?v=2026-09-28-share2';

const $ = id => document.getElementById(id);
const language = () => getLocale();
const label = value => value?.[language()] || value?.en || value?.pl || '';

function fail(message) {
  const card = $('loading');
  if (!card) return;
  card.classList.add('failed');
    card.querySelector('strong').textContent = t('loading.failed');
  card.querySelector('small').textContent = message;
}

async function loadJson(url, onProgress) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) return response.json();
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress?.(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function rememberRegion(id) {
  try { localStorage.setItem('transit-lab:region', id); } catch (_) {}
}

function showPicker(index) {
  $('loading')?.remove();
  const picker = document.createElement('div');
  picker.className = 'region-picker';
  picker.innerHTML = `<div class="region-picker-card"><p>${t('app.name')}</p><h1>${t('picker.choose')}</h1><div class="region-picker-list">${index.map(region => `<button type="button" data-region="${region.id}" ${region.status === 'live' ? '' : 'disabled'}>${label(region.name)}<small>${t('picker.' + region.status)}</small></button>`).join('')}</div></div>`;
  picker.addEventListener('click', event => {
    const id = event.target.closest('[data-region]')?.dataset.region;
    if (!id) return;
    const url = new URL(location.href);
    url.searchParams.set('region', id);
    location.href = url.toString();
  });
  document.body.appendChild(picker);
}

export function paintRegion(region) { applyChrome(region); }

function applyChrome(region) {
  document.title = `${label(region.shortName)} / ${t('app.name')}`;
    document.documentElement.lang = language();
    $('map').setAttribute('aria-label', t('map.of', { name: label(region.name) }));
    document.querySelector('.brand').innerHTML = `${label(region.shortName)} <span style="color:#8291a1;font-weight:600">/</span> ${t('app.name')} <span class="chip" style="margin-left:9px">${t('app.badge')}</span>`;
    document.querySelector('.top-caption').textContent = t('top.caption', { count: region.municipalities.length });
    $('fit-button').title = t('top.fit', { count: region.municipalities.length });
}

export async function loadRegion() {
  const requested = new URLSearchParams(location.search).get('region');
  let remembered = null;
  try { remembered = localStorage.getItem('transit-lab:region'); } catch (_) {}
  const index = await loadJson('./regions/index.json');
  const live = index.filter(region => region.status === 'live');
  const id = [requested, remembered].find(value => live.some(region => region.id === value))
    /* A single live region is not a choice: open it directly so first visits boot into the app. */
    ?? (live.length === 1 ? live[0].id : null);
  if (!id) { showPicker(index); return null; }
  rememberRegion(id);
  const region = await loadJson(`./regions/${id}/region.json`);
  const lock = await loadJson(`./data/${id}/manifest.lock.json`);
  const small = $('loading')?.querySelector('small');
    const progress = (received, total) => { if (small && total) small.textContent = t('loading.progress', { percent: Math.round(100 * received / total) }); };
  const [network, population, templates, baseline, challenges] = await Promise.all([
    loadJson(`./data/${id}/network.json?v=${lock.network.sha256}`, progress),
    loadJson(`./data/${id}/population.json?v=${lock.population.sha256}`, progress),
    loadJson(`./regions/${id}/templates.json?v=${lock.templates.sha256}`),
    loadJson(`./data/${id}/baseline.json?v=2026-09-28-engine`).catch(() => null),
    loadJson(`./regions/${id}/challenges.json?v=2026-10-09-challenges`).catch(() => ({ challenges: [] })),
  ]);
  window.TRANSIT_REGION = region;
  window.TRANSIT_NETWORK = network;
  window.TRANSIT_POPULATION = population;
  window.TRANSIT_TEMPLATES = templates;
  window.TRANSIT_BASELINE = baseline;
  window.TRANSIT_CHALLENGES = challenges;
  window.TRANSIT_URLS = {
    network: new URL(`./data/${id}/network.json?v=${lock.network.sha256}`, document.baseURI).href,
    population: new URL(`./data/${id}/population.json?v=${lock.population.sha256}`, document.baseURI).href,
    baseline: new URL(`./data/${id}/baseline.json?v=2026-09-28-engine`, document.baseURI).href,
  };
  applyChrome(region);
  $('loading')?.remove();
  return { region, network, population, templates, challenges, cacheVersion: lock.network.sha256.slice(0, 12) };
}

export function reportRegionError(error) {
  fail(error?.message || t('loading.file'));
}
