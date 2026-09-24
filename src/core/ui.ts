import { hydrateDiagrams, renderMarkdown, type Heading } from './render';
import { exportDocx, exportEpub, exportOfflineHtml } from './export';
import { renderVirtualMarkdown } from './virtual';

export type ReaderOptions = {
  sourceUrl?: string;
  sourceLabel?: string;
  title?: string;
  onReload?: () => Promise<string>;
  resolveAsset?: (ref: string) => Promise<string | undefined>;
  onOpenRelative?: (ref: string) => Promise<boolean> | boolean;
};

type ReaderPrefs = { width: 'narrow' | 'normal' | 'wide'; fontScale: number; theme: 'system' | 'sepia' | 'dark' };
const defaultPrefs: ReaderPrefs = { width: 'normal', fontScale: 1, theme: 'system' };

function applyPrefs(host: HTMLElement, prefs: ReaderPrefs) {
  const widths = { narrow: '760px', normal: '980px', wide: '1280px' } as const;
  host.style.setProperty('--mdr-width', widths[prefs.width]);
  host.style.setProperty('--mdr-font-scale', String(prefs.fontScale));
  for (const name of ['--mdr-bg', '--mdr-fg', '--mdr-muted', '--mdr-border', '--mdr-code', '--mdr-accent']) host.style.removeProperty(name);
  if (prefs.theme === 'sepia') {
    host.style.setProperty('--mdr-bg', '#f7f1e3'); host.style.setProperty('--mdr-fg', '#3d352b'); host.style.setProperty('--mdr-muted', '#746858');
    host.style.setProperty('--mdr-border', '#d8cdb8'); host.style.setProperty('--mdr-code', '#eee5d3'); host.style.setProperty('--mdr-accent', '#8a4b08');
  } else if (prefs.theme === 'dark') {
    host.style.setProperty('--mdr-bg', '#0d1117'); host.style.setProperty('--mdr-fg', '#e6edf3'); host.style.setProperty('--mdr-muted', '#8d96a0');
    host.style.setProperty('--mdr-border', '#30363d'); host.style.setProperty('--mdr-code', '#161b22'); host.style.setProperty('--mdr-accent', '#58a6ff');
  }
}

function tocHtml(headings: Heading[]): string {
  if (!headings.length) return '<div class="mdr-empty">No headings</div>';
  return headings.map((h) => `<a href="#${encodeURIComponent(h.id)}" style="padding-left:${6 + (h.level - 1) * 12}px">${escapeHtml(h.text)}</a>`).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

async function decorateLinks(article: HTMLElement, options: ReaderOptions) {
  article.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (/^(https?:)?\/\//i.test(href)) {
      a.target = '_blank'; a.rel = 'noopener noreferrer';
    } else if (!href.startsWith('#') && options.onOpenRelative) {
      a.addEventListener('click', (event) => {
        event.preventDefault();
        void Promise.resolve(options.onOpenRelative?.(href));
      });
    } else if (options.sourceUrl && !href.startsWith('#')) {
      try { a.href = new URL(href, options.sourceUrl).href; } catch { /* keep original */ }
    }
  });
  await Promise.all(Array.from(article.querySelectorAll<HTMLImageElement>('img[src]')).map(async (img) => {
    const src = img.getAttribute('src') ?? '';
    if (options.resolveAsset && !/^(data:|blob:|https?:)/i.test(src)) {
      try {
        const resolved = await options.resolveAsset(src);
        if (resolved) img.src = resolved;
      } catch { /* keep original source so the browser shows a normal failure */ }
    } else if (options.sourceUrl && !/^(data:|blob:|https?:)/i.test(src)) {
      try { img.src = new URL(src, options.sourceUrl).href; } catch { /* keep original */ }
    }
    img.loading = 'lazy';
  }));
}

export async function mountReader(host: HTMLElement, markdown: string, options: ReaderOptions = {}) {
  const saved = await chrome.storage.local.get('readerPrefs').catch(() => ({} as Record<string, unknown>));
  const prefs = { ...defaultPrefs, ...(saved.readerPrefs as Partial<ReaderPrefs> | undefined) };
  applyPrefs(host, prefs);
  const virtual = markdown.length >= 750_000;
  const result = virtual ? { html: '', headings: [] as Heading[] } : renderMarkdown(markdown);
  host.innerHTML = `
    <div class="mdr-shell">
      <main class="mdr-main"><div class="mdr-toolbar"><button data-action="print">Print / PDF</button><button data-action="html">Offline HTML</button><button data-action="docx">DOCX</button><button data-action="epub">EPUB</button><button data-action="source">Source</button>${options.onReload ? '<button data-action="reload">Reload</button>' : ''}<button data-action="smaller">A−</button><button data-action="larger">A+</button><button data-action="width">Width</button><button data-action="theme">Theme</button><span class="mdr-path">${escapeHtml(options.sourceLabel ?? options.sourceUrl ?? '')}</span></div><article class="mdr-article"></article></main>
      <aside class="mdr-toc-sidebar"><div class="mdr-brand">${escapeHtml(options.title ?? 'Markdown Reader')}</div><nav class="mdr-toc">${tocHtml(result.headings)}</nav></aside>
    </div>`;
  const article = host.querySelector<HTMLElement>('.mdr-article')!;
  if (virtual) {
    const virtualResult = await renderVirtualMarkdown(article, markdown);
    host.querySelector('.mdr-toc')!.innerHTML = tocHtml(virtualResult.headings);
  } else article.innerHTML = result.html;
  await decorateLinks(article, options);
  if (!virtual) await hydrateDiagrams(article);

  host.querySelector('[data-action="print"]')?.addEventListener('click', () => window.print());
  host.querySelector('[data-action="html"]')?.addEventListener('click', () => void exportOfflineHtml(article, options.title ?? 'document'));
  host.querySelector('[data-action="docx"]')?.addEventListener('click', () => void exportDocx(article, options.title ?? 'document'));
  host.querySelector('[data-action="epub"]')?.addEventListener('click', () => void exportEpub(article, options.title ?? 'document'));
  host.querySelector('[data-action="source"]')?.addEventListener('click', () => {
    const pre = document.createElement('pre');
    const code = document.createElement('code'); code.textContent = markdown; pre.append(code);
    article.replaceChildren(pre);
  });
  host.querySelector('[data-action="reload"]')?.addEventListener('click', async () => {
    if (options.onReload) await mountReader(host, await options.onReload(), options);
  });
  host.querySelector('[data-action="smaller"]')?.addEventListener('click', () => { prefs.fontScale = Math.max(.8, +(prefs.fontScale - .1).toFixed(1)); applyPrefs(host, prefs); void chrome.storage.local.set({ readerPrefs: prefs }); });
  host.querySelector('[data-action="larger"]')?.addEventListener('click', () => { prefs.fontScale = Math.min(1.6, +(prefs.fontScale + .1).toFixed(1)); applyPrefs(host, prefs); void chrome.storage.local.set({ readerPrefs: prefs }); });
  host.querySelector('[data-action="width"]')?.addEventListener('click', () => { prefs.width = prefs.width === 'normal' ? 'wide' : prefs.width === 'wide' ? 'narrow' : 'normal'; applyPrefs(host, prefs); void chrome.storage.local.set({ readerPrefs: prefs }); });
  host.querySelector('[data-action="theme"]')?.addEventListener('click', () => { prefs.theme = prefs.theme === 'system' ? 'sepia' : prefs.theme === 'sepia' ? 'dark' : 'system'; applyPrefs(host, prefs); void chrome.storage.local.set({ readerPrefs: prefs }); });
}

