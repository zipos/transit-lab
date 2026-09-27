/* Loads one region, then starts the sandbox. file:// cannot fetch the JSON snapshots. */
(() => {
  const $ = id => document.getElementById(id);
  const language = (navigator.language || '').toLowerCase().startsWith('pl') ? 'pl' : 'en';
  const label = value => value?.[language] || value?.en || value?.pl || '';

  function fail(message) {
    const card = $('loading');
    if (!card) return;
    card.classList.add('failed');
    card.querySelector('strong').textContent = 'Could not open this region';
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
    picker.innerHTML = `<div class="region-picker-card"><p>TRANSIT LAB</p><h1>Choose a region</h1><div class="region-picker-list">${index.map(region => `<button type="button" data-region="${region.id}" ${region.status === 'live' ? '' : 'disabled'}>${label(region.name)}<small>${region.status}</small></button>`).join('')}</div></div>`;
    picker.addEventListener('click', event => {
      const id = event.target.closest('[data-region]')?.dataset.region;
      if (!id) return;
      const url = new URL(location.href);
      url.searchParams.set('region', id);
      location.href = url.toString();
    });
    document.body.appendChild(picker);
  }

  function applyChrome(region) {
    document.title = `${label(region.shortName)} / Transit Lab`;
    document.documentElement.lang = language;
    $('map').setAttribute('aria-label', `Map of ${label(region.name)}`);
    document.querySelector('.brand').innerHTML = `${label(region.shortName)} <span style="color:#8291a1;font-weight:600">/</span> TRANSIT LAB <span class="chip" style="margin-left:9px">Sandbox alpha</span>`;
    document.querySelector('.top-caption').textContent = `${region.municipalities.length} municipalities · one network`;
    $('fit-button').title = `Fit all ${region.municipalities.length} municipalities`;
  }

  function startScripts(version) {
    const sources = ['sim.js', 'scenario.js', 'app.js'];
    let index = 0;
    const next = () => {
      if (index >= sources.length) return;
      const script = document.createElement('script');
      script.src = `./${sources[index]}?v=${version}`;
      script.onload = () => { index += 1; next(); };
      script.onerror = () => fail(`Could not load ${sources[index]}.`);
      document.body.appendChild(script);
    };
    next();
  }

  async function boot() {
    const requested = new URLSearchParams(location.search).get('region');
    let remembered = null;
    try { remembered = localStorage.getItem('transit-lab:region'); } catch (_) {}
    const index = await loadJson('./regions/index.json');
    const live = index.filter(region => region.status === 'live');
    const id = [requested, remembered].find(value => live.some(region => region.id === value));
    if (!id) { showPicker(index); return; }
    rememberRegion(id);
    const region = await loadJson(`./regions/${id}/region.json`);
    const lock = await loadJson(`./data/${id}/manifest.lock.json`);
    const small = $('loading')?.querySelector('small');
    const progress = (received, total) => { if (small && total) small.textContent = `Loading service snapshot… ${Math.round(100 * received / total)}%`; };
    const [network, population, templates] = await Promise.all([
      loadJson(`./data/${id}/network.json?v=${lock.network.sha256}`, progress),
      loadJson(`./data/${id}/population.json?v=${lock.population.sha256}`, progress),
      loadJson(`./regions/${id}/templates.json?v=${lock.templates.sha256}`)
    ]);
    window.TRANSIT_REGION = region;
    window.TRANSIT_NETWORK = network;
    window.TRANSIT_POPULATION = population;
    window.TRANSIT_TEMPLATES = templates;
    window.TRANSIT_URLS = {
      network: `./data/${id}/network.json?v=${lock.network.sha256}`,
      population: `./data/${id}/population.json?v=${lock.population.sha256}`
    };
    applyChrome(region);
    $('loading')?.remove();
    startScripts(lock.network.sha256.slice(0, 12));
  }

  boot().catch(error => fail(error.message || 'The region files could not be fetched. Use a local web server; opening the HTML file directly will not work.'));
})();
