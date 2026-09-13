function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function safeName(title: string, ext: string) {
  return `${title.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'document'}.${ext}`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}

async function inlineImages(root: HTMLElement) {
  for (const image of Array.from(root.querySelectorAll<HTMLImageElement>('img'))) {
    const src = image.src; if (!src || src.startsWith('data:')) continue;
    try { image.src = await blobToDataUrl(await (await fetch(src)).blob()); } catch { image.alt = `${image.alt || 'image'} (resource unavailable in offline export)`; image.removeAttribute('src'); }
  }
}

export async function exportOfflineHtml(article: HTMLElement, title: string) {
  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.mdr-diagram-tools').forEach((node) => node.remove());
  await inlineImages(clone);
  const css = `body{margin:0;background:#fff;color:#24292f;font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.doc{max-width:980px;margin:0 auto;padding:48px}pre{overflow:auto;padding:16px;background:#f6f8fa;border-radius:8px}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}table{border-collapse:collapse;width:100%;display:block;overflow:auto}th,td{border:1px solid #d0d7de;padding:8px 12px}img,svg{max-width:100%;height:auto}blockquote{border-left:4px solid #d0d7de;margin-left:0;padding-left:16px;color:#57606a}@media(prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}pre{background:#161b22}th,td{border-color:#30363d}blockquote{border-color:#30363d;color:#8d96a0}}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/[&<>]/g, '')}</title><style>${css}</style></head><body><main class="doc">${clone.innerHTML}</main></body></html>`;
  download(new Blob([html], { type: 'text/html;charset=utf-8' }), safeName(title, 'html'));
}

async function svgToPng(svg: SVGElement): Promise<{ data: Uint8Array; width: number; height: number }> {
  const serialized = new XMLSerializer().serializeToString(svg); const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const box = svg.getBoundingClientRect(); const width = Math.min(1400, Math.max(200, Math.ceil(box.width || 800))); const height = Math.min(1000, Math.max(120, Math.ceil((box.height || 450) * width / Math.max(1, box.width || 800))));
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
    const ctx = canvas.getContext('2d')!; ctx.scale(2, 2); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG encoding failed')), 'image/png'));
    return { data: new Uint8Array(await blob.arrayBuffer()), width, height };
  } finally { URL.revokeObjectURL(url); }
}

export async function exportDocx(article: HTMLElement, title: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun, ExternalHyperlink } = await import('docx');
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
  const headingMap: Record<string, typeof HeadingLevel[keyof typeof HeadingLevel]> = { H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4, H5: HeadingLevel.HEADING_5, H6: HeadingLevel.HEADING_6 };
  const inline = (node: Node, style: { bold?: boolean; italics?: boolean; strike?: boolean; font?: string } = {}): any[] => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [new TextRun({ text: node.textContent, ...style })] : [];
    if (!(node instanceof HTMLElement)) return [];
    const tag = node.tagName;
    if (tag === 'BR') return [new TextRun({ break: 1 })];
    const next = { ...style };
    if (tag === 'STRONG' || tag === 'B') next.bold = true;
    if (tag === 'EM' || tag === 'I') next.italics = true;
    if (tag === 'S' || tag === 'DEL') next.strike = true;
    if (tag === 'CODE') next.font = 'Courier New';
    const runs = Array.from(node.childNodes).flatMap((child) => inline(child, next));
    if (tag === 'A' && node.getAttribute('href')) return [new ExternalHyperlink({ link: node.getAttribute('href')!, children: runs.length ? runs : [new TextRun({ text: node.textContent ?? '', ...next })] })];
    return runs;
  };
  for (const node of Array.from(article.children) as HTMLElement[]) {
    if (headingMap[node.tagName]) { children.push(new Paragraph({ children: inline(node), heading: headingMap[node.tagName], keepNext: true })); continue; }
    if (node.tagName === 'TABLE') {
      const rows = Array.from(node.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')).map((row) => new TableRow({ children: Array.from(row.children).map((cell) => new TableCell({ children: [new Paragraph({ children: inline(cell) })] })) }));
      if (rows.length) children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })); continue;
    }
    if (node.matches('ul,ol')) {
      Array.from(node.querySelectorAll(':scope > li')).forEach((li, index) => children.push(new Paragraph({ children: node.tagName === 'OL' ? [new TextRun({ text: `${index + 1}. ` }), ...inline(li)] : inline(li), ...(node.tagName === 'UL' ? { bullet: { level: 0 } } : {}) }))); continue;
    }
    const svg = node.matches('.mdr-diagram') ? node.querySelector<SVGElement>('svg') : null;
    if (svg) {
      try { const png = await svgToPng(svg); children.push(new Paragraph({ children: [new ImageRun({ data: png.data, transformation: { width: png.width, height: png.height }, type: 'png' })] })); }
      catch { children.push(new Paragraph({ text: '[Diagram export unavailable]' })); }
      continue;
    }
    if (node.tagName === 'PRE') { children.push(new Paragraph({ children: [new TextRun({ text: node.textContent ?? '', font: 'Courier New' })], spacing: { before: 120, after: 120 } })); continue; }
    if (node.tagName === 'BLOCKQUOTE') { children.push(new Paragraph({ children: inline(node, { italics: true }), indent: { left: 360 }, border: { left: { color: 'AAB2BD', size: 12, style: 'single', space: 8 } } })); continue; }
    const text = node.textContent?.trim(); if (text) children.push(new Paragraph({ children: inline(node), spacing: { after: 120 } }));
  }
  const doc = new Document({
    creator: 'Markdown Reader Pro', title,
    sections: [{ properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } }, children }],
  });
  download(await Packer.toBlob(doc), safeName(title, 'docx'));
}

export function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export async function exportEpub(article: HTMLElement, title: string) {
  const { zipSync, strToU8 } = await import('fflate');
  const clone = article.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.mdr-diagram-tools').forEach((node) => node.remove());
  await inlineImages(clone);
  const bookId = crypto.randomUUID();
  const safeTitle = escapeXml(title || 'Markdown document');
  const css = `body{font:1em/1.65 sans-serif;color:#222}main{max-width:48em;margin:auto}pre{white-space:pre-wrap;background:#f5f5f5;padding:1em}table{border-collapse:collapse;width:100%}th,td{border:1px solid #aaa;padding:.4em}img,svg{max-width:100%;height:auto}blockquote{border-left:.25em solid #aaa;padding-left:1em;color:#555}`;
  const content = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${safeTitle}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head><body><main>${clone.innerHTML}</main></body></html>`;
  const nav = `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Navigation</title></head><body><nav epub:type="toc"><h1>${safeTitle}</h1><ol><li><a href="content.xhtml">${safeTitle}</a></li></ol></nav></body></html>`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:${bookId}</dc:identifier><dc:title>${safeTitle}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="css" href="styles.css" media-type="text/css"/></manifest><spine><itemref idref="content"/></spine></package>`;
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const files = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF': { 'container.xml': strToU8(container) },
    OEBPS: {
      'content.opf': strToU8(opf),
      'content.xhtml': strToU8(content),
      'nav.xhtml': strToU8(nav),
      'styles.css': strToU8(css),
    },
  } as never;
  const bytes = zipSync(files);
  download(new Blob([bytes], { type: 'application/epub+zip' }), safeName(title, 'epub'));
}
