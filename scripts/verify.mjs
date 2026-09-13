import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const full = process.argv.includes('--full');
const steps = [
  ['typecheck', ['npm', 'run', 'typecheck']],
  ['lint', ['npm', 'run', 'lint']],
  ['unit-coverage', ['npm', 'run', 'test:coverage']],
  ['security', ['npm', 'run', 'test:security']],
  ['build', ['npm', 'run', 'build']],
  ['e2e', ['npm', 'run', 'test:e2e:functional']],
  ['accessibility', ['npm', 'run', 'test:a11y']],
  ['visual', ['npm', 'run', 'test:visual']],
  ['package', ['npm', 'run', 'package']],
  ['release-check', ['npm', 'run', 'check:release']],
  ['audit', ['npm', 'audit', '--audit-level=high']],
];
if (full) steps.splice(5, 0, ['performance', ['npm', 'run', 'test:performance']]);

await mkdir('quality', { recursive: true });
const results = [];
let failed = false;
for (const [name, command] of steps) {
  const started = Date.now();
  const result = spawnSync(command[0], command.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' });
  const item = { name, status: result.status === 0 ? 'PASS' : 'FAIL', exitCode: result.status ?? 1, durationMs: Date.now() - started };
  results.push(item);
  if (item.status === 'FAIL') { failed = true; break; }
}
let coverage = null;
try {
  const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));
  coverage = summary.total ?? null;
} catch { /* A failed coverage step is already represented above. */ }
let benchmark = null;
if (full) {
  try { benchmark = JSON.parse(await readFile('quality/benchmark.json', 'utf8')); } catch { /* represented by step */ }
}
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), mode: full ? 'full' : 'standard', status: failed ? 'FAIL' : 'PASS', coverage, benchmark, results };
await writeFile('quality/quality-report.json', JSON.stringify(report, null, 2) + '\n');
console.log('\nQuality report: quality/quality-report.json');
if (failed) process.exit(1);
