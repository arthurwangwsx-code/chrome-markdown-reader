import { mountReader } from './core/ui';
import { smartSearch } from './core/search';
import { classifyWorkspaceFile, isWorkspaceIndexable, resolveWorkspacePath, type WorkspaceFileKind } from './core/workspace-files';

type TreeNode = { name: string; kind: 'file' | 'directory'; path: string; fileKind?: WorkspaceFileKind; handle: FileSystemFileHandle | FileSystemDirectoryHandle; children?: TreeNode[] };
type IndexedDoc = { name: string; path: string; handle: FileSystemFileHandle; text: string; size: number; lastModified: number };
const root = document.getElementById('workspace-root')!;
let currentDirectory: FileSystemDirectoryHandle | undefined;
let indexedDocs: IndexedDoc[] = [];
const previewUrls = new Map<string, string>();

const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', 'coverage']);

function clearPreviewUrls() {
  for (const url of previewUrls.values()) URL.revokeObjectURL(url);
  previewUrls.clear();
}

function fileIcon(kind: WorkspaceFileKind | undefined) {
  if (kind === 'markdown') return 'M';
  if (kind === 'text') return 'T';
  if (kind === 'image') return '▧';
  return '•';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('markdown-reader', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace');
      if (!db.objectStoreNames.contains('index')) db.createObjectStore('index', { keyPath: 'path' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadCachedIndex(): Promise<IndexedDoc[]> {
  const db = await openDb();
  const docs = await new Promise<IndexedDoc[]>((resolve, reject) => {
    const tx = db.transaction('index', 'readonly'); const req = tx.objectStore('index').getAll();
    req.onsuccess = () => resolve((req.result ?? []) as IndexedDoc[]); req.onerror = () => reject(req.error);
  }); db.close(); return docs;
}

async function persistIndex(docs: IndexedDoc[]) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('index', 'readwrite'); const store = tx.objectStore('index'); store.clear(); docs.forEach((doc) => store.put(doc));
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  }); db.close();
}

async function saveLastWorkspace(handle: FileSystemDirectoryHandle) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('workspace', 'readwrite');
    tx.objectStore('workspace').put(handle, 'last');
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadLastWorkspace(): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await openDb();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const tx = db.transaction('workspace', 'readonly');
    const request = tx.objectStore('workspace').get('last');
    request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

async function readDirectory(handle: FileSystemDirectoryHandle, depth = 0, prefix = ''): Promise<TreeNode[]> {
  if (depth > 10) return [];
  const nodes: TreeNode[] = [];
  for await (const [name, child] of handle.entries()) {
    if (ignored.has(name) || name.startsWith('.DS_Store')) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (child.kind === 'file') {
      const fileKind = classifyWorkspaceFile(name);
      if (fileKind !== 'unsupported') nodes.push({ name, kind: 'file', path, fileKind, handle: child });
    }
    if (child.kind === 'directory') nodes.push({ name, kind: 'directory', path, handle: child });
    if (nodes.length > 2000) break;
  }
  return nodes.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1);
}

async function handleForPath(path: string): Promise<FileSystemFileHandle | undefined> {
  if (!currentDirectory) return undefined;
  const segments = path.split('/').filter(Boolean);
  if (!segments.length) return undefined;
  let directory = currentDirectory;
  for (const segment of segments.slice(0, -1)) {
    try { directory = await directory.getDirectoryHandle(segment); } catch { return undefined; }
  }
  try { return await directory.getFileHandle(segments.at(-1)!); } catch { return undefined; }
}

async function workspaceObjectUrl(path: string): Promise<string | undefined> {
  const existing = previewUrls.get(path);
  if (existing) return existing;
  const handle = await handleForPath(path);
  if (!handle) return undefined;
  const file = await handle.getFile();
  const url = URL.createObjectURL(file);
  previewUrls.set(path, url);
  return url;
}

function resourceFrame(title: string, path: string, body: HTMLElement) {
  const articleHost = root.querySelector<HTMLElement>('[data-reader]')!;
  articleHost.innerHTML = `<div class="mdr-resource-reader"><main class="mdr-main"><div class="mdr-toolbar"><span class="mdr-resource-title"></span><span class="mdr-path"></span></div><article class="mdr-article mdr-resource-article"></article></main></div>`;
  articleHost.querySelector<HTMLElement>('.mdr-resource-title')!.textContent = title;
  articleHost.querySelector<HTMLElement>('.mdr-path')!.textContent = path;
  articleHost.querySelector<HTMLElement>('.mdr-resource-article')!.append(body);
}

async function openWorkspaceRef(ref: string, currentPath: string): Promise<boolean> {
  const resolved = resolveWorkspacePath(currentPath, ref);
  if (!resolved) return false;
  const handle = await handleForPath(resolved.path);
  if (!handle) return false;
  await openFile(handle, resolved.path);
  if (resolved.hash) requestAnimationFrame(() => document.getElementById(decodeURIComponent(resolved.hash))?.scrollIntoView());
  return true;
}

async function openFile(handle: FileSystemFileHandle, path = handle.name) {
  clearPreviewUrls();
  const file = await handle.getFile();
  const kind = classifyWorkspaceFile(file.name);
  const articleHost = root.querySelector<HTMLElement>('[data-reader]')!;
  if (kind === 'markdown') {
    if (file.size > 20 * 1024 * 1024) throw new Error('File exceeds the 20 MB reader limit');
    const markdown = await file.text();
    await mountReader(articleHost, markdown, {
      title: file.name,
      sourceLabel: path,
      onReload: async () => (await handle.getFile()).text(),
      resolveAsset: async (ref) => {
        const resolved = resolveWorkspacePath(path, ref);
        if (!resolved || classifyWorkspaceFile(resolved.path) !== 'image') return undefined;
        return workspaceObjectUrl(resolved.path);
      },
      onOpenRelative: (ref) => openWorkspaceRef(ref, path),
    });
    return;
  }
  if (kind === 'text') {
    if (file.size > 20 * 1024 * 1024) throw new Error('File exceeds the 20 MB reader limit');
    const pre = document.createElement('pre'); pre.className = 'mdr-text-preview';
    const code = document.createElement('code'); code.textContent = await file.text(); pre.append(code);
    resourceFrame(file.name, path, pre);
    return;
  }
  if (kind === 'image') {
    if (file.size > 50 * 1024 * 1024) throw new Error('Image exceeds the 50 MB preview limit');
    const figure = document.createElement('figure'); figure.className = 'mdr-image-preview';
    const image = document.createElement('img'); image.alt = file.name; image.src = URL.createObjectURL(file); previewUrls.set(path, image.src);
    const caption = document.createElement('figcaption'); caption.textContent = `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`;
    figure.append(image, caption); resourceFrame(file.name, path, figure);
  }
}

async function renderTree(container: HTMLElement, nodes: TreeNode[], level = 0) {
  container.innerHTML = '';
  for (const node of nodes) {
    const row = document.createElement('div'); row.className = 'mdr-tree-row'; row.dataset.kind = node.kind;
    const button = document.createElement('button'); button.style.paddingLeft = `${8 + level * 14}px`; button.textContent = `${node.kind === 'directory' ? '▸' : fileIcon(node.fileKind)} ${node.name}`;
    button.title = node.path;
    row.append(button); container.append(row);
    if (node.kind === 'file') button.addEventListener('click', () => void openFile(node.handle as FileSystemFileHandle, node.path));
    else button.addEventListener('click', async () => {
      const child = document.createElement('div'); row.after(child);
      node.children ??= await readDirectory(node.handle as FileSystemDirectoryHandle, level + 1, node.path);
      button.textContent = `▾ ${node.name}`;
      await renderTree(child, node.children, level + 1);
    }, { once: true });
  }
}

async function activateWorkspace(handle: FileSystemDirectoryHandle, persist = true) {
  clearPreviewUrls();
  currentDirectory = handle;
  if (persist) await saveLastWorkspace(currentDirectory);
  const name = root.querySelector<HTMLElement>('[data-workspace-name]');
  if (name) name.textContent = currentDirectory.name;
  const tree = root.querySelector<HTMLElement>('[data-tree]')!;
  await renderTree(tree, await readDirectory(currentDirectory));
  indexedDocs = [];
}

async function chooseFolder() {
  await activateWorkspace(await window.showDirectoryPicker({ mode: 'read' }));
}

async function collectDocs(handle: FileSystemDirectoryHandle, cached: Map<string, IndexedDoc>, prefix = '', budget = { files: 0, bytes: 0 }): Promise<void> {
  if (budget.files >= 1500 || budget.bytes >= 50 * 1024 * 1024) return;
  for await (const [name, child] of handle.entries()) {
    if (ignored.has(name) || name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (child.kind === 'directory') {
      await collectDocs(child, cached, path, budget);
      if (budget.files >= 1500 || budget.bytes >= 50 * 1024 * 1024) break;
    } else if (isWorkspaceIndexable(name)) {
      const file = await child.getFile();
      if (file.size > 2 * 1024 * 1024 || budget.bytes + file.size > 50 * 1024 * 1024) continue;
      const previous = cached.get(path);
      const text = previous && previous.size === file.size && previous.lastModified === file.lastModified ? previous.text : await file.text();
      indexedDocs.push({ name, path, handle: child, text, size: file.size, lastModified: file.lastModified });
      budget.files += 1; budget.bytes += file.size;
    }
  }
}

async function buildIndex() {
  if (!currentDirectory) return;
  indexedDocs = [];
  const button = document.querySelector<HTMLButtonElement>('#index-workspace')!;
  button.disabled = true; button.textContent = 'Indexing…';
  try {
    const cached = new Map((await loadCachedIndex()).map((doc) => [doc.path, doc]));
    await collectDocs(currentDirectory, cached);
    await persistIndex(indexedDocs);
    button.textContent = `Indexed ${indexedDocs.length}`;
  }
  finally { button.disabled = false; }
}

function renderSearchResults(query: string) {
  if (!query.trim() || !indexedDocs.length) return;
  const matches = smartSearch(query, indexedDocs, 100);
  const tree = root.querySelector<HTMLElement>('[data-tree]')!;
  tree.innerHTML = '';
  for (const hit of matches) {
    const button = document.createElement('button'); button.className = 'mdr-search-hit';
    const title = document.createElement('strong'); title.textContent = hit.doc.path;
    const excerpt = document.createElement('span'); excerpt.textContent = hit.snippet;
    button.append(title, excerpt);
    button.addEventListener('click', () => void openFile(hit.doc.handle, hit.doc.path)); tree.append(button);
  }
  if (!matches.length) tree.innerHTML = '<div class="mdr-empty">No matches</div>';
}

root.innerHTML = `<div class="mdr-workspace-shell"><aside class="mdr-file-sidebar"><div class="mdr-brand">Project Files</div><div class="mdr-workspace-name" data-workspace-name>未选择文件夹</div><button id="choose-folder">选择文件夹</button><button id="resume-workspace" hidden>恢复上次工作区</button><button id="index-workspace">建立增量索引</button><input class="mdr-search" placeholder="搜索 Markdown / TXT 内容" data-search><div class="mdr-tree" data-tree><div class="mdr-empty">选择或拖入一个项目目录。支持 Markdown、TXT/常见文本和图片预览。</div></div></aside><main class="mdr-workspace-main"><div data-reader><div class="mdr-empty">左侧管理文件，Markdown 标题导航会显示在右侧。</div></div></main></div>`;
document.getElementById('choose-folder')!.addEventListener('click', () => void chooseFolder());
document.getElementById('index-workspace')!.addEventListener('click', () => void buildIndex());
root.addEventListener('dragover', (event) => event.preventDefault());
root.addEventListener('drop', (event) => {
  event.preventDefault();
  void (async () => {
    const item = event.dataTransfer?.items?.[0];
    const fileSystemHandle = await item?.getAsFileSystemHandle?.();
    if (fileSystemHandle?.kind === 'directory') {
      await activateWorkspace(fileSystemHandle as FileSystemDirectoryHandle);
      return;
    }
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    clearPreviewUrls();
    const kind = classifyWorkspaceFile(file.name);
    if (kind === 'markdown') {
      await mountReader(root.querySelector<HTMLElement>('[data-reader]')!, await file.text(), { title: file.name, sourceLabel: file.name });
    } else if (kind === 'text') {
      const pre = document.createElement('pre'); pre.className = 'mdr-text-preview';
      const code = document.createElement('code'); code.textContent = await file.text(); pre.append(code);
      resourceFrame(file.name, file.name, pre);
    } else if (kind === 'image') {
      const figure = document.createElement('figure'); figure.className = 'mdr-image-preview';
      const image = document.createElement('img'); image.alt = file.name; image.src = URL.createObjectURL(file); previewUrls.set(file.name, image.src);
      figure.append(image); resourceFrame(file.name, file.name, figure);
    }
  })();
});
root.querySelector<HTMLInputElement>('[data-search]')!.addEventListener('input', (event) => {
  const query = (event.currentTarget as HTMLInputElement).value.toLowerCase();
  if (indexedDocs.length && query.trim().length >= 2) { renderSearchResults(query); return; }
  root.querySelectorAll<HTMLElement>('.mdr-tree-row').forEach((row) => { row.style.display = !query || row.textContent?.toLowerCase().includes(query) ? '' : 'none'; });
});

void loadLastWorkspace().then(async (handle) => {
  if (!handle) return;
  const permission = await handle.queryPermission({ mode: 'read' });
  if (permission === 'granted') {
    await activateWorkspace(handle, false);
    indexedDocs = await loadCachedIndex();
  } else {
    const resume = document.querySelector<HTMLButtonElement>('#resume-workspace')!; resume.hidden = false;
    resume.addEventListener('click', async () => {
      if (await handle.requestPermission({ mode: 'read' }) === 'granted') {
        resume.hidden = true;
        await activateWorkspace(handle, false);
      }
    });
  }
}).catch(() => undefined);

declare global {
  interface Window { showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>; }
  interface FileSystemHandle { queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>; requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>; }
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
    getDirectoryHandle(name: string): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string): Promise<FileSystemFileHandle>;
  }
  interface DataTransferItem { getAsFileSystemHandle?(): Promise<FileSystemHandle | null>; }
}

