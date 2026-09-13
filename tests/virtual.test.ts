import { describe, expect, it } from 'vitest';
import { scanHeadings, splitSafe } from '../src/core/virtual';

describe('virtual markdown primitives', () => {
  it('does not scan headings inside fenced code', () => {
    const source = '# Visible\n\n```md\n# Hidden\n```\n\n## Visible Two';
    expect(scanHeadings(source).map((item) => item.text)).toEqual(['Visible', 'Visible Two']);
  });

  it('keeps duplicate heading ids deterministic', () => {
    const headings = scanHeadings('# Same\n\n## Same\n\n# 中文 标题\n\n# 中文 标题');
    expect(headings.map((item) => item.id)).toEqual(['same', 'same-2', '中文-标题', '中文-标题-2']);
  });

  it('never splits in the middle of a fenced block', () => {
    const code = '```mermaid\n' + 'A-->B\n'.repeat(30) + '```';
    const chunks = splitSafe(`# Start\n${'text\n'.repeat(20)}\n${code}\n## Next\n${'tail\n'.repeat(20)}`, 80);
    expect(chunks.join('\n')).toContain(code);
    expect(chunks.filter((chunk) => chunk.includes('```mermaid')).length).toBe(1);
  });
});
