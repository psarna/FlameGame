import { test, expect } from '@playwright/test';

const GREP = 'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-grep.svg';

test.describe('FlameGame 3D', () => {
  test('loads the animated knight model with sword animations', async ({ page }) => {
    await page.goto('/?url=' + GREP);
    await page.waitForFunction(() => window.game && window.game.knight && window.game.mixer,
      null, { timeout: 30000 });

    const actions = await page.evaluate(() => Object.keys(window.game.actions));
    expect(actions).toEqual(expect.arrayContaining(
      ['idle', 'run', 'jumpStart', 'jumpAir', 'jumpLand', 'attackSide', 'attackUp', 'attackDown', 'cheer']));

    const idle = await page.evaluate(() => window.game.activeActionName);
    expect(idle).toBe('idle');
  });

  test('renders the level as a single instanced mesh (perf)', async ({ page }) => {
    await page.goto('/?url=' + GREP);
    await page.waitForFunction(() => window.game && window.game.isRunning, null, { timeout: 30000 });

    const info = await page.evaluate(() => ({
      isInstanced: window.game.blockMesh && window.game.blockMesh.isInstancedMesh,
      count: window.game.blockMesh ? window.game.blockMesh.count : 0,
      blocks: window.game.blocks.length,
    }));
    expect(info.isInstanced).toBe(true);
    expect(info.count).toBe(info.blocks);
  });

  test('jumping plays jump animation and gains height', async ({ page }) => {
    await page.goto('/?url=' + GREP);
    await page.waitForFunction(() => window.game && window.game.isRunning && window.game.knight,
      null, { timeout: 30000 });
    // wait until the player has settled on the ground (or a block top)
    await page.waitForFunction(() => !window.game.player.isJumping, null, { timeout: 10000 });
    const baseY = await page.evaluate(() => window.game.player.y);

    await page.keyboard.down(' ');
    // the jump should lift the player above where they were standing
    await page.waitForFunction((y0) =>
      window.game.player.isJumping && window.game.player.y > y0 + 5,
      baseY, { timeout: 5000 });
    await page.keyboard.up(' ');
  });

  test('sword attack destroys blocks, spawns debris and builds combo', async ({ page }) => {
    await page.goto('/?url=' + GREP);
    await page.waitForFunction(() => window.game && window.game.isRunning && window.game.totalBlocks > 0,
      null, { timeout: 30000 });

    // walk into the flame graph swinging
    await page.keyboard.down('ArrowRight');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('x');
      await page.waitForTimeout(110);
    }
    await page.keyboard.up('ArrowRight');

    const state = await page.evaluate(() => ({
      destroyed: window.game.destroyedBlocks,
      comboBest: window.game.combo.best,
      counterText: document.getElementById('blockCounter').textContent,
    }));
    expect(state.destroyed).toBeGreaterThan(0);
    expect(state.comboBest).toBeGreaterThan(0);
    expect(state.counterText).toContain(`${state.destroyed}/`);
  });

  test('destroying every block completes the level with cheer + dialog', async ({ page }) => {
    await page.goto('/?url=' + GREP);
    await page.waitForFunction(() => window.game && window.game.isRunning && window.game.totalBlocks > 0,
      null, { timeout: 30000 });

    // cheat-speedrun: keep a single block right next to the player spawn,
    // then slash it for real to trigger completion
    await page.evaluate(() => {
      const g = window.game;
      const survivor = g.blocks[0];
      survivor.x = 120; survivor.y = 0; survivor.width = 40; survivor.height = 40;
      g.blocks = [survivor];
    });
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(250);
    await page.keyboard.up('ArrowRight');
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('x');
      await page.waitForTimeout(150);
      const done = await page.evaluate(() => window.game.levelComplete);
      if (done) break;
      await page.keyboard.press('ArrowRight');
    }

    await page.waitForFunction(() => window.game.levelComplete, null, { timeout: 5000 });
    const anim = await page.evaluate(() => window.game.activeActionName);
    expect(anim).toBe('cheer');

    await expect(page.locator('.level-complete')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.level-complete h2')).toContainText('Level Complete');
  });
});

test.describe('FlameGame 3D file upload', () => {
  test('loads an uploaded SVG file and Play Again replays it without refetch', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    await page.goto('/');
    await page.waitForFunction(() => window.game && window.game.isRunning, null, { timeout: 30000 });

    await page.locator('#fileInput').setInputFiles('tests/fixtures/tiny-flame.svg');
    await page.waitForFunction(() => window.game.totalBlocks === 3, null, { timeout: 10000 });

    const levelText = await page.locator('#currentLevel').textContent();
    expect(levelText).toContain('tiny-flame.svg');

    // destroy all 3 stacked blocks: stand inside the stack footprint and
    // slash sideways, upward, and during jumps until everything is gone
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');
    for (let i = 0; i < 40; i++) {
      const done = await page.evaluate(() => window.game.levelComplete);
      if (done) break;
      // ground slash
      await page.keyboard.press('x');
      await page.waitForTimeout(120);
      // upward slash
      await page.keyboard.down('ArrowUp');
      await page.keyboard.press('x');
      await page.keyboard.up('ArrowUp');
      await page.waitForTimeout(120);
      // jumping upward slash for the top rows
      await page.keyboard.press(' ');
      await page.waitForTimeout(250);
      await page.keyboard.down('ArrowUp');
      await page.keyboard.press('x');
      await page.keyboard.up('ArrowUp');
      await page.waitForTimeout(300);
    }
    await page.waitForFunction(() => window.game.levelComplete, null, { timeout: 5000 });

    // Play Again must reload the *uploaded* level from memory (no network)
    await expect(page.locator('.level-complete button')).toBeVisible({ timeout: 5000 });
    await page.locator('.level-complete button').click();
    await page.waitForFunction(() =>
      window.game.isRunning && window.game.totalBlocks === 3 && window.game.blocks.length === 3,
      null, { timeout: 10000 });

    const levelText2 = await page.locator('#currentLevel').textContent();
    expect(levelText2).toContain('tiny-flame.svg');
    expect(errors).toEqual([]);
  });

  test('worst-case huge level loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
    await page.goto('/?url=https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-mysql.svg');
    await page.waitForFunction(() => window.game && window.game.isRunning && window.game.totalBlocks > 3000,
      null, { timeout: 60000 });
    // play a little on the giant level
    await page.keyboard.down('ArrowRight');
    await page.keyboard.press(' ');
    await page.keyboard.press('x');
    await page.waitForTimeout(1500);
    await page.keyboard.up('ArrowRight');
    const blocks = await page.evaluate(() => window.game.totalBlocks);
    expect(blocks).toBeGreaterThan(3000);
    expect(errors.filter(e => !e.includes('favicon'))).toEqual([]);
  });
});
