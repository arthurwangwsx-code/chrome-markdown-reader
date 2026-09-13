import { build } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const RELEASES = path.join(ROOT, 'releases');

async function clean() {
  await rm(DIST, { recursive: true, force: true });
}

async function copyPublic() {
  await cp(path.join(ROOT, 'public'), DIST, { recursive: true });
  const katexCss = path.join(ROOT, 'node_modules/katex/dist/katex.min.css');
  const hlCss = path.join(ROOT, 'node_modules/highlight.js/styles/github-dark.min.css');
  if (existsSync(katexCss)) await cp(katexCss, path.join(DIST, 'katex.min.css'));
  if (existsSync(hlCss)) await cp(hlCss, path.join(DIST, 'highlight.min.css'));
  const cssPath = path.join(DIST, 'reader.css');
  const css = await readFile(cssPath, 'utf8');
  await writeFile(cssPath, `@import url('./katex.min.css');\n@import url('./highlight.min.css');\n${css}`);
  const fontsSource = path.join(ROOT, 'node_modules/katex/dist/fonts');
  if (existsSync(fontsSource)) await cp(fontsSource, path.join(DIST, 'fonts'), { recursive: true });
}

async function bundle() {
  const common = {
    bundle: true,
    minify: true,
    sourcemap: false,
    target: ['chrome120'],
    logLevel: 'info',
  };
  const iifeEntries = [
    ['src/background.ts', 'background.js'],
    ['src/content-loader.ts', 'content-loader.js'],
    ['src/popup.ts', 'popup.js'],
  ];
  for (const [entry, outfile] of iifeEntries) {
    await build({ ...common, entryPoints: [entry], outfile: path.join(DIST, outfile), format: 'iife', platform: 'browser' });
  }
  await build({
    ...common,
    entryPoints: { content: 'src/content.ts', workspace: 'src/workspace.ts' },
    outdir: path.join(DIST, 'modules'),
    format: 'esm',
    splitting: true,
    platform: 'browser',
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
  });
}

async function doBuild() {
  await clean();
  await mkdir(DIST, { recursive: true });
  await copyPublic();
  await bundle();
  const manifest = JSON.parse(await readFile(path.join(DIST, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3) throw new Error('Expected Manifest V3');
  const forbidden = ['debugger', 'cookies', 'history', 'nativeMessaging'];
  const permissions = new Set([...(manifest.permissions ?? []), ...(manifest.optional_permissions ?? [])]);
  for (const permission of forbidden) if (permissions.has(permission)) throw new Error(`Forbidden permission in release: ${permission}`);
  console.log(`Built ${manifest.name} ${manifest.version} -> ${DIST}`);
}

async function packageRelease() {
  await doBuild();
  await mkdir(RELEASES, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(DIST, 'manifest.json'), 'utf8'));
  const name = `chrome-markdown-reader-v${manifest.version}-chrome.zip`;
  const archive = path.join(RELEASES, name);
  if (existsSync(archive)) await rm(archive);
  execFileSync('/usr/bin/zip', ['-q', '-r', archive, '.'], { cwd: DIST });
  const bytes = await readFile(archive);
  const sha = createHash('sha256').update(bytes).digest('hex');
  await writeFile(`${archive}.sha256`, `${sha}  ${name}\n`);
  console.log(`${name}\nsha256 ${sha}`);
}

const action = process.argv[2] ?? 'build';
if (action === 'clean') await clean();
else if (action === 'build') await doBuild();
else if (action === 'package') await packageRelease();
else throw new Error(`Unknown build action: ${action}`);

