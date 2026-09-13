import { describe, expect, it } from 'vitest';
import { smartSearch } from '../src/core/search';

describe('smartSearch', () => {
  const docs = [
    { name: 'architecture.md', path: 'docs/architecture.md', text: '系统架构包括浏览器扩展、渲染器和本地索引。' },
    { name: 'release.md', path: 'docs/release.md', text: 'Chrome Web Store publishing and release process.' },
    { name: 'reader.md', path: 'guide/reader.md', text: 'Markdown 阅读器支持甘特图和时序图。' },
  ];
  it('ranks path and title matches above body-only matches', () => expect(smartSearch('release', docs)[0]?.doc.name).toBe('release.md'));
  it('supports CJK bigram matching', () => expect(smartSearch('系统架构', docs)[0]?.doc.name).toBe('architecture.md'));
  it('returns a useful snippet', () => expect(smartSearch('甘特图', docs)[0]?.snippet).toContain('甘特图'));
});
