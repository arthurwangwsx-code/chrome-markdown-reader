import { describe, expect, it } from 'vitest';
import { escapeXml, safeName } from '../src/core/export';

describe('export helpers', () => {
  it('creates portable filenames', () => {
    expect(safeName('  design: review / 2026  ', 'docx')).toBe('design- review - 2026.docx');
    expect(safeName('***', 'epub')).toBe('-.epub');
  });

  it('escapes XML metadata', () => {
    expect(escapeXml(`<book title="A&B">'x'</book>`)).toBe('&lt;book title=&quot;A&amp;B&quot;&gt;&apos;x&apos;&lt;/book&gt;');
  });
});
