import { hydrateDiagrams, renderMarkdown, type Heading } from './render';

export type VirtualRender = { headings: Heading[]; ready: Promise<void> };

function slugify(text: string, used: Map<string, number>): string {
  const base = text.trim().toLowerCase().replace(/[*_`~[\]()]/g, '').replace(/[\s]+/g, '-').replace(/[^\p{L}\p{N}\-_]/gu, '') || 'section';
  const seen = used.get(base) ?? 0; used.set(base, seen + 1); return seen ? `${base}-${seen + 1}` : base;
}

export function scanHeadings(source: string, used: Map<string, number> = new Map()): Heading[] {
  const headings: Heading[] = []; let fence = '';
  for (const line of source.split('\n')) {
    const marker = line.match(/^\s*(```+|~~~+)/)?.[1] ?? '';
    if (marker) { fence = fence ? (marker[0] === fence[0] ? '' : fence) : marker; continue; }
    if (fence) continue;
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/); if (!match) continue;
    const text = match[2]!; headings.push({ level: match[1]!.length, text, id: slugify(text, used) });
  }
  return headings;
}

export function splitSafe(source: string, target = 90_000): string[] {
  const lines = source.split('\n'); const chunks: string[] = []; let current: string[] = []; let size = 0; let fence = '';
  const flush = () => { if (current.length) chunks.push(current.join('\n')); current = []; size = 0; };
  for (const line of lines) {
    const marker = line.match(/^\s*(```+|~~~+)/)?.[1] ?? '';
    if (marker) fence = fence ? (marker[0] === fence[0] ? '' : fence) : marker;
    const boundary = !fence && size >= target && /^#{1,3}\s+/.test(line);
    if (boundary) flush();
    current.push(line); size += line.length + 1;
    if (!fence && size >= target * 1.6) flush();
  }
  flush(); return chunks;
}

export async function renderVirtualMarkdown(article: HTMLElement, source: string): Promise<VirtualRender> {
  const chunks = splitSafe(source); const used = new Map<string, number>(); const headingSets = chunks.map((chunk) => scanHeadings(chunk, used));
  const headings = headingSets.flat();
  const slots = chunks.map((_chunk, index) => {
    const section = document.createElement('section'); section.className = 'mdr-virtual-section'; section.dataset.index = String(index);
    section.dataset.pending = '1'; section.style.minHeight = index < 2 ? '0' : '240px'; return section;
  });
  article.replaceChildren(...slots);
  const mount = async (section: HTMLElement) => {
    if (!section.dataset.pending) return;
    const index = Number(section.dataset.index); const rendered = renderMarkdown(chunks[index]!);
    section.innerHTML = rendered.html; delete section.dataset.pending; section.style.minHeight = '0';
    const elements = section.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6');
    headingSets[index]!.forEach((heading, i) => { if (elements[i]) elements[i].id = heading.id; });
    await hydrateDiagrams(section);
  };
  await Promise.all(slots.slice(0, 2).map(mount));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); void mount(entry.target as HTMLElement); }
  }, { rootMargin: '1200px 0px' });
  for (const slot of slots.slice(2)) observer.observe(slot);
  return { headings, ready: Promise.resolve() };
}
