import { chromium } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const extensionPath = path.resolve('dist');
const temp = await mkdtemp(path.join(tmpdir(), 'mdr-bench-'));
const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

async function scenarioOnce(name, markdown) {
  const file = path.join(temp, `${name}.md`); await writeFile(file, markdown);
  const page = await context.newPage(); const start = performance.now();
  await page.goto(pathToFileURL(file).href);
  await page.locator('.mdr-article').waitFor({ state: 'visible', timeout: 30_000 });
  const articleMs = performance.now() - start;
  await page.locator('.mdr-diagram .mdr-empty').first().waitFor({ state: 'detached', timeout: 60_000 }).catch(() => undefined);
  const settledMs = performance.now() - start;
  const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
  await page.close(); return { name, bytes: Buffer.byteLength(markdown), articleMs: Math.round(articleMs), settledMs: Math.round(settledMs), heap };
}

async function scenario(name, markdown) {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await scenarioOnce(name, markdown));
  const median = (key) => [...runs].sort((a, b) => (a[key] ?? 0) - (b[key] ?? 0))[1][key];
  return { name, bytes: runs[0].bytes, articleMs: median('articleMs'), settledMs: median('settledMs'), heap: median('heap'), runs: runs.map(({ articleMs, settledMs, heap }) => ({ articleMs, settledMs, heap })) };
}

try {
  const oneMb = '# 1MB\n\n' + ('Markdown reader performance paragraph with 中文 mixed content.\n\n'.repeat(18_000));
  const tenMb = '# 10MB\n\n' + ('Large document paragraph with tables and inline `code` for stress testing.\n\n'.repeat(145_000));
  const diagrams = '# 100 Mermaid diagrams\n\n' + Array.from({ length: 100 }, (_, i) => `## Diagram ${i + 1}\n\n\`\`\`mermaid\nflowchart LR\n  A${i}[Input] --> B${i}[Render] --> C${i}[Output]\n\`\`\`\n`).join('\n');
  const results = [];
  for (const [name, source] of [['one-mb', oneMb], ['ten-mb', tenMb], ['hundred-diagrams', diagrams]]) results.push(await scenario(name, source));
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
} finally {
  await context.close(); await rm(temp, { recursive: true, force: true });
}
