/* Capture jobs: each drives the real app and saves raw screenshots into SHOTS. */
import { openApp, view, shot, settle, proj, waitStats, hideDensity, drawMetro, METRO, openLayers, closeLayers } from './lib.mjs';

const refine = p => p.waitForTimeout(6000);   // let the crowding refinement passes finish
const hideBuses = async p => { await openLayers(p); await p.locator('[data-map-mode="bus"]').click(); await closeLayers(p); await p.waitForTimeout(300); };
export const jobs = {
  async hero(b) {
    for (const [name, scheme, map] of [['hero-light', 'light', 'light'], ['hero-dark', 'dark', 'dark']]) {
      const { p, ctx } = await openApp(b, { scheme, map });
      await hideDensity(p); await view(p, [19.03, 50.27], 11.1, { pitch: 30, bearing: -8 });
      await p.click('#play-button'); await p.waitForTimeout(3000); await shot(p, name);
      await ctx.close();
    }
  },
  async edit(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light' });
    await hideDensity(p); await hideBuses(p);
    await p.fill('#route-search', 'T6'); await p.waitForTimeout(400);
    await p.locator('[data-route]').first().click(); await p.waitForTimeout(800);
    await view(p, [19.0, 50.3], 11.2);
    await shot(p, 'line-inspector');
    await p.fill('#route-headway', '6'); await p.locator('#route-headway').press('Enter');
    await waitStats(p); await refine(p);
    await p.click('[data-panel-tab="results"]'); await p.waitForTimeout(800);
    await shot(p, 'results');
    await ctx.close();
  },
  async metro(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light' });
    await hideDensity(p); await hideBuses(p); await view(p, [19.06, 50.27], 11.6);
    await drawMetro(p, METRO); await p.waitForTimeout(4500); await settle(p, 600);
    await p.evaluate(() => { document.querySelector('.sidebar').scrollTop = 0; }); await p.waitForTimeout(300);
    await shot(p, 'metro-draft');
    await p.fill('#metro-headway', '3'); await p.waitForTimeout(500);
    await p.click('#finish-metro'); await waitStats(p); await refine(p);
    await p.waitForTimeout(700);
    await shot(p, 'metro-open');
    await ctx.close();
  },

  async layers(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light' });
    await view(p, [19.06, 50.27], 11.3);
    await drawMetro(p, METRO); await p.waitForTimeout(500);
    await p.fill('#metro-headway', '3'); await p.click('#finish-metro'); await waitStats(p); await refine(p);
    await p.click('[data-panel-tab="network"]'); await p.waitForTimeout(500);
    await openLayers(p);
    await p.selectOption('#planning-layer', 'access'); await settle(p, 900); await shot(p, 'layer-access');
    await p.selectOption('#planning-layer', 'winners'); await waitStats(p); await settle(p, 900);
    await settle(p, 1200); await shot(p, 'layer-winners');
    await p.selectOption('#planning-layer', 'population'); await settle(p, 900); await shot(p, 'layer-density');
    // travel time from a point in Katowice
    await p.selectOption('#planning-layer', 'travel');
    await closeLayers(p);
    const [x, y] = await proj(p, [19.0231, 50.2594]);
    await p.mouse.click(x, y, { button: 'right' }); await p.waitForTimeout(500);
    await p.locator('[data-context-action="travel"]').click();
    await p.waitForTimeout(3500); await settle(p, 1000); await openLayers(p); await p.waitForTimeout(400);
    await shot(p, 'layer-travel');
    await ctx.close();
  },
  async flows(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light' });
    await hideDensity(p); await view(p, [19.03, 50.27], 11.3);
    await refine(p);
    await openLayers(p);
    await p.locator('[data-map-mode="bus"]').click(); await p.waitForTimeout(400);
    await p.locator('#flows-toggle').check(); await p.waitForTimeout(1500);
    await p.locator('#flows-crowd-toggle').check().catch(() => {}); await settle(p, 1500);
    await closeLayers(p); await p.waitForTimeout(500);
    await shot(p, 'flows-crowding');
    await ctx.close();
  },
  async challenges(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light' });
    await hideDensity(p); await hideBuses(p);
    await p.locator('#challenge-section summary').click(); await p.waitForTimeout(500);
    await p.locator('[data-challenge-id]').first().click(); await p.waitForTimeout(1500);
    await view(p, [19.07, 50.27], 11.3);
    await p.evaluate(() => { const s = document.querySelector('.sidebar'); const t = document.getElementById('challenge-section'); s.scrollTop += t.getBoundingClientRect().top - s.getBoundingClientRect().top - 12; }); await p.waitForTimeout(500);
    await shot(p, 'challenges');
    await ctx.close();
  },
  async budget(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light' });
    await hideDensity(p); await hideBuses(p); await view(p, [19.06, 50.27], 11.4);
    await drawMetro(p, METRO); await p.fill('#metro-headway', '3'); await p.click('#finish-metro'); await waitStats(p);
    await p.click('[data-panel-tab="results"]'); await p.waitForTimeout(600);
    await p.locator('#budget-mode').check(); await waitStats(p); await refine(p);
    await p.evaluate(() => { const s = document.querySelector('.sidebar'); const t = document.getElementById('flow-results'); s.scrollTop += t.getBoundingClientRect().top - s.getBoundingClientRect().top - 12; }); await p.waitForTimeout(500);
    await shot(p, 'budget');
    await ctx.close();
  },
  async modals(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light' });
    await hideDensity(p);
    await p.click('#about-button'); await p.waitForTimeout(900); await shot(p, 'modal-data');
    await p.click('#modal-close'); await p.waitForTimeout(300);
    await p.click('#slots-button'); await p.waitForTimeout(900); await shot(p, 'modal-plans');
    await ctx.close();
  },
  async tour(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light', tour: true });
    await view(p, [19.03, 50.27], 10.6); await p.waitForTimeout(1200);
    await shot(p, 'tour');
    await ctx.close();
  },

  async mobile(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light', w: 390, h: 844, mobile: true });
    await hideDensity(p); await view(p, [19.03, 50.27], 11.2);
    await p.click('#play-button'); await p.waitForTimeout(3000); await shot(p, 'm-map');
    await p.click('[data-view="network"]'); await p.waitForTimeout(900); await shot(p, 'm-network');
    await p.fill('#route-search', 'T6'); await p.waitForTimeout(400);
    await p.locator('[data-route]').first().click(); await p.waitForTimeout(1500); await shot(p, 'm-line');
    await ctx.close();
    const pl = await openApp(b, { scheme: 'light', locale: 'pl-PL', w: 390, h: 844, mobile: true });
    await hideDensity(pl.p); await view(pl.p, [19.03, 50.27], 11.2);
    await pl.p.click('#play-button'); await pl.p.waitForTimeout(3000); await shot(pl.p, 'm-pl-map');
    await pl.p.click('[data-view="network"]'); await pl.p.waitForTimeout(600);
    await pl.p.fill('#route-search', 'T6'); await pl.p.waitForTimeout(400);
    await pl.p.locator('[data-route]').first().click(); await pl.p.waitForTimeout(1500); await shot(pl.p, 'm-pl-line');
    await pl.ctx.close();
  },
  async thin(b) {
    const { p, ctx } = await openApp(b, { scheme: 'light' });
    await hideDensity(p);
    await p.click('#play-button');
    await view(p, [19.0, 50.25], 10.1); await p.waitForTimeout(2500);
    const n1 = await p.evaluate(() => window.__DEBUG__.lastVehicleCount);
    await shot(p, 'thin-region', { clip: { x: 320, y: 64, width: 1120, height: 780 } });
    await view(p, [18.905, 50.172], 13.3); await p.waitForTimeout(2500);
    const n2 = await p.evaluate(() => window.__DEBUG__.lastVehicleCount);
    await shot(p, 'thin-zoom', { clip: { x: 320, y: 64, width: 1120, height: 780 } });
    console.log('vehicles region', n1, 'zoomed', n2);
    await ctx.close();
  },
};
