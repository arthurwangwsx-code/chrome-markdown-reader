import { expect, test, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { launchExtensionContext } from './extension-context';

let context: BrowserContext;
let extensionId = '';

test.beforeAll(async () => {
  ({ context, extensionId } = await launchExtensionContext());
});

test.afterAll(async () => { await context?.close(); });

test('loads the extension and opens its workspace', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/workspace.html`);
  await expect(page.locator('text=Project Files')).toBeVisible();
  await expect(page.locator('#choose-folder')).toBeVisible();
});

test('opens a mixed project folder with files left and Markdown headings right', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/workspace.html`);
  await page.evaluate(async () => {
    const storage = navigator.storage as StorageManager & { getDirectory(): Promise<FileSystemDirectoryHandle> };
    const opfs = await storage.getDirectory();
    await opfs.removeEntry('mdr-e2e-project', { recursive: true }).catch(() => undefined);
    const project = await opfs.getDirectoryHandle('mdr-e2e-project', { create: true });
    const write = async (name: string, value: string | Blob) => {
      const handle = await project.getFileHandle(name, { create: true });
      const writable = await (handle as FileSystemFileHandle & { createWritable(): Promise<{ write(value: string | Blob): Promise<void>; close(): Promise<void> }> }).createWritable();
      await writable.write(value); await writable.close();
    };
    await write('README.md', '# Project Overview\n\n## Architecture\n\n![Pixel](preview.png)\n\n[Notes](notes.txt)\n');
    await write('notes.txt', 'Plain text project note');
    await write('preview.png', new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,8,215,99,248,207,192,240,31,0,5,0,1,255,137,153,61,29,0,0,0,0,73,69,78,68,174,66,96,130])], { type: 'image/png' }));
    Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: async () => project });
  });
  await page.locator('#choose-folder').click();
  await expect(page.locator('[data-workspace-name]')).toHaveText('mdr-e2e-project');
  await expect(page.locator('[data-tree]')).toContainText('README.md');
  await expect(page.locator('[data-tree]')).toContainText('notes.txt');
  await expect(page.locator('[data-tree]')).toContainText('preview.png');

  await page.getByRole('button', { name: /README\.md/ }).click();
  await expect(page.locator('.mdr-article h1')).toHaveText('Project Overview');
  await expect(page.locator('.mdr-toc-sidebar')).toContainText('Architecture');
  await expect(page.locator('.mdr-article img')).toBeVisible();
  const files = await page.locator('.mdr-file-sidebar').boundingBox();
  const main = await page.locator('.mdr-main').boundingBox();
  const toc = await page.locator('.mdr-toc-sidebar').boundingBox();
  expect(files).toBeTruthy(); expect(main).toBeTruthy(); expect(toc).toBeTruthy();
  expect(files!.x).toBeLessThan(main!.x);
  expect(toc!.x).toBeGreaterThan(main!.x);

  await page.getByRole('link', { name: 'Notes' }).click();
  await expect(page.locator('.mdr-text-preview')).toContainText('Plain text project note');
  await page.getByRole('button', { name: /preview\.png/ }).click();
  await expect(page.locator('.mdr-image-preview img')).toBeVisible();
});

test('renders a local markdown file with diagrams', async () => {
  const page = await context.newPage();
  const fixture = pathToFileURL(path.resolve('tests/fixtures/full.md')).href;
  await page.goto(fixture);
  await expect(page.locator('h1')).toContainText('Markdown Reader 验收样例');
  await expect(page.locator('.mdr-toc')).toContainText('Mermaid 时序图');
  const mainBox = await page.locator('.mdr-main').boundingBox();
  const tocBox = await page.locator('.mdr-toc-sidebar').boundingBox();
  expect(mainBox).toBeTruthy(); expect(tocBox).toBeTruthy();
  expect(tocBox!.x).toBeGreaterThan(mainBox!.x);
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

