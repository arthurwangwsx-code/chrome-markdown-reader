import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchExtensionContext } from './extension-context';

let context: BrowserContext;

test.beforeAll(async () => {
  ({ context } = await launchExtensionContext());
});

test.afterAll(async () => { await context?.close(); });

test('reader has no serious or critical axe violations', async () => {
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve('tests/fixtures/visual.md')).href);
  await expect(page.locator('.mdr-article')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''));
  expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join('\n')).toEqual([]);
});

test('reader controls remain keyboard reachable', async () => {
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve('tests/fixtures/visual.md')).href);
  const first = page.locator('[data-action="print"]');
  await expect(first).toBeVisible();
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({ tag: document.activeElement?.tagName ?? '', action: (document.activeElement as HTMLElement | null)?.dataset.action ?? '' }));
  expect(focused.tag).toBe('BUTTON');
  expect(focused.action).toBe('html');
});
