export type WorkspaceFileKind = 'markdown' | 'text' | 'image' | 'unsupported';

const markdownExt = /\.(?:md|markdown|mdown|mkd)$/i;
const textExt = /\.(?:txt|log|json|ya?ml|csv|xml|ini|conf|properties)$/i;
const imageExt = /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i;

export function classifyWorkspaceFile(name: string): WorkspaceFileKind {
  if (markdownExt.test(name)) return 'markdown';
  if (textExt.test(name)) return 'text';
  if (imageExt.test(name)) return 'image';
  return 'unsupported';
}

export function isWorkspaceIndexable(name: string): boolean {
  const kind = classifyWorkspaceFile(name);
  return kind === 'markdown' || kind === 'text';
}

export type WorkspaceResolvedPath = { path: string; hash: string };

export function resolveWorkspacePath(currentPath: string, ref: string): WorkspaceResolvedPath | null {
  const trimmed = ref.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return null;

  const hashIndex = trimmed.indexOf('#');
  const withoutHash = hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed;
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : '';
  const queryIndex = withoutHash.indexOf('?');
  const rawPath = queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash;
  if (!rawPath || rawPath.startsWith('/')) return null;

  const segments = currentPath.split('/').filter(Boolean);
  segments.pop();
  for (const rawSegment of rawPath.split('/')) {
    let segment = rawSegment;
    try { segment = decodeURIComponent(rawSegment); } catch { /* retain literal segment */ }
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) return null;
      segments.pop();
      continue;
    }
    if (segment.includes('/') || segment.includes('\\') || segment === '.' || segment === '..') return null;
    segments.push(segment);
  }
  if (!segments.length) return null;
  return { path: segments.join('/'), hash };
}
