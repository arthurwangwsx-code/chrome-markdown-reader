import { readFile } from 'node:fs/promises';

const path = process.argv[2] ?? 'quality/benchmark.json';
const report = JSON.parse(await readFile(path, 'utf8'));
const byName = new Map(report.results.map((item) => [item.name, item]));
const budgets = {
  'one-mb': { articleMs: 7000, settledMs: 7000 },
  'ten-mb': { articleMs: 7000, settledMs: 7500 },
  'hundred-diagrams': { articleMs: 1200, settledMs: 5000 },
};

const failures = [];
for (const [name, budget] of Object.entries(budgets)) {
  const result = byName.get(name);
  if (!result) { failures.push(`${name}: missing benchmark result`); continue; }
  for (const [metric, max] of Object.entries(budget)) {
    if (result[metric] > max) failures.push(`${name}.${metric} ${result[metric]}ms > ${max}ms`);
  }
}

console.log(JSON.stringify({ status: failures.length ? 'FAIL' : 'PASS', budgets, failures }, null, 2));
if (failures.length) process.exit(1);
