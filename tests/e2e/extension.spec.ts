import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

let context: BrowserContext;
let extensionId = '';

test.beforeAll(async () => {
  const extensionPath = path.resolve('dist');
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => { await context?.close(); });

test('loads the extension and opens its workspace', async () => {
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

test('renders advanced diagrams and exports HTML, DOCX and EPUB', async () => {
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

  const epubDownload = page.waitForEvent('download');
  await page.locator('[data-action="epub"]').click();
  const epub = await epubDownload;
  expect(epub.suggestedFilename()).toMatch(/\.epub$/);
  const epubPath = await epub.path();
  expect(epubPath).toBeTruthy();
  const entries = unzipSync(new Uint8Array(await readFile(epubPath!)));
  expect(strFromU8(entries.mimetype!)).toBe('application/epub+zip');
  expect(strFromU8(entries['META-INF/container.xml']!)).toContain('OEBPS/content.opf');
  expect(strFromU8(entries['OEBPS/content.xhtml']!)).toContain('高级能力验收');
});

test('renders SA-style Mermaid and PlantUML regression diagrams', async () => {
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve('tests/fixtures/sa-diagrams-regression.md')).href);
  await expect(page.locator('h1')).toContainText('SA Diagram Regression');
  await expect(page.locator('.mdr-diagram[data-diagram="mermaid"]')).toHaveCount(6);
  await expect(page.locator('.mdr-diagram[data-diagram="plantuml"]')).toHaveCount(5);
  await expect(page.locator('.mdr-diagram-error')).toHaveCount(0, { timeout: 25_000 });
  await expect(page.locator('.mdr-diagram svg')).toHaveCount(11, { timeout: 25_000 });
  await expect(page.locator('.mdr-diagram[data-diagram="mermaid"]').first().locator('svg')).toContainText('订单列表页');
});

test('renders strict Mermaid flowchart labels and production-style sequences', async () => {
  const page = await context.newPage();
  await page.goto(pathToFileURL(path.resolve('tests/fixtures/mermaid-runtime-regression.md')).href);
  await expect(page.locator('h1')).toContainText('Mermaid Runtime Regression');
  const diagrams = page.locator('.mdr-diagram[data-diagram="mermaid"]');
  await expect(diagrams).toHaveCount(5);
  await expect(page.locator('.mdr-diagram-error')).toHaveCount(0, { timeout: 25_000 });
  await expect(diagrams.locator('svg')).toHaveCount(5, { timeout: 25_000 });
  await expect(diagrams.nth(0).locator('svg')).toContainText('Card list preview');
  await expect(diagrams.nth(0).locator('svg')).toContainText('Portal User 用户');
  await expect(diagrams.nth(0).locator('foreignObject')).toHaveCount(0);
  await expect(diagrams.nth(1).locator('svg')).toContainText('Existing Card API');
  await expect(diagrams.nth(2).locator('svg')).toContainText('Frozen');
  await expect(diagrams.nth(3).locator('svg')).toContainText('5xx / timeout');
  await expect(diagrams.nth(3).locator('svg')).toContainText('Reuse existing error handling; no false-success card face');
  await expect(diagrams.nth(4).locator('svg')).toContainText('FEATURE_CARD_FACE_COMPLIANCE');
});

test('uses virtual sections for very large local markdown', async () => {
  const page = await context.newPage();
  const huge = '# Large\n\n' + Array.from({ length: 32000 }, (_, i) => `## Section ${i}\n\nParagraph ${i} ${'x'.repeat(90)}\n`).join('');
  const target = path.resolve('test-results/virtual-large.md');
  const fs = await import('node:fs/promises');
  await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, huge);
  await page.goto(pathToFileURL(target).href);
  await expect(page.locator('.mdr-virtual-section').first()).toBeVisible({ timeout: 20_000 });
  expect(await page.locator('.mdr-virtual-section').count()).toBeGreaterThan(3);
  expect(await page.locator('.mdr-virtual-section[data-pending]').count()).toBeGreaterThan(0);
});

