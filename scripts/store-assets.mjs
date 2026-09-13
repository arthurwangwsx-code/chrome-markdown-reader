import { chromium } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const out = path.resolve('store-assets'); await mkdir(out, { recursive: true });
const extensionPath = path.resolve('dist');
const context = await chromium.launchPersistentContext('', { headless: false, args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] });
try {
  const page = await context.newPage(); await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto(pathToFileURL(path.resolve('tests/fixtures/advanced.md')).href);
  await page.locator('.mdr-diagram svg').first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.screenshot({ path: path.join(out, 'reader-1280x800.png') });
  console.log(`Generated ${path.join(out, 'reader-1280x800.png')}`);
} finally { await context.close(); }
