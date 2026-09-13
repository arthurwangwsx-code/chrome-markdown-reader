import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import katex from 'katex';

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
  'plantuml', 'puml', 'drawio', 'canvas', 'jsoncanvas', 'infographic',
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

export function renderMarkdown(source: string, sharedUsed?: Map<string, number>): RenderResult {
  const headings: Heading[] = [];
  const used = sharedUsed ?? new Map<string, number>();
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
  const mermaid = (await import('mermaid')).default;
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
  const { instance: vizInstance } = await import('@viz-js/viz');
  const viz = await vizInstance();
  const svg = viz.renderString(code, { format: 'svg', engine: 'dot' });
  el.innerHTML = safeSvg(svg);
}

async function renderVega(el: HTMLElement, code: string, mode: 'vega' | 'vega-lite') {
  const [{ default: embed }, { expressionInterpreter }] = await Promise.all([import('vega-embed'), import('vega-interpreter')]);
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
  const echarts = await import('echarts');
  const option = JSON.parse(code) as Record<string, unknown>;
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
  const [{ textToDrawioXml }, { convert: drawioToSvg }] = await Promise.all([import('@markdown-viewer/draw-uml'), import('@markdown-viewer/drawio2svg')]);
  const xml = await textToDrawioXml(code);
  el.innerHTML = safeSvg(drawioToSvg(xml));
}

async function renderDrawio(el: HTMLElement, code: string) {
  const { convert: drawioToSvg } = await import('@markdown-viewer/drawio2svg');
  el.innerHTML = safeSvg(drawioToSvg(code));
}

type CanvasNode = {
  id: string; type?: string; x: number; y: number; width: number; height: number;
  text?: string; file?: string; url?: string; color?: string; label?: string;
};
type CanvasEdge = { id?: string; fromNode: string; toNode: string; label?: string; color?: string };

function svgElement<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function appendWrappedText(parent: SVGElement, text: string, x: number, y: number, width: number) {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const max = Math.max(8, Math.floor(width / 8));
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  lines.slice(0, 8).forEach((value, index) => {
    const t = svgElement('text', { x, y: y + index * 19, 'font-size': 14, fill: 'currentColor' });
    t.textContent = value; parent.append(t);
  });
}

async function renderJsonCanvas(el: HTMLElement, code: string, dark: boolean) {
  const parsed = JSON.parse(code) as { nodes?: CanvasNode[]; edges?: CanvasEdge[] };
  const nodes = parsed.nodes ?? [];
  const edges = parsed.edges ?? [];
  if (nodes.length > 1000 || edges.length > 2000) throw new Error('JSON Canvas exceeds the 1000-node / 2000-edge budget');
  const map = new Map(nodes.map((node) => [node.id, node]));
  const minX = Math.min(0, ...nodes.map((n) => n.x)); const minY = Math.min(0, ...nodes.map((n) => n.y));
  const maxX = Math.max(800, ...nodes.map((n) => n.x + n.width)); const maxY = Math.max(500, ...nodes.map((n) => n.y + n.height));
  const pad = 50;
  const svg = svgElement('svg', { viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`, role: 'img' });
  svg.style.color = dark ? '#e6edf3' : '#24292f';
  const defs = svgElement('defs');
  const marker = svgElement('marker', { id: 'mdr-canvas-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: dark ? '#8b949e' : '#57606a' })); defs.append(marker); svg.append(defs);
  for (const edge of edges) {
    const from = map.get(edge.fromNode); const to = map.get(edge.toNode); if (!from || !to) continue;
    const x1 = from.x + from.width / 2, y1 = from.y + from.height / 2, x2 = to.x + to.width / 2, y2 = to.y + to.height / 2;
    svg.append(svgElement('line', { x1, y1, x2, y2, stroke: edge.color || (dark ? '#8b949e' : '#57606a'), 'stroke-width': 2, 'marker-end': 'url(#mdr-canvas-arrow)' }));
    if (edge.label) appendWrappedText(svg, edge.label, (x1 + x2) / 2 + 6, (y1 + y2) / 2 - 6, 160);
  }
  for (const node of nodes) {
    const group = svgElement('g');
    const isGroup = node.type === 'group';
    group.append(svgElement('rect', { x: node.x, y: node.y, width: node.width, height: node.height, rx: isGroup ? 4 : 10,
      fill: isGroup ? 'transparent' : (node.color || (dark ? '#161b22' : '#ffffff')), stroke: node.color || (dark ? '#58a6ff' : '#0969da'), 'stroke-width': isGroup ? 1.5 : 2, 'stroke-dasharray': isGroup ? '7 5' : '' }));
    const label = node.text ?? node.label ?? node.file ?? node.url ?? node.id;
    appendWrappedText(group, label, node.x + 14, node.y + 27, Math.max(40, node.width - 28));
    svg.append(group);
  }
  el.innerHTML = safeSvg(new XMLSerializer().serializeToString(svg));
}

async function renderInfographic(el: HTMLElement, code: string, dark: boolean) {
  if (/https?:\/\//i.test(code)) throw new Error('Remote references are disabled in infographic blocks');
  const { Infographic, setDefaultFont } = await import('@antv/infographic');
  setDefaultFont("-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif");
  const host = document.createElement('div'); host.style.width = '900px'; host.style.maxWidth = '100%'; host.style.minHeight = '560px';
  el.replaceChildren(host);
  const infographic = new Infographic({ container: host, width: 900, height: 600, padding: 24, ...(dark ? { theme: 'dark' } : {}) } as never);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Infographic render timed out')), 12_000);
    infographic.on('rendered', () => { clearTimeout(timer); resolve(); });
    infographic.on('error', (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); });
    try { infographic.render(code); } catch (error) { clearTimeout(timer); reject(error); }
  });
  const dataUrl = await infographic.toDataURL({ type: 'svg', embedResources: true });
  const encoded = dataUrl.split(',', 2)[1] ?? '';
  const svg = dataUrl.includes(';base64,') ? atob(encoded) : decodeURIComponent(encoded);
  infographic.destroy();
  el.innerHTML = safeSvg(svg);
}

export function containsRemoteReference(value: unknown, depth = 0): boolean {
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
        case 'canvas': case 'jsoncanvas': await renderJsonCanvas(el, code, dark); break;
        case 'infographic': await renderInfographic(el, code, dark); break;
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

