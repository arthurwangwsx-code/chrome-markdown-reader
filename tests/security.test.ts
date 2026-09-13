import { describe, expect, it } from 'vitest';
import { containsRemoteReference, renderMarkdown } from '../src/core/render';

describe('security regression suite', () => {
  it('removes executable raw HTML and event handlers', () => {
    const { html } = renderMarkdown(`
# Safe

<img src="x" onerror="window.__pwned = true">
<script>window.__pwned = true</script>
<iframe srcdoc="<script>alert(1)</script>"></iframe>
`);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror=/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/srcdoc=/i);
  });

  it('does not allow javascript links to survive sanitization', () => {
    const { html } = renderMarkdown('[bad](javascript:alert(1))');
    expect(html).not.toMatch(/<a\b/i);
    expect(html).not.toMatch(/href=["']javascript:/i);
  });

  it('recognizes nested remote references for declarative charts', () => {
    expect(containsRemoteReference({ data: { url: 'https://example.com/private.json' } })).toBe(true);
    expect(containsRemoteReference({ data: { values: [{ x: 1 }] } })).toBe(false);
  });

  it('keeps diagram source encoded instead of injecting it as HTML', () => {
    const { html } = renderMarkdown('```mermaid\nflowchart LR\nA[<img src=x onerror=alert(1)>]-->B\n```');
    expect(html).toContain('data-diagram="mermaid"');
    expect(html).not.toMatch(/onerror=/i);
  });

  it('creates stable unique heading ids and renders math without trusting input', () => {
    const { html, headings } = renderMarkdown('# Same\n\n# Same\n\n$E=mc^2$');
    expect(headings.map((item) => item.id)).toEqual(['same', 'same-2']);
    expect(html).toContain('class="katex"');
  });

  it('leaves unknown code fences as code instead of executable content', () => {
    const { html } = renderMarkdown('```javascript\nalert(1)\n```');
    expect(html).toContain('<code');
    expect(html).not.toContain('<script');
  });
});
