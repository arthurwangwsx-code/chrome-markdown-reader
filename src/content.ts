import { mountReader } from './core/ui';

const EXTENSIONS = /\.(?:md|markdown|mdown|mkd)$/i;

async function readFile(url: string): Promise<string> {
  const response = await chrome.runtime.sendMessage({ type: 'READ_FILE', url }) as { ok: boolean; text?: string; error?: string };
  if (!response?.ok) throw new Error(response?.error ?? 'Unable to read local Markdown file');
  return response.text ?? '';
}

async function main() {
  if (location.protocol !== 'file:' || !EXTENSIONS.test(location.pathname)) return;
  if (document.readyState === 'loading') await new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }));
  const original = document.body?.innerText ?? '';
  let markdown = original;
  try { markdown = await readFile(location.href.split('#')[0]!); } catch { /* browser body text remains useful fallback */ }
  document.documentElement.classList.add('mdr-active');
  document.head.querySelector('meta[name="viewport"]')?.remove();
  const viewport = document.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width,initial-scale=1'; document.head.append(viewport);
  document.body.replaceChildren();
  const host = document.createElement('div'); document.body.append(host);
  const sourceUrl = location.href.split('#')[0]!;
  await mountReader(host, markdown, { sourceUrl, title: decodeURIComponent(location.pathname.split('/').pop() || 'Markdown'), onReload: () => readFile(sourceUrl) });
  if (location.hash) requestAnimationFrame(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());
  let previous = markdown;
  let refreshing = false;
  setInterval(async () => {
    if (document.hidden || refreshing) return;
    refreshing = true;
    try {
      const latest = await readFile(sourceUrl);
      if (latest !== previous) {
        previous = latest;
        await mountReader(host, latest, {
          sourceUrl,
          title: decodeURIComponent(location.pathname.split('/').pop() || 'Markdown'),
          onReload: () => readFile(sourceUrl),
        });
      }
    } catch {
      // Keep the current render if an editor replaces the file atomically.
    } finally {
      refreshing = false;
    }
  }, 1500);
}

void main().catch((error) => console.error('[Markdown Reader]', error));

