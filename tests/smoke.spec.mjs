import { test, expect } from '@playwright/test';

test('smoke test: load, select tram T6, enter metro tool, place 2 stations', async ({ page }) => {
  test.setTimeout(60000);
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', error => {
    consoleErrors.push(error.message);
  });

  const appUrl = process.env.APP_URL || 'http://localhost:8765';

  // 1. Load the app
  await page.goto(appUrl);

  // 2. Wait until a passenger number replaces the placeholder
  const passengers = page.locator('#stat-passengers');
  await expect(passengers).toHaveText(/\d/, { timeout: 45000 });

  // Wait for loading overlay to be removed
  await page.locator('#loading').waitFor({ state: 'detached', timeout: 45000 });

  const introSkip = page.locator('#intro-end');
  if (await introSkip.count()) await introSkip.click();
  await page.locator('#layers-menu').evaluate(menu => { menu.open = false; });

  // 3. Select tram T6
  await page.fill('#route-search', 'T6');
  const t6Card = page.locator('#route-list button.route-card', { hasText: 'T6' }).first();
  await expect(t6Card).toBeVisible({ timeout: 10000 });
  await t6Card.click();
  await expect(t6Card).toHaveClass(/selected/);

  // Note: Do not assert that the selected line is non-black (brief 03 bug).

  // 4. Enter the metro tool
  const networkTab = page.locator('.panel-tabs [data-panel-tab="network"], .mobile-tabs [data-view="network"]').locator('visible=true').first();
  if (await networkTab.isVisible()) {
    await networkTab.click();
  }
  const metroButton = page.locator('#metro-tool');
  await expect(metroButton).toBeVisible();
  await metroButton.click();

  // Verify inspector is in metro draft mode
  await expect(page.locator('#inspector-content')).toContainText('Stations');

  // 5. Click the map twice in the open map area (sidebar is on the left, width ~320px)
  const mapElement = page.locator('#map');
  await mapElement.click({ position: { x: 650, y: 300 } });
  await mapElement.click({ position: { x: 750, y: 350 } });

  // 6. Assert the draft shows two stations
  await expect(page.locator('#inspector-content .stop-list .stop-row')).toHaveCount(2);
  await expect(page.locator('#inspector-content .section-title .value')).toHaveText('2');

  // 7. Fail on console errors
  if (consoleErrors.length) console.log('Console errors:\n' + consoleErrors.join('\n'));
  expect(consoleErrors).toEqual([]);
});
