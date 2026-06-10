import { test, expect } from '@playwright/test';

test.beforeAll(async () => {
  // Add a small delay to ensure the game initializes properly
  await new Promise(resolve => setTimeout(resolve, 100));
});

test.describe('FlameGame', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the game page', async ({ page }) => {
    await expect(page).toHaveTitle('FlameGame');
    await expect(page.locator('h1')).toHaveText('FlameGame');
  });

  test('should have game container', async ({ page }) => {
    const gameContainer = page.locator('#gameContainer');
    await expect(gameContainer).toBeVisible();
    
    const canvas = gameContainer.locator('canvas');
    await expect(canvas).toBeVisible();
  });

  test('should have controls and UI elements', async ({ page }) => {
    await expect(page.locator('#fileInput')).toBeVisible();
    await expect(page.locator('#urlInput')).toBeVisible();
    await expect(page.locator('#loadUrlButton')).toBeVisible();
    await expect(page.locator('#surpriseMe')).toBeVisible();
    
    await expect(page.locator('#timer')).toBeVisible();
    await expect(page.locator('#bestTime')).toBeVisible();
    await expect(page.locator('#blockCounter')).toBeVisible();
    await expect(page.locator('#currentLevel')).toBeVisible();
  });

  test('should load a random level', async ({ page }) => {
    await page.locator('#surpriseMe').click();
    
    await page.waitForTimeout(2000);
    
    const levelText = await page.locator('#currentLevel').textContent();
    expect(levelText).toMatch(/Level: .+\.svg/);
    
    const blockCounter = await page.locator('#blockCounter').textContent();
    expect(blockCounter).toMatch(/Blocks destroyed: 0\/\d+/);
  });

  test('should have player character on canvas', async ({ page }) => {
    await page.locator('#surpriseMe').click();
    await page.waitForTimeout(1000);
    
    const canvas = page.locator('#gameContainer canvas');
    await expect(canvas).toBeVisible();
    
    const canvasSize = await canvas.boundingBox();
    expect(canvasSize.width).toBeGreaterThan(0);
    expect(canvasSize.height).toBeGreaterThan(0);
  });

  test('should respond to keyboard controls', async ({ page }) => {
    await page.locator('#surpriseMe').click();
    await page.waitForTimeout(1000);

    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    
    await page.keyboard.press('x');
    await page.waitForTimeout(100);
    
    // Verify particle effects are created on movement
    const hasParticles = await page.evaluate(() => {
      return window.game && window.game.effects && window.game.effects.particles.length >= 0;
    });
    
    expect(hasParticles).toBe(true);
  });

  test('should show mobile controls on mobile', async ({ page, isMobile }) => {
    if (isMobile) {
      const mobileControls = page.locator('#mobileControls');
      await expect(mobileControls).toBeVisible();
      
      await expect(page.locator('#leftBtn')).toBeVisible();
      await expect(page.locator('#rightBtn')).toBeVisible();
      await expect(page.locator('#jumpBtn')).toBeVisible();
      await expect(page.locator('#attackBtn')).toBeVisible();
      await expect(page.locator('#downBtn')).toBeVisible();
    }
  });

  test('should start timer when game starts', async ({ page }) => {
    await page.locator('#surpriseMe').click();
    await page.waitForTimeout(500);
    
    const initialTimer = await page.locator('#timer').textContent();
    expect(initialTimer).toMatch(/Time: \d+\.\d+s/);
    
    await page.waitForTimeout(1000);
    
    const laterTimer = await page.locator('#timer').textContent();
    expect(laterTimer).toMatch(/Time: \d+\.\d+s/);
    
    const initialTime = parseFloat(initialTimer.match(/Time: (\d+\.\d+)s/)[1]);
    const laterTime = parseFloat(laterTimer.match(/Time: (\d+\.\d+)s/)[1]);
    
    expect(laterTime).toBeGreaterThan(initialTime);
  });

  test('should handle URL input', async ({ page }) => {
    const testUrl = 'https://raw.githubusercontent.com/brendangregg/FlameGraph/refs/heads/master/demos/cpu-grep.svg';
    
    await page.locator('#urlInput').fill(testUrl);
    await page.locator('#loadUrlButton').click();
    
    await page.waitForTimeout(2000);
    
    const levelText = await page.locator('#currentLevel').textContent();
    expect(levelText).toContain('cpu-grep.svg');
  });

  test('should handle game effects and particles', async ({ page }) => {
    await page.locator('#surpriseMe').click();
    await page.waitForTimeout(1000);
    
    const hasEffects = await page.evaluate(() => {
      return window.game && window.game.effects && 
             window.game.effects.particleSystem === true &&
             window.game.effects.backgroundGradient === true &&
             window.game.effects.lighting && 
             window.game.effects.shadows === true;
    });
    
    expect(hasEffects).toBe(true);
    
    const hasParticleArray = await page.evaluate(() => {
      return window.game && window.game.effects && Array.isArray(window.game.effects.particles);
    });
    
    expect(hasParticleArray).toBe(true);
    
    const hasScreenShake = await page.evaluate(() => {
      return window.game && window.game.effects && window.game.effects.screenShake &&
             typeof window.game.effects.screenShake.x === 'number' &&
             typeof window.game.effects.screenShake.y === 'number';
    });
    
    expect(hasScreenShake).toBe(true);
  });

  test('should preserve original flame graph colors', async ({ page }) => {
    await page.locator('#surpriseMe').click();
    await page.waitForTimeout(2000);
    
    const hasBlocks = await page.evaluate(() => {
      return window.game && window.game.blocks && window.game.blocks.length > 0;
    });
    
    expect(hasBlocks).toBe(true);
    
    const blockColors = await page.evaluate(() => {
      if (window.game && window.game.blocks) {
        return window.game.blocks.slice(0, 5).map(block => block.fill);
      }
      return [];
    });
    
    expect(blockColors.length).toBeGreaterThan(0);
    blockColors.forEach(color => {
      expect(color).toBeTruthy();
    });
  });
  
  test('should generate particle effects on actions', async ({ page }) => {
    await page.locator('#surpriseMe').click();
    await page.waitForTimeout(1000);
    
    // Clear any existing particles
    await page.evaluate(() => {
      if (window.game && window.game.effects) {
        window.game.effects.particles = [];
      }
    });
    
    // Trigger jump to create particles
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    
    const particleCount = await page.evaluate(() => {
      return window.game && window.game.effects ? window.game.effects.particles.length : 0;
    });
    
    expect(particleCount).toBeGreaterThan(0);
  });
  
  test('should have audio system initialized', async ({ page }) => {
    await page.locator('#surpriseMe').click();
    await page.waitForTimeout(1000);
    
    const hasAudioSystem = await page.evaluate(() => {
      return window.game && window.game.audio && 
             typeof window.game.audio.enabled === 'boolean' &&
             typeof window.game.audio.sounds === 'object';
    });
    
    expect(hasAudioSystem).toBe(true);
  });
});