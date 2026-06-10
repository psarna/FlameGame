import { test, expect } from '@playwright/test';

test('high-quality render path (bloom, shadows, composer)', async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/?quality=high&url=https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-grep.svg');
  await page.waitForFunction(() => window.game && window.game.isRunning && window.game.knight,
    null, { timeout: 60000 });

  const state = await page.evaluate(() => ({
    quality: window.game.quality,
    composer: !!window.game.composer,
    shadows: window.game.renderer.shadowMap.enabled,
  }));
  console.log('HQ STATE', JSON.stringify(state));
  expect(state.quality).toBe('high');
  expect(state.composer).toBe(true);
  expect(state.shadows).toBe(true);

  // let several frames render through the composer, play a bit
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.press('x');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');

  await page.locator('#gameContainer').screenshot({ path: 'test-results/shot_hq.png' });
  console.log('ERRORS', JSON.stringify(errors));
  expect(errors.filter(e => !e.includes('favicon'))).toEqual([]);
});
