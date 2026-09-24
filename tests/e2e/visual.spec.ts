import { expect, test, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchExtensionContext } from './extension-context';

let context: BrowserContext;
test.beforeAll(async () => {
  ({ context } = await launchExtensionContext());
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
