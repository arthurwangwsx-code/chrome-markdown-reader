import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import katex from 'katex';
import * as echarts from 'echarts';
import embed from 'vega-embed';
import { expressionInterpreter } from 'vega-interpreter';
import { instance as vizInstance } from '@viz-js/viz';
import { textToDrawioXml } from '@markdown-viewer/draw-uml';
import { convert as drawioToSvg } from '@markdown-viewer/drawio2svg';

export type Heading = { level: number; text: string; id: string };

export type RenderResult = {
  html: string;
  headings: Heading[];
};

function mathPlugin(md: MarkdownIt) {
  md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
    if (state.src[state.pos] !== '$' || state.src[state.pos + 1] === '$') return false;
    let end = state.pos + 1;
    while ((end = state.src.indexOf('$', end)) >= 0) {
      if (state.src[end - 1] !== '\\') break;
      end += 1;
    }
    if (end < 0 || end === state.pos + 1) return false;
    if (!silent) {
      const token = state.push('math_inline', 'math', 0);
      token.content = state.src.slice(state.pos + 1, end);
    }
    state.pos = end + 1;
    return true;
  });
  md.block.ruler.after('blockquote', 'math_block', (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine]! + state.tShift[startLine]!;
    const max = state.eMarks[startLine]!;
    const first = state.src.slice(start, max);
    if (!first.trimStart().startsWith('$$')) return false;
    if (silent) return true;
    let next = startLine;
    let content = first.slice(first.indexOf('$$') + 2);
    if (content.includes('$$')) content = content.slice(0, content.indexOf('$$'));
    else {
      const parts: string[] = [content];
      for (next = startLine + 1; next < endLine; next++) {
        const line = state.src.slice(state.bMarks[next]! + state.tShift[next]!, state.eMarks[next]!);
        const close = line.indexOf('$$');
        if (close >= 0) { parts.push(line.slice(0, close)); break; }
        parts.push(line);
      }
      content = parts.join('\n');
    }
    const token = state.push('math_block', 'math', 0);
    token.block = true;
    token.content = content.trim();
    token.map = [startLine, next + 1];
    state.line = next + 1;
    return true;
  });
  md.renderer.rules.math_inline = (tokens, idx) => katex.renderToString(tokens[idx]!.content, { throwOnError: false, trust: false, strict: 'warn' });
  md.renderer.rules.math_block = (tokens, idx) => `<div class="mdr-math-block">${katex.renderToString(tokens[idx]!.content, { displayMode: true, throwOnError: false, trust: false, strict: 'warn' })}</div>`;
}

const DIAGRAM_LANGS = new Set([
  'mermaid', 'dot', 'graphviz', 'vega', 'vega-lite', 'vegalite', 'echarts',
  'plantuml', 'puml', 'drawio',
]);

function slugify(text: string, used: Map<string, number>): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '') || 'section';
  const seen = used.get(base) ?? 0;
  used.set(base, seen + 1);
  return seen ? `${base}-${seen + 1}` : base;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function toBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function renderMarkdown(source: string): RenderResult {
  const headings: Heading[] = [];
  const used = new Map<string, number>();
  const md: MarkdownIt = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(code, lang) {
      if (DIAGRAM_LANGS.has(lang.toLowerCase())) return '';
      try {
        if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
        return hljs.highlightAuto(code).value;
      } catch {
        return code.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
      }
    },
  });
  md.use(footnote as never).use(taskLists as never, { enabled: true }).use(mathPlugin);

  const defaultHeadingOpen = md.renderer.rules.heading_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const inline = tokens[idx + 1];
    const level = Number(token.tag.slice(1));
    const text = inline?.content ?? '';
    const id = slugify(text, used);
    token.attrSet('id', id);
    headings.push({ level, text, id });
    return defaultHeadingOpen(tokens, idx, options, env, self);
  };

  const defaultFence = md.renderer.rules.fence ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]!;
    const lang = token.info.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
    if (!DIAGRAM_LANGS.has(lang)) return defaultFence(tokens, idx, options, env, self);
    const encoded = escapeAttr(toBase64Utf8(token.content));
    return `<div class="mdr-diagram" data-diagram="${escapeAttr(lang)}" data-source="${encoded}"><div class="mdr-empty">Rendering ${escapeAttr(lang)}…</div></div>`;
  };

  const raw = md.render(source);
  const html = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_ATTR: ['target', 'rel', 'data-diagram', 'data-source', 'aria-label'],
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['srcdoc'],
  });
  return { html, headings };
}

function safeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'iframe'],
    FORBID_ATTR: ['onload', 'onclick', 'onerror'],
  });
}

let mermaidReady = false;
async function renderMermaid(el: HTMLElement, code: string, dark: boolean) {
  if (!mermaidReady) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      flowchart: { htmlLabels: false },
    });
    mermaidReady = true;
  }
  const id = `mdr-mermaid-${crypto.randomUUID().replace(/-/g, '')}`;
  const { svg } = await mermaid.render(id, code);
  el.innerHTML = safeSvg(svg);
}

async function renderDot(el: HTMLElement, code: string) {
  const viz = await vizInstance();
  const svg = viz.renderString(code, { format: 'svg', engine: 'dot' });
  el.innerHTML = safeSvg(svg);
}

async function renderVega(el: HTMLElement, code: string, mode: 'vega' | 'vega-lite') {
  const spec = JSON.parse(code) as Record<string, unknown>;
  if (containsRemoteReference(spec)) throw new Error('Remote URLs are disabled inside Vega specs');
  const target = document.createElement('div');
  el.replaceChildren(target);
  await embed(target, spec, {
    mode,
    actions: true,
    renderer: 'svg',
    expr: expressionInterpreter,
    loader: { http: { credentials: 'omit' } },
  } as never);
}

async function renderEcharts(el: HTMLElement, code: string, dark: boolean) {
  const option = JSON.parse(code) as echarts.EChartsCoreOption;
  if (containsRemoteReference(option)) throw new Error('Remote URLs are disabled inside ECharts options');
  const host = document.createElement('div');
  host.style.width = '100%';
  host.style.height = '480px';
  el.replaceChildren(host);
  const chart = echarts.init(host, dark ? 'dark' : undefined, { renderer: 'svg' });
  chart.setOption(option);
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(host);
}

async function renderPlantUml(el: HTMLElement, code: string) {
  if (/!include(?:url)?\b/i.test(code)) throw new Error('PlantUML include directives are disabled in local-first mode');
  const xml = await textToDrawioXml(code);
  el.innerHTML = safeSvg(drawioToSvg(xml));
}

async function renderDrawio(el: HTMLElement, code: string) {
  el.innerHTML = safeSvg(drawioToSvg(code));
}

function containsRemoteReference(value: unknown, depth = 0): boolean {
  if (depth > 20) return false;
  if (typeof value === 'string') return /^https?:\/\//i.test(value.trim());
  if (Array.isArray(value)) return value.some((item) => containsRemoteReference(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((item) => containsRemoteReference(item, depth + 1));
  }
  return false;
}

function installDiagramTools(el: HTMLElement, code: string) {
  const tools = document.createElement('div');
  tools.className = 'mdr-diagram-tools';
  const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy';
  copy.addEventListener('click', async () => { await navigator.clipboard.writeText(code); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1200); });
  const full = document.createElement('button'); full.type = 'button'; full.textContent = 'Full screen';
  full.addEventListener('click', () => { if (document.fullscreenElement === el) void document.exitFullscreen(); else void el.requestFullscreen(); });
  const svgButton = document.createElement('button'); svgButton.type = 'button'; svgButton.textContent = 'SVG';
  svgButton.addEventListener('click', () => {
    const svg = el.querySelector('svg'); if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'diagram.svg'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const pngButton = document.createElement('button'); pngButton.type = 'button'; pngButton.textContent = 'PNG';
  pngButton.addEventListener('click', async () => {
    const svg = el.querySelector('svg'); if (!svg) return;
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      const box = svg.getBoundingClientRect();
      canvas.width = Math.max(1, Math.ceil(box.width * devicePixelRatio));
      canvas.height = Math.max(1, Math.ceil(box.height * devicePixelRatio));
      const ctx = canvas.getContext('2d')!; ctx.scale(devicePixelRatio, devicePixelRatio); ctx.drawImage(image, 0, 0, box.width, box.height);
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (png) { const pngUrl = URL.createObjectURL(png); const a = document.createElement('a'); a.href = pngUrl; a.download = 'diagram.png'; a.click(); setTimeout(() => URL.revokeObjectURL(pngUrl), 1000); }
    } finally { URL.revokeObjectURL(url); }
  });
  let scale = 1;
  const zoomOut = document.createElement('button'); zoomOut.type = 'button'; zoomOut.textContent = '−';
  const zoomIn = document.createElement('button'); zoomIn.type = 'button'; zoomIn.textContent = '+';
  const setScale = (next: number) => { scale = Math.min(3, Math.max(.5, next)); const svg = el.querySelector<SVGElement>('svg'); if (svg) svg.style.width = `${scale * 100}%`; };
  zoomOut.addEventListener('click', () => setScale(scale - .25)); zoomIn.addEventListener('click', () => setScale(scale + .25));
  tools.append(copy, zoomOut, zoomIn, full, svgButton, pngButton); el.prepend(tools);
}

export async function hydrateDiagrams(root: ParentNode): Promise<void> {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const items = Array.from(root.querySelectorAll<HTMLElement>('.mdr-diagram[data-diagram]'));
  const queue = items.map(async (el) => {
    const lang = el.dataset.diagram ?? '';
    const code = fromBase64Utf8(el.dataset.source ?? '');
    if (code.length > 300_000) {
      el.innerHTML = '<div class="mdr-diagram-error">Diagram is larger than the 300 KB safety budget.</div>';
      return;
    }
    try {
      switch (lang) {
        case 'mermaid': await renderMermaid(el, code, dark); break;
        case 'dot': case 'graphviz': await renderDot(el, code); break;
        case 'vega': await renderVega(el, code, 'vega'); break;
        case 'vega-lite': case 'vegalite': await renderVega(el, code, 'vega-lite'); break;
        case 'echarts': await renderEcharts(el, code, dark); break;
        case 'plantuml': case 'puml': await renderPlantUml(el, code); break;
        case 'drawio': await renderDrawio(el, code); break;
        default: throw new Error(`Unsupported diagram language: ${lang}`);
      }
      installDiagramTools(el, code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      el.textContent = '';
      const box = document.createElement('div');
      box.className = 'mdr-diagram-error';
      box.textContent = `${lang}: ${message}`;
      el.append(box);
    }
  });
  await Promise.allSettled(queue);
}

