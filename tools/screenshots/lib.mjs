/* Shared helpers: a static server for the repo, a headless browser, and small page actions. */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SHOTS = path.join(os.tmpdir(), 'transit-lab-shots');
export const DOCS = path.join(ROOT, 'docs/screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(DOCS, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

/** Serve the repo on a free port. python's http.server stalls under a parallel browser, so this is a plain node server. */
export function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}/?debug=1` })));
}

/** CHROME_PATH picks a browser; otherwise playwright-core uses the one `npx playwright install chromium` fetched.
 *  The software-GL flags let it render the map on machines without a GPU. */
export const launch = () => chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

let appUrl;
export const setUrl = url => { appUrl = url; };

/** Open a fresh app. scheme is the system colour scheme (panels); map is the basemap style ('light' by default). */
export async function openApp(b, { scheme = 'light', map = 'light', locale = 'en-US', w = 1440, h = 900, mobile = false, tour = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1.5, isMobile: mobile, hasTouch: mobile, locale, colorScheme: scheme });
  await ctx.addInitScript(([map, tour]) => {
    try { localStorage.setItem('transit-lab:settings', JSON.stringify({ mapTheme: map, ...(tour ? {} : { introDone: true }) })); } catch (_) {}
  }, [map, tour]);
  const p = await ctx.newPage();
  await p.goto(appUrl);
  await p.locator('#loading').waitFor({ state: 'detached', timeout: 60000 });
  await p.waitForFunction(() => /\d/.test(document.getElementById('stat-passengers')?.textContent || ''), null, { timeout: 60000 });
  await settle(p);
  return { ctx, p };
}

export async function settle(p, extra = 500) {
  await p.evaluate(() => new Promise(res => {
    const m = window.__DEBUG__?.map; if (!m) return res();
    if (m.loaded() && !m.isMoving()) setTimeout(res, 250); else m.once('idle', res);
    setTimeout(res, 6000);
  }));
  await p.waitForTimeout(extra);
}

export async function view(p, center, zoom, { pitch = 0, bearing = 0 } = {}) {
  await p.evaluate(([c, z, pi, be]) => window.__DEBUG__.map.jumpTo({ center: c, zoom: z, pitch: pi, bearing: be }), [center, zoom, pitch, bearing]);
  await settle(p, 900);
}

export const proj = (p, lngLat) => p.evaluate(ll => { const m = window.__DEBUG__.map.project(ll); return [m.x, m.y]; }, lngLat);
export const shot = (p, name, opts = {}) => p.screenshot({ path: path.join(SHOTS, `${name}.png`), ...opts });
export const waitStats = async p => { await p.waitForTimeout(300); await p.waitForFunction(() => [...document.querySelectorAll('.sim-progress')].every(e => e.hidden), null, { timeout: 60000 }); await p.waitForTimeout(500); };
export const hideDensity = p => p.evaluate(() => document.getElementById('heatmap-toggle').click());
export const openLayers = p => p.evaluate(() => { document.getElementById('layers-menu').open = true; });
export const closeLayers = p => p.evaluate(() => { document.getElementById('layers-menu').open = false; });

export const METRO = [[19.0040, 50.2575], [19.0231, 50.2594], [19.0590, 50.2655], [19.0960, 50.2740], [19.1302, 50.2796]];
export async function drawMetro(p, stations = METRO) {
  await p.click('#metro-tool'); await p.waitForTimeout(500);
  for (const s of stations) { const [x, y] = await proj(p, s); await p.mouse.click(x, y); await p.waitForTimeout(400); }
}
