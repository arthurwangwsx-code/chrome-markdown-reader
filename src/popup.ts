const statusEl = document.getElementById('status')!;
document.getElementById('workspace')!.addEventListener('click', () => { void chrome.runtime.openOptionsPage(); window.close(); });
document.getElementById('permission')!.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'CHECK_FILE_ACCESS' }) as { allowed?: boolean };
  statusEl.textContent = response.allowed ? '已允许读取 file:// 文档。' : '尚未开启“允许访问文件网址”，请在扩展详情页开启。';
});

