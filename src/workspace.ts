import { mountReader } from './core/ui';
import { smartSearch } from './core/search';

type TreeNode = { name: string; kind: 'file' | 'directory'; handle: FileSystemFileHandle | FileSystemDirectoryHandle; children?: TreeNode[] };
type IndexedDoc = { name: string; path: string; handle: FileSystemFileHandle; text: string; size: number; lastModified: number };
const root = document.getElementById('workspace-root')!;
let currentDirectory: FileSystemDirectoryHandle | undefined;
let indexedDocs: IndexedDoc[] = [];

const ignored = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache', 'coverage']);
const mdExt = /\.(?:md|markdown|mdown|mkd)$/i;

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

async function readDirectory(handle: FileSystemDirectoryHandle, depth = 0): Promise<TreeNode[]> {
  if (depth > 10) return [];
  const nodes: TreeNode[] = [];
  for await (const [name, child] of handle.entries()) {
    if (ignored.has(name) || name.startsWith('.DS_Store')) continue;
    if (child.kind === 'file' && mdExt.test(name)) nodes.push({ name, kind: 'file', handle: child });
    if (child.kind === 'directory') nodes.push({ name, kind: 'directory', handle: child });
    if (nodes.length > 2000) break;
  }
  return nodes.sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1);
}

async function openFile(handle: FileSystemFileHandle) {
  const file = await handle.getFile();
  if (file.size > 20 * 1024 * 1024) throw new Error('File exceeds the 20 MB reader limit');
  const markdown = await file.text();
  const articleHost = root.querySelector<HTMLElement>('[data-reader]')!;
  await mountReader(articleHost, markdown, { title: file.name, onReload: async () => (await handle.getFile()).text() });
}

async function renderTree(container: HTMLElement, nodes: TreeNode[], level = 0) {
  container.innerHTML = '';
  for (const node of nodes) {
    const row = document.createElement('div'); row.className = 'mdr-tree-row'; row.dataset.kind = node.kind;
    const button = document.createElement('button'); button.style.paddingLeft = `${8 + level * 14}px`; button.textContent = `${node.kind === 'directory' ? '▸' : '•'} ${node.name}`;
    row.append(button); container.append(row);
    if (node.kind === 'file') button.addEventListener('click', () => void openFile(node.handle as FileSystemFileHandle));
    else button.addEventListener('click', async () => {
      const child = document.createElement('div'); row.after(child);
      node.children ??= await readDirectory(node.handle as FileSystemDirectoryHandle, level + 1);
      button.textContent = `▾ ${node.name}`;
      await renderTree(child, node.children, level + 1);
    }, { once: true });
  }
}

async function chooseFolder() {
  currentDirectory = await window.showDirectoryPicker({ mode: 'read' });
  await saveLastWorkspace(currentDirectory);
  const tree = root.querySelector<HTMLElement>('[data-tree]')!;
  await renderTree(tree, await readDirectory(currentDirectory));
  indexedDocs = [];
}

async function collectDocs(handle: FileSystemDirectoryHandle, cached: Map<string, IndexedDoc>, prefix = '', budget = { files: 0, bytes: 0 }): Promise<void> {
  if (budget.files >= 1500 || budget.bytes >= 50 * 1024 * 1024) return;
  for await (const [name, child] of handle.entries()) {
    if (ignored.has(name) || name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (child.kind === 'directory') {
      await collectDocs(child, cached, path, budget);
      if (budget.files >= 1500 || budget.bytes >= 50 * 1024 * 1024) break;
    } else if (mdExt.test(name)) {
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
    button.addEventListener('click', () => void openFile(hit.doc.handle)); tree.append(button);
  }
  if (!matches.length) tree.innerHTML = '<div class="mdr-empty">No matches</div>';
}

root.innerHTML = `<div class="mdr-shell"><aside class="mdr-sidebar"><div class="mdr-brand">Markdown Workspace</div><button id="choose-folder">选择文件夹</button><button id="resume-workspace" hidden>恢复上次工作区</button><button id="index-workspace">建立增量索引</button><input class="mdr-search" placeholder="智能搜索：标题 / 路径 / 内容" data-search><div class="mdr-tree" data-tree><div class="mdr-empty">选择一个目录开始阅读</div></div></aside><main class="mdr-main"><div data-reader><div class="mdr-empty">支持拖放 Markdown 文件，或从左侧打开工作区。</div></div></main></div>`;
document.getElementById('choose-folder')!.addEventListener('click', () => void chooseFolder());
document.getElementById('index-workspace')!.addEventListener('click', () => void buildIndex());
root.addEventListener('dragover', (event) => event.preventDefault());
root.addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files?.[0];
  if (!file || !mdExt.test(file.name)) return;
  void file.text().then((text) => mountReader(root.querySelector<HTMLElement>('[data-reader]')!, text, { title: file.name }));
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
    currentDirectory = handle;
    await renderTree(root.querySelector<HTMLElement>('[data-tree]')!, await readDirectory(handle));
    indexedDocs = await loadCachedIndex();
  } else {
    const resume = document.querySelector<HTMLButtonElement>('#resume-workspace')!; resume.hidden = false;
    resume.addEventListener('click', async () => {
      if (await handle.requestPermission({ mode: 'read' }) === 'granted') {
        currentDirectory = handle; resume.hidden = true;
        await renderTree(root.querySelector<HTMLElement>('[data-tree]')!, await readDirectory(handle));
      }
    });
  }
}).catch(() => undefined);

declare global {
  interface Window { showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>; }
  interface FileSystemHandle { queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>; requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>; }
  interface FileSystemDirectoryHandle { entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>; }
}

