import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let context: BrowserContext;

test.beforeAll(async () => {
  const extensionPath = path.resolve('dist');
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
});

test.afterAll(async () => { await context?.close(); });

test('loads the extension and opens its workspace', async () => {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/workspace.html`);
  await expect(page.locator('text=Markdown Workspace')).toBeVisible();
  await expect(page.locator('#choose-folder')).toBeVisible();
});

test('renders a local markdown file with diagrams', async () => {
  const page = await context.newPage();
  const fixture = pathToFileURL(path.resolve('tests/fixtures/full.md')).href;
  await page.goto(fixture);
  await expect(page.locator('h1')).toContainText('Markdown Reader 验收样例');
  await expect(page.locator('.mdr-toc')).toContainText('Mermaid 时序图');
  await expect(page.locator('.mdr-diagram')).toHaveCount(6);
  await expect(page.locator('.mdr-diagram svg').first()).toBeVisible({ timeout: 20_000 });
});

test('renders advanced diagrams and exports HTML and DOCX', async () => {
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve('tests/fixtures/advanced.md')).href);
  await expect(page.locator('.mdr-diagram')).toHaveCount(7);
  await expect(page.locator('.mdr-diagram-error')).toHaveCount(0, { timeout: 25_000 });
  await expect(page.locator('.mdr-diagram svg')).toHaveCount(7, { timeout: 25_000 });

  const htmlDownload = page.waitForEvent('download');
  await page.locator('[data-action="html"]').click();
  expect((await htmlDownload).suggestedFilename()).toMatch(/\.html$/);

  const docxDownload = page.waitForEvent('download');
  await page.locator('[data-action="docx"]').click();
  expect((await docxDownload).suggestedFilename()).toMatch(/\.docx$/);
});

