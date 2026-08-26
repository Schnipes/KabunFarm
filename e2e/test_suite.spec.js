import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test.describe('Kabun Farm Automated Browser Regression Suite', () => {

  test('test.html regression suite runs and passes in real Chromium browser', async ({ page }) => {
    const testHtmlUrl = 'file://' + path.join(rootDir, 'test.html').replace(/\\/g, '/');
    await page.goto(testHtmlUrl);

    // Wait for the test harness to finish running and render summary
    const summary = page.locator('#summary');
    await expect(summary).toBeVisible();

    const summaryText = await summary.textContent();
    console.log('Browser test.html result:', summaryText);

    const failCases = page.locator('.case.fail');
    const failCount = await failCases.count();
    if (failCount > 0) {
      for (let i = 0; i < failCount; i++) {
        const text = await failCases.nth(i).innerText();
        console.error(`FAIL [${i+1}]:`, text);
      }
    }

    expect(summaryText).toMatch(/All \d+ tests passed/);
    expect(failCount).toBe(0);
  });

  test('PWA UI: Pest Control Recipe Chip Selection & Overwriting in Real DOM', async ({ page }) => {
    const indexHtmlUrl = 'file://' + path.join(rootDir, 'index.html').replace(/\\/g, '/');
    await page.goto(indexHtmlUrl);

    // Open Add Log Modal for pest control
    await page.evaluate(() => {
      window.openModal('pest');
    });

    const modal = page.locator('#modalOverlay');
    await expect(modal).toHaveClass(/open/);

    // Check quick formula section is visible
    const quickSection = page.locator('#quickFormulaSection');
    await expect(quickSection).toBeVisible();

    const chips = page.locator('.quick-formula-chip');
    const chipCount = await chips.count();
    if (chipCount >= 2) {
      // 1. Click first chip
      await chips.nth(0).click();
      const firstChipText = (await chips.nth(0).textContent())?.trim();
      const inputsUsed = page.locator('#inputsUsed');
      const val1 = await inputsUsed.inputValue();
      expect(val1).toContain(firstChipText);

      // 2. Click second chip -> must overwrite first chip text
      await chips.nth(1).click();
      const secondChipText = (await chips.nth(1).textContent())?.trim();
      const val2 = await inputsUsed.inputValue();
      expect(val2).toContain(secondChipText);
      expect(val2).not.toContain(firstChipText);
    }
  });

});
