import { hydrateDiagrams, renderMarkdown, type Heading } from './render';

export type ReaderOptions = {
  sourceUrl?: string;
  title?: string;
  onReload?: () => Promise<string>;
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

function decorateLinks(article: HTMLElement, sourceUrl?: string) {
  article.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (/^(https?:)?\/\//i.test(href)) {
      a.target = '_blank'; a.rel = 'noopener noreferrer';
    } else if (sourceUrl && !href.startsWith('#')) {
      try { a.href = new URL(href, sourceUrl).href; } catch { /* keep original */ }
    }
  });
  article.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (sourceUrl && !/^(data:|blob:|https?:)/i.test(src)) {
      try { img.src = new URL(src, sourceUrl).href; } catch { /* keep original */ }
    }
    img.loading = 'lazy';
  });
}

export async function mountReader(host: HTMLElement, markdown: string, options: ReaderOptions = {}) {
  const saved = await chrome.storage.local.get('readerPrefs').catch(() => ({} as Record<string, unknown>));
  const prefs = { ...defaultPrefs, ...(saved.readerPrefs as Partial<ReaderPrefs> | undefined) };
  applyPrefs(host, prefs);
  const result = renderMarkdown(markdown);
  host.innerHTML = `
    <div class="mdr-shell">
      <aside class="mdr-sidebar"><div class="mdr-brand">${escapeHtml(options.title ?? 'Markdown Reader')}</div><nav class="mdr-toc">${tocHtml(result.headings)}</nav></aside>
      <main class="mdr-main"><div class="mdr-toolbar"><button data-action="print">Print / PDF</button><button data-action="source">Source</button>${options.onReload ? '<button data-action="reload">Reload</button>' : ''}<button data-action="smaller">A−</button><button data-action="larger">A+</button><button data-action="width">Width</button><button data-action="theme">Theme</button><span class="mdr-path">${escapeHtml(options.sourceUrl ?? '')}</span></div><article class="mdr-article"></article></main>
    </div>`;
  const article = host.querySelector<HTMLElement>('.mdr-article')!;
  article.innerHTML = result.html;
  decorateLinks(article, options.sourceUrl);
  await hydrateDiagrams(article);

  host.querySelector('[data-action="print"]')?.addEventListener('click', () => window.print());
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

