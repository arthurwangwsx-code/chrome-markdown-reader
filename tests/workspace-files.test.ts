import { describe, expect, it } from 'vitest';
import { classifyWorkspaceFile, isWorkspaceIndexable, resolveWorkspacePath } from '../src/core/workspace-files';

describe('workspace file support', () => {
  it('classifies project documents and images without treating binaries as readable text', () => {
    expect(classifyWorkspaceFile('README.md')).toBe('markdown');
    expect(classifyWorkspaceFile('notes.TXT')).toBe('text');
    expect(classifyWorkspaceFile('config.yaml')).toBe('text');
    expect(classifyWorkspaceFile('screen.webp')).toBe('image');
    expect(classifyWorkspaceFile('diagram.svg')).toBe('unsupported');
    expect(classifyWorkspaceFile('archive.zip')).toBe('unsupported');
    expect(isWorkspaceIndexable('notes.txt')).toBe(true);
    expect(isWorkspaceIndexable('screen.png')).toBe(false);
  });

  it('resolves relative workspace links while keeping traversal inside the selected root', () => {
    expect(resolveWorkspacePath('docs/design/sa.md', '../assets/card.png')).toEqual({ path: 'docs/assets/card.png', hash: '' });
    expect(resolveWorkspacePath('docs/design/sa.md', './detail.md#API')).toEqual({ path: 'docs/design/detail.md', hash: 'API' });
    expect(resolveWorkspacePath('docs/design/sa.md', '../../../secret.txt')).toBeNull();
    expect(resolveWorkspacePath('docs/design/sa.md', '/Users/me/secret.txt')).toBeNull();
    expect(resolveWorkspacePath('docs/design/sa.md', 'https://example.com/a.md')).toBeNull();
  });
});
