function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeName(title: string, ext: string) {
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
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ImageRun } = await import('docx');
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
  const headingMap: Record<string, typeof HeadingLevel[keyof typeof HeadingLevel]> = { H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4, H5: HeadingLevel.HEADING_5, H6: HeadingLevel.HEADING_6 };
  for (const node of Array.from(article.children) as HTMLElement[]) {
    if (headingMap[node.tagName]) { children.push(new Paragraph({ text: node.textContent ?? '', heading: headingMap[node.tagName] })); continue; }
    if (node.tagName === 'TABLE') {
      const rows = Array.from(node.querySelectorAll(':scope > thead > tr, :scope > tbody > tr, :scope > tr')).map((row) => new TableRow({ children: Array.from(row.children).map((cell) => new TableCell({ children: [new Paragraph({ text: cell.textContent ?? '' })] })) }));
      if (rows.length) children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })); continue;
    }
    if (node.matches('ul,ol')) {
      Array.from(node.querySelectorAll(':scope > li')).forEach((li) => children.push(new Paragraph({ text: li.textContent ?? '', bullet: { level: 0 } }))); continue;
    }
    const svg = node.matches('.mdr-diagram') ? node.querySelector<SVGElement>('svg') : null;
    if (svg) {
      try { const png = await svgToPng(svg); children.push(new Paragraph({ children: [new ImageRun({ data: png.data, transformation: { width: png.width, height: png.height }, type: 'png' })] })); }
      catch { children.push(new Paragraph({ text: '[Diagram export unavailable]' })); }
      continue;
    }
    if (node.tagName === 'PRE') { children.push(new Paragraph({ children: [new TextRun({ text: node.textContent ?? '', font: 'Courier New' })] })); continue; }
    const text = node.textContent?.trim(); if (text) children.push(new Paragraph({ text }));
  }
  const doc = new Document({ sections: [{ children }] });
  download(await Packer.toBlob(doc), safeName(title, 'docx'));
}
