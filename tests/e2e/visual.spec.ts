import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let context: BrowserContext;
test.beforeAll(async () => {
  const extensionPath = path.resolve('dist');
  context = await chromium.launchPersistentContext('', { headless: false, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
});
test.afterAll(async () => context?.close());

test('visual reader contract remains stable', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(path.resolve('tests/fixtures/visual.md')).href);
  await expect(page.locator('.mdr-diagram svg')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.mdr-shell')).toHaveScreenshot('reader-shell.png', { animations: 'disabled', maxDiffPixelRatio: 0.08 });
});
