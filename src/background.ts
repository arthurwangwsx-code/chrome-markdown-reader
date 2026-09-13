type Message = { type: 'READ_FILE'; url: string } | { type: 'CHECK_FILE_ACCESS' };

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  if (message.type === 'CHECK_FILE_ACCESS') {
    chrome.extension.isAllowedFileSchemeAccess((allowed) => sendResponse({ ok: true, allowed }));
    return true;
  }
  if (message.type === 'READ_FILE') {
    const senderUrl = sender.tab?.url ?? sender.url ?? '';
    if (!message.url.startsWith('file://') || (senderUrl && !senderUrl.startsWith('file://') && !senderUrl.startsWith(chrome.runtime.getURL('')))) {
      sendResponse({ ok: false, error: 'Rejected file request origin' });
      return false;
    }
    void fetch(message.url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Unable to read local file (${response.status})`);
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > 20 * 1024 * 1024) throw new Error('File exceeds the 20 MB reader limit');
        sendResponse({ ok: true, text: new TextDecoder('utf-8').decode(buffer) });
      })
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }
  return false;
});

chrome.action.onClicked?.addListener(() => { void chrome.runtime.openOptionsPage(); });

